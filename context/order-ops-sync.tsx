'use client';

import {
	ORDER_OPS_CHANNEL,
	OrderOpsPresenceData,
	OrderOpsSnapshot,
	SyncRequestMessage,
	SyncResponseMessage,
	StateDeltaMessage,
} from '@/src/models/order_ops';
import { getStableDeviceId, getOrderOpsMeta } from '@/src/utils/order_ops_meta';
import {
	handleStateDelta,
	handleSyncRequest,
	handleSyncResponse,
	maybeRequestSyncFromPeers,
	registerOrderOpsPresenceUpdater,
	registerOrderOpsPublisher,
	resetSyncRequestCooldown,
	unregisterOrderOpsPresenceUpdater,
	unregisterOrderOpsPublisher,
	type PresenceMember,
} from '@/src/utils/order_ops_sync';
import Ably, { PresenceMessage, Realtime, RealtimeChannel } from 'ably';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react';

export type OrderOpsConnectionState =
	| 'idle'
	| 'connecting'
	| 'connected'
	| 'failed';

type OrderOpsSyncContextValue = {
	connected: boolean;
	connectionState: OrderOpsConnectionState;
	memberCount: number;
	deviceId: string;
	channelName: string;
	stateVersion: number | null;
	businessDate: string | null;
	error: string | null;
	connect: () => Promise<void>;
};

const OrderOpsSyncContext = createContext<OrderOpsSyncContextValue>({
	connected: false,
	connectionState: 'idle',
	memberCount: 0,
	deviceId: '',
	channelName: ORDER_OPS_CHANNEL,
	stateVersion: null,
	businessDate: null,
	error: null,
	connect: async () => undefined,
});

export function useOrderOpsSync() {
	return useContext(OrderOpsSyncContext);
}

function mapPresenceMembers(members: PresenceMessage[]): PresenceMember[] {
	return members.map((member) => ({
		clientId: member.clientId,
		timestamp: member.timestamp ?? 0,
		data: member.data as Record<string, unknown> | undefined,
	}));
}

async function requestSyncFromPeers(
	channel: RealtimeChannel,
	members: PresenceMember[],
	selfClientId: string
) {
	await maybeRequestSyncFromPeers(
		async (payload) => {
			await channel.publish('sync:request', payload);
		},
		members,
		selfClientId
	);
}

async function updateChannelPresence(
	channel: RealtimeChannel,
	snapshot: OrderOpsSnapshot
) {
	const data: OrderOpsPresenceData = {
		deviceId: snapshot.deviceId,
		stateVersion: snapshot.stateVersion,
		businessDate: snapshot.businessDate,
	};

	try {
		await channel.presence.update(data);
	} catch {
		await channel.presence.enter(data);
	}
}

function safeTeardownAbly(
	realtime: Realtime | null,
	channel: RealtimeChannel | null
): void {
	if (channel) {
		try {
			channel.unsubscribe();
		} catch {
			// Channel may already be detached during hot reload / Strict Mode.
		}
	}

	if (!realtime) {
		return;
	}

	const connectionState = realtime.connection.state;
	if (
		connectionState === 'closed' ||
		connectionState === 'closing'
	) {
		return;
	}

	try {
		realtime.close();
	} catch {
		// Ably can throw if the connection is already closed.
	}
}

