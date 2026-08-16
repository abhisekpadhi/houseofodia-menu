'use client';

import {
	getOrderOpsChannel,
	maxOrderOpsVersion,
	OrderOpsPresenceData,
	OrderOpsSnapshot,
	SyncConflict,
	SyncConflictResolution,
	SyncRequestMessage,
	SyncResponseMessage,
	StateDeltaMessage,
} from '@/src/models/order_ops';
import {
	getDeviceDisplayName,
	getOrderOpsMeta,
	getStableDeviceId,
	setDeviceDisplayName,
} from '@/src/utils/order_ops_meta';
import {
	detectSyncConflict,
	handleStateDelta,
	handleSyncRequest,
	handleSyncResponse,
	maybeRequestSyncFromPeers,
	registerOrderOpsPresenceUpdater,
	registerOrderOpsPublisher,
	registerKotPrintPublisher,
	registerBillPrintPublisher,
	requestSyncFromPeer,
	resetSyncRequestCooldown,
	resolveSyncKeepLocal,
	setSyncConflictBlocking,
	unregisterOrderOpsPresenceUpdater,
	unregisterOrderOpsPublisher,
	unregisterKotPrintPublisher,
	unregisterBillPrintPublisher,
	getPeerDeviceName,
	isSyncHubOnlineAmong,
	applyKotPrintedAck,
	type PresenceMember,
	type KotPrintAckMessage,
} from '@/src/utils/order_ops_sync';
import {
	getWriteGateState,
	setWriteGateState,
	subscribeWriteGate,
	getPreferFullscreenCatchUp,
	getCatchUpStartedAt,
	type WriteGateState,
} from '@/src/utils/sync_write_gate';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
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

export type CatchUpUiMode = 'none' | 'banner' | 'fullscreen';

type OrderOpsSyncContextValue = {
	connected: boolean;
	connectionState: OrderOpsConnectionState;
	syncing: boolean;
	memberCount: number;
	/** Presence device names currently on the channel (including this device). */
	memberDeviceNames: string[];
	deviceId: string;
	deviceName: string;
	channelName: string;
	stateVersion: number | null;
	businessDate: string | null;
	error: string | null;
	syncConflict: SyncConflict | null;
	writeGate: WriteGateState;
	canWrite: boolean;
	catchUpUi: CatchUpUiMode;
	syncHubOnline: boolean;
	/** Short-lived KOT print failure message (auto-clears). */
	kotPrintFailure: string | null;
	connect: () => Promise<void>;
	updateDeviceName: (name: string) => Promise<void>;
	resolveSyncConflict: (
		resolution: SyncConflictResolution,
		peerClientId?: string
	) => Promise<void>;
};