export function OrderOpsSyncProvider({ children }: { children: ReactNode }) {
	const [connectionState, setConnectionState] =
		useState<OrderOpsConnectionState>('idle');
	const [memberCount, setMemberCount] = useState(0);
	const [stateVersion, setStateVersion] = useState<number | null>(null);
	const [businessDate, setBusinessDate] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState('');

	const realtimeRef = useRef<Realtime | null>(null);
	const channelRef = useRef<RealtimeChannel | null>(null);
	const selfDeviceIdRef = useRef('');
	const cancelledRef = useRef(false);
	const connectPromiseRef = useRef<Promise<void> | null>(null);
	const connectionStateRef = useRef<OrderOpsConnectionState>('idle');

	const refreshMeta = useCallback(async () => {
		const meta = await getOrderOpsMeta();
		setStateVersion(meta.stateVersion);
		setBusinessDate(meta.businessDate);
	}, []);

	const refreshMemberCount = useCallback(
		async (channel: RealtimeChannel, selfClientId: string) => {
			try {
				const members = await channel.presence.get();
				if (cancelledRef.current) {
					return;
				}
				const mapped = mapPresenceMembers(members);
				setMemberCount(mapped.length);
				await requestSyncFromPeers(channel, mapped, selfClientId);
			} catch (presenceError) {
				console.error('Failed to read order_ops presence:', presenceError);
			}
		},
		[]
	);

	const setupRealtime = useCallback(
		(selfDeviceId: string) => {
			if (realtimeRef.current) {
				return;
			}

			cancelledRef.current = false;

			const realtime = new Ably.Realtime({
				clientId: selfDeviceId,
				authCallback: (_tokenParams, callback) => {
					fetch(
						`/api/ably/token?deviceId=${encodeURIComponent(selfDeviceId)}`
					)
						.then(async (response) => {
							if (!response.ok) {
								const body = await response.text();
								callback(body || 'Token request failed', null);
								return;
							}
							const token = await response.json();
							callback(null, token);
						})
						.catch((authError: Error) => {
							callback(authError.message, null);
						});
				},
			});

			realtimeRef.current = realtime;
			const channel = realtime.channels.get(ORDER_OPS_CHANNEL);
			channelRef.current = channel;

			const enterPresence = async () => {
				if (cancelledRef.current) {
					return;
				}

				try {
					const meta = await getOrderOpsMeta();
					if (cancelledRef.current) {
						return;
					}

					const data: OrderOpsPresenceData = {
						deviceId: meta.deviceId,
						stateVersion: meta.stateVersion,
						businessDate: meta.businessDate,
					};

					if (channel.state !== 'attached' && channel.state !== 'attaching') {
						await channel.attach();
					}

					if (cancelledRef.current) {
						return;
					}

					await channel.presence.enter(data);
					await refreshMeta();
					await refreshMemberCount(channel, selfDeviceId);
				} catch (presenceError) {
					if (!cancelledRef.current) {
						console.error('Failed to enter order_ops presence:', presenceError);
					}
				}
			};

			const onConnected = () => {
				if (cancelledRef.current) {
					return;
				}
				resetSyncRequestCooldown();
				setConnectionState('connected');
				setError(null);
				void enterPresence();
			};

			const onConnecting = () => {
				if (cancelledRef.current) {
					return;
				}
				setConnectionState('connecting');
			};

			const onDisconnected = () => {
				if (cancelledRef.current) {
					return;
				}
				setConnectionState('idle');
				setMemberCount(0);
				resetSyncRequestCooldown();
			};

			const onFailed = (stateChange: Ably.ConnectionStateChange) => {
				if (cancelledRef.current) {
					return;
				}
				setConnectionState('failed');
				setMemberCount(0);
				resetSyncRequestCooldown();
				setError(stateChange.reason?.message ?? 'Connection failed');
			};

			realtime.connection.on('connecting', onConnecting);
			realtime.connection.on('connected', onConnected);
			realtime.connection.on('disconnected', onDisconnected);
			realtime.connection.on('failed', onFailed);

			channel.subscribe('sync:request', async (message) => {
				const payload = message.data as SyncRequestMessage;
				await handleSyncRequest(
					payload,
					async (response: SyncResponseMessage) => {
						await channel.publish('sync:response', response);
					}
				);
			});

			channel.subscribe('sync:response', async (message) => {
				await handleSyncResponse(message.data as SyncResponseMessage);
				await refreshMeta();
			});

			channel.subscribe('state:delta', async (message) => {
				await handleStateDelta(message.data as StateDeltaMessage);
				await refreshMeta();
			});

			channel.presence.subscribe(['enter', 'leave', 'update'], () => {
				void refreshMemberCount(channel, selfDeviceId);
			});

			registerOrderOpsPublisher(async (snapshot: OrderOpsSnapshot) => {
				const activeChannel = channelRef.current;
				if (!activeChannel) {
					return;
				}

				await updateChannelPresence(activeChannel, snapshot);

				const members = mapPresenceMembers(
					await activeChannel.presence.get()
				);
				if (members.length <= 1) {
					return;
				}

				await activeChannel.publish('state:delta', snapshot);
			});

			registerOrderOpsPresenceUpdater(async (snapshot: OrderOpsSnapshot) => {
				const activeChannel = channelRef.current;
				if (!activeChannel || cancelledRef.current) {
					return;
				}

				await updateChannelPresence(activeChannel, snapshot);
			});
		},
		[refreshMemberCount, refreshMeta]
	);

	const connect = useCallback(async () => {
		if (typeof window === 'undefined') {
			return;
		}

		if (connectionStateRef.current === 'connected') {
			return;
		}

		if (connectPromiseRef.current) {
			return connectPromiseRef.current;
		}

		const selfDeviceId = getStableDeviceId();
		setDeviceId(selfDeviceId);
		setError(null);
		setConnectionState('connecting');

		setupRealtime(selfDeviceId);

		const realtime = realtimeRef.current;
		if (!realtime) {
			setConnectionState('failed');
			setError('Failed to initialize sync client');
			return;
		}

		const promise = new Promise<void>((resolve, reject) => {
			const onSuccess = () => {
				cleanupListeners();
				resolve();
			};
			const onFailure = (stateChange: Ably.ConnectionStateChange) => {
				cleanupListeners();
				if (cancelledRef.current) {
					resolve();
					return;
				}
				reject(
					new Error(stateChange.reason?.message ?? 'Connection failed')
				);
			};

			const cleanupListeners = () => {
				realtime.connection.off('connected', onSuccess);
				realtime.connection.off('failed', onFailure);
			};

			realtime.connection.once('connected', onSuccess);
			realtime.connection.once('failed', onFailure);

			if (realtime.connection.state === 'connected') {
				onSuccess();
				return;
			}

			if (cancelledRef.current) {
				cleanupListeners();
				resolve();
				return;
			}

			realtime.connect();
		})
			.catch((connectError: Error) => {
				if (cancelledRef.current) {
					return;
				}
				setConnectionState('failed');
				setError(connectError.message);
				throw connectError;
			})
			.finally(() => {
				connectPromiseRef.current = null;
			});

		connectPromiseRef.current = promise;
		return promise;
	}, [setupRealtime]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		cancelledRef.current = false;
		const selfDeviceId = getStableDeviceId();
		selfDeviceIdRef.current = selfDeviceId;
		setDeviceId(selfDeviceId);
		setupRealtime(selfDeviceId);
		void connect();

		const attemptSyncFromPeers = () => {
			const channel = channelRef.current;
			const selfClientId = selfDeviceIdRef.current;
			if (!channel || !selfClientId || cancelledRef.current) {
				return;
			}

			resetSyncRequestCooldown();
			void channel.presence
				.get()
				.then((members) =>
					requestSyncFromPeers(
						channel,
						mapPresenceMembers(members),
						selfClientId
					)
				)
				.catch((presenceError) => {
					console.error('Failed to refresh sync on focus:', presenceError);
				});
		};

		const onWindowFocus = () => {
			attemptSyncFromPeers();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				attemptSyncFromPeers();
			}
		};

		window.addEventListener('focus', onWindowFocus);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			cancelledRef.current = true;
			window.removeEventListener('focus', onWindowFocus);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			unregisterOrderOpsPublisher();
			unregisterOrderOpsPresenceUpdater();
			safeTeardownAbly(realtimeRef.current, channelRef.current);
			realtimeRef.current = null;
			channelRef.current = null;
			connectPromiseRef.current = null;
		};
	}, [connect, setupRealtime]);

	const connected = connectionState === 'connected';

	connectionStateRef.current = connectionState;

	return (
		<OrderOpsSyncContext.Provider
			value={{
				connected,
				connectionState,
				memberCount,
				deviceId,
				channelName: ORDER_OPS_CHANNEL,
				stateVersion,
				businessDate,
				error,
				connect,
			}}
		>
			{children}
		</OrderOpsSyncContext.Provider>
	);
}