const OrderOpsSyncContext = createContext<OrderOpsSyncContextValue>({
	connected: false,
	connectionState: 'idle',
	syncing: false,
	memberCount: 0,
	memberDeviceNames: [],
	deviceId: '',
	deviceName: '',
	channelName: getOrderOpsChannel(),
	stateVersion: null,
	businessDate: null,
	error: null,
	syncConflict: null,
	writeGate: 'offline',
	canWrite: false,
	catchUpUi: 'none',
	syncHubOnline: false,
	kotPrintFailure: null,
	connect: async () => undefined,
	updateDeviceName: async () => undefined,
	resolveSyncConflict: async () => undefined,
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
	return maybeRequestSyncFromPeers(
		async (payload) => {
			await channel.publish('sync:request', payload);
		},
		members,
		selfClientId
	);
}

async function updateChannelPresence(channel: RealtimeChannel) {
	const meta = await getOrderOpsMeta();
	const data: OrderOpsPresenceData = {
		deviceId: meta.deviceId,
		deviceName: getDeviceDisplayName(),
		versions: meta.versions,
		stateVersion: maxOrderOpsVersion(meta.versions),
		businessDate: meta.businessDate,
		initializedForToday: meta.initializedForToday ?? false,
		isSyncHub: false,
	};

	try {
		await channel.presence.update(data);
	} catch {
		await channel.presence.enter(data);
	}
}

async function publishSyncRequest(
	channel: RealtimeChannel,
	payload: SyncRequestMessage
) {
	await channel.publish('sync:request', payload);
}

type ConnectionHandlers = {
	onConnecting: () => void;
	onConnected: () => void;
	onDisconnected: () => void;
	onFailed: (stateChange: Ably.ConnectionStateChange) => void;
};

async function teardownAbly(
	realtime: Realtime | null,
	channel: RealtimeChannel | null,
	handlers: ConnectionHandlers | null
): Promise<void> {
	if (realtime && handlers) {
		realtime.connection.off('connecting', handlers.onConnecting);
		realtime.connection.off('connected', handlers.onConnected);
		realtime.connection.off('disconnected', handlers.onDisconnected);
		realtime.connection.off('failed', handlers.onFailed);
	}

	if (channel) {
		try {
			channel.presence.unsubscribe();
		} catch {
			// Presence may not be subscribed yet during hot reload / Strict Mode.
		}

		try {
			channel.unsubscribe();
		} catch {
			// Channel may already be detached during hot reload / Strict Mode.
		}

		try {
			if (
				channel.state === 'attached' ||
				channel.state === 'attaching' ||
				channel.state === 'suspended'
			) {
				await channel.presence.leave();
			}
		} catch {
			// Ignore leave errors while tearing down.
		}

		try {
			if (
				channel.state === 'attached' ||
				channel.state === 'attaching' ||
				channel.state === 'suspended'
			) {
				await channel.detach();
			}
		} catch {
			// Ignore detach errors while tearing down.
		}
	}

	if (!realtime) {
		return;
	}

	const connectionState = realtime.connection.state;
	if (
		connectionState === 'closed' ||
		connectionState === 'closing' ||
		connectionState === 'failed'
	) {
		return;
	}

	try {
		realtime.connection.close();
	} catch {
		// Ably can throw if the connection is already closed.
	}
}

export function OrderOpsSyncProvider({ children }: { children: ReactNode }) {
	const [connectionState, setConnectionState] =
		useState<OrderOpsConnectionState>('idle');
	const [syncing, setSyncing] = useState(false);
	const [memberCount, setMemberCount] = useState(0);
	const [memberDeviceNames, setMemberDeviceNames] = useState<string[]>([]);
	const [stateVersion, setStateVersion] = useState<number | null>(null);
	const [businessDate, setBusinessDate] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState('');
	const [deviceName, setDeviceName] = useState('');
	const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
	const [writeGate, setWriteGate] = useState<WriteGateState>(() =>
		getWriteGateState()
	);
	const [syncHubOnline, setSyncHubOnline] = useState(false);
	const [kotPrintFailure, setKotPrintFailure] = useState<string | null>(null);
	const [catchUpUi, setCatchUpUi] = useState<CatchUpUiMode>('none');

	const realtimeRef = useRef<Realtime | null>(null);
	const channelRef = useRef<RealtimeChannel | null>(null);
	const connectionHandlersRef = useRef<ConnectionHandlers | null>(null);
	const selfDeviceIdRef = useRef('');
	const cancelledRef = useRef(false);
	const connectPromiseRef = useRef<Promise<void> | null>(null);
	const connectionStateRef = useRef<OrderOpsConnectionState>('idle');
	const syncActivityCountRef = useRef(0);
	const conflictResolvedRef = useRef(false);
	const pendingSyncRequestRef = useRef(false);
	const everConnectedRef = useRef(false);

	useEffect(() => {
		return subscribeWriteGate(() => {
			setWriteGate(getWriteGateState());
		});
	}, []);

	useEffect(() => {
		if (!kotPrintFailure) {
			return;
		}
		const timer = window.setTimeout(() => setKotPrintFailure(null), 8000);
		return () => window.clearTimeout(timer);
	}, [kotPrintFailure]);

	useEffect(() => {
		if (writeGate !== 'catching_up') {
			setCatchUpUi('none');
			return;
		}
		const FULLSCREEN_AFTER_MS = 1500;
		const tick = () => {
			const preferFullscreen =
				getPreferFullscreenCatchUp() ||
				Date.now() - getCatchUpStartedAt() >= FULLSCREEN_AFTER_MS;
			setCatchUpUi(preferFullscreen ? 'fullscreen' : 'banner');
		};
		tick();
		const id = window.setInterval(tick, 400);
		return () => window.clearInterval(id);
	}, [writeGate]);

	const runWithSyncIndicator = useCallback(
		async (operation: () => Promise<void>) => {
			syncActivityCountRef.current += 1;
			setSyncing(true);
			try {
				await operation();
			} finally {
				syncActivityCountRef.current -= 1;
				if (syncActivityCountRef.current <= 0) {
					syncActivityCountRef.current = 0;
					setSyncing(false);
				}
			}
		},
		[]
	);

	const refreshMeta = useCallback(async () => {
		const meta = await getOrderOpsMeta();
		setStateVersion(maxOrderOpsVersion(meta.versions));
		setBusinessDate(meta.businessDate);
	}, []);

	const refreshMemberCount = useCallback(
		async (
			channel: RealtimeChannel,
			selfClientId: string,
			options?: { checkConflict?: boolean; fullscreenCatchUp?: boolean }
		) => {
			const checkConflict = options?.checkConflict ?? false;

			try {
				const members = await channel.presence.get();
				if (cancelledRef.current) {
					return;
				}
				const mapped = mapPresenceMembers(members);
				const today = getTodayDateKey();
				setMemberCount(mapped.length);
				setMemberDeviceNames(
					mapped.map((member) => getPeerDeviceName(member))
				);
				setSyncHubOnline(
					isSyncHubOnlineAmong(mapped, selfClientId, today)
				);

				if (checkConflict) {
					const conflict = await detectSyncConflict(mapped, selfClientId);
					if (conflict && !conflictResolvedRef.current) {
						setSyncConflictBlocking(true);
						setSyncConflict(conflict);
						setWriteGateState('awaiting_choice');
						return;
					}

					setSyncConflict(null);
					setSyncConflictBlocking(false);
				}

				setWriteGateState('catching_up', {
					fullscreen: options?.fullscreenCatchUp === true,
				});

				await runWithSyncIndicator(async () => {
					const result = await requestSyncFromPeers(
						channel,
						mapped,
						selfClientId
					);
					if (cancelledRef.current) {
						return;
					}
					if (result.requested) {
						pendingSyncRequestRef.current = true;
						return;
					}
					if (
						result.reason === 'already_current' ||
						result.reason === 'no_peers' ||
						result.reason === 'initialized_local'
					) {
						pendingSyncRequestRef.current = false;
						setWriteGateState('ready');
						return;
					}
					// hub_not_ready / cooldown — stay catching_up
					pendingSyncRequestRef.current = false;
				});
			} catch (presenceError) {
				console.error('Failed to read order_ops presence:', presenceError);
			}
		},
		[runWithSyncIndicator]
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
			const channel = realtime.channels.get(getOrderOpsChannel());
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
						deviceName: getDeviceDisplayName(),
						versions: meta.versions,
						stateVersion: maxOrderOpsVersion(meta.versions),
						businessDate: meta.businessDate,
						initializedForToday: meta.initializedForToday ?? false,
						isSyncHub: false,
					};

					if (channel.state !== 'attached' && channel.state !== 'attaching') {
						await channel.attach();
					}

					if (cancelledRef.current) {
						return;
					}

					await channel.presence.enter(data);
					await refreshMeta();
					await refreshMemberCount(channel, selfDeviceId, {
						checkConflict: true,
					});
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
				const fullscreen = everConnectedRef.current;
				everConnectedRef.current = true;
				setWriteGateState('catching_up', { fullscreen });
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
				setMemberDeviceNames([]);
				setSyncHubOnline(false);
				setSyncConflict(null);
				setSyncConflictBlocking(false);
				conflictResolvedRef.current = false;
				pendingSyncRequestRef.current = false;
				setWriteGateState('offline');
				resetSyncRequestCooldown();
			};

			const onFailed = (stateChange: Ably.ConnectionStateChange) => {
				if (cancelledRef.current) {
					return;
				}
				setConnectionState('failed');
				setMemberCount(0);
				setMemberDeviceNames([]);
				setSyncHubOnline(false);
				setSyncConflict(null);
				setSyncConflictBlocking(false);
				conflictResolvedRef.current = false;
				pendingSyncRequestRef.current = false;
				setWriteGateState('offline');
				resetSyncRequestCooldown();
				setError(stateChange.reason?.message ?? 'Connection failed');
			};

			realtime.connection.on('connecting', onConnecting);
			realtime.connection.on('connected', onConnected);
			realtime.connection.on('disconnected', onDisconnected);
			realtime.connection.on('failed', onFailed);
			connectionHandlersRef.current = {
				onConnecting,
				onConnected,
				onDisconnected,
				onFailed,
			};

			channel.subscribe('sync:request', async (message) => {
				const payload = message.data as SyncRequestMessage;
				await runWithSyncIndicator(async () => {
					await handleSyncRequest(
						payload,
						async (response: SyncResponseMessage) => {
							await channel.publish('sync:response', response);
						}
					);
				});
			});

			channel.subscribe('sync:response', async (message) => {
				await runWithSyncIndicator(async () => {
					await handleSyncResponse(message.data as SyncResponseMessage);
					await refreshMeta();
					pendingSyncRequestRef.current = false;
					if (getWriteGateState() === 'catching_up') {
						setWriteGateState('ready');
					}
				});
			});

			channel.subscribe('state:delta', async (message) => {
				await runWithSyncIndicator(async () => {
					await handleStateDelta(message.data as StateDeltaMessage);
					await refreshMeta();
				});
			});

			channel.subscribe('kot:printed', async (message) => {
				const payload = message.data as KotPrintAckMessage;
				const orderId = payload?.orderId?.trim();
				if (!orderId) return;
				try {
					await applyKotPrintedAck(orderId, payload.printedAt ?? Date.now());
				} catch (err) {
					console.warn('[kot-ack] apply printed failed', err);
				}
			});

			channel.subscribe('kot:failed', (message) => {
				const payload = message.data as KotPrintAckMessage;
				const orderId = payload?.orderId?.trim() || 'order';
				const detail = payload?.error?.trim();
				setKotPrintFailure(
					detail
						? `KOT print failed (${orderId}): ${detail}`
						: `KOT print failed for ${orderId}`
				);
			});

			channel.presence.subscribe('enter', () => {
				void refreshMemberCount(channel, selfDeviceId, {
					checkConflict: true,
				});
			});
			channel.presence.subscribe(['leave', 'update'], () => {
				void refreshMemberCount(channel, selfDeviceId);
			});

			registerOrderOpsPublisher(async (snapshot: OrderOpsSnapshot) => {
				const activeChannel = channelRef.current;
				if (!activeChannel) {
					return;
				}

				await updateChannelPresence(activeChannel);

				const members = mapPresenceMembers(
					await activeChannel.presence.get()
				);
				if (members.length <= 1) {
					return;
				}

				await runWithSyncIndicator(async () => {
					await activeChannel.publish('state:delta', snapshot);
				});
			});

			registerKotPrintPublisher(async (payload) => {
				const activeChannel = channelRef.current;
				if (!activeChannel) {
					throw new Error('Sync channel is not ready');
				}
				await activeChannel.publish('kot:print', payload);
			});

			registerBillPrintPublisher(async (payload) => {
				const activeChannel = channelRef.current;
				if (!activeChannel) {
					throw new Error('Sync channel is not ready');
				}
				await activeChannel.publish('bill:print', payload);
			});

			registerOrderOpsPresenceUpdater(async () => {
				const activeChannel = channelRef.current;
				if (!activeChannel || cancelledRef.current) {
					return;
				}

				await updateChannelPresence(activeChannel);
			});
		},
		[refreshMemberCount, refreshMeta, runWithSyncIndicator]
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

	const updateDeviceName = useCallback(async (name: string) => {
		const trimmed = name.trim();
		if (!trimmed) {
			throw new Error('Device name is required');
		}
		setDeviceDisplayName(trimmed);
		setDeviceName(getDeviceDisplayName());

		const channel = channelRef.current;
		if (channel && connectionStateRef.current === 'connected') {
			await updateChannelPresence(channel);
		}
	}, []);

	const resolveSyncConflict = useCallback(
		async (resolution: SyncConflictResolution, peerClientId?: string) => {
			const channel = channelRef.current;
			const selfClientId = selfDeviceIdRef.current;
			if (!channel || !selfClientId) {
				return;
			}

			conflictResolvedRef.current = true;
			setSyncConflictBlocking(false);
			setSyncConflict(null);
			setWriteGateState('catching_up');

			await runWithSyncIndicator(async () => {
				const publish = async (payload: SyncRequestMessage) =>
					publishSyncRequest(channel, payload);

				if (resolution === 'newest') {
					const members = mapPresenceMembers(await channel.presence.get());
					const result = await maybeRequestSyncFromPeers(
						publish,
						members,
						selfClientId
					);
					if (!result.requested) {
						setWriteGateState('ready');
					} else {
						pendingSyncRequestRef.current = true;
					}
				} else if (resolution === 'peer' && peerClientId) {
					await requestSyncFromPeer(publish, selfClientId, peerClientId);
					pendingSyncRequestRef.current = true;
				} else if (resolution === 'local') {
					await resolveSyncKeepLocal();
					setWriteGateState('ready');
				}
			});

			await refreshMeta();
			await updateChannelPresence(channel);
		},
		[refreshMeta, runWithSyncIndicator]
	);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		cancelledRef.current = false;
		const selfDeviceId = getStableDeviceId();
		selfDeviceIdRef.current = selfDeviceId;
		setDeviceId(selfDeviceId);
		setDeviceName(getDeviceDisplayName());
		setupRealtime(selfDeviceId);
		void connect();

		const attemptSyncFromPeers = () => {
			const channel = channelRef.current;
			const selfClientId = selfDeviceIdRef.current;
			if (!channel || !selfClientId || cancelledRef.current) {
				return;
			}

			resetSyncRequestCooldown();
			void refreshMemberCount(channel, selfClientId, {
				checkConflict: true,
				fullscreenCatchUp: true,
			}).catch((presenceError) => {
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
			unregisterKotPrintPublisher();
			unregisterBillPrintPublisher();
			unregisterOrderOpsPresenceUpdater();
			void teardownAbly(
				realtimeRef.current,
				channelRef.current,
				connectionHandlersRef.current
			);
			realtimeRef.current = null;
			channelRef.current = null;
			connectionHandlersRef.current = null;
			connectPromiseRef.current = null;
		};
	}, [connect, setupRealtime, refreshMemberCount]);

	const connected = connectionState === 'connected';

	connectionStateRef.current = connectionState;

	return (
		<OrderOpsSyncContext.Provider
			value={{
				connected,
				connectionState,
				syncing,
				memberCount,
				memberDeviceNames,
				deviceId,
				deviceName,
				channelName: getOrderOpsChannel(),
				stateVersion,
				businessDate,
				error,
				syncConflict,
				writeGate,
				canWrite: writeGate === 'ready',
				catchUpUi,
				syncHubOnline,
				kotPrintFailure,
				connect,
				updateDeviceName,
				resolveSyncConflict,
			}}
		>
			{children}
		</OrderOpsSyncContext.Provider>
	);
}
