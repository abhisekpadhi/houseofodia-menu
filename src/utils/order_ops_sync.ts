import { INVENTORY_KEY, TOrdersStore } from '@/src/models/common';
import {
	OrderOpsSnapshot,
	SyncConflict,
	SyncConflictPeer,
	SyncRequestMessage,
	SyncResponseMessage,
	StateDeltaMessage,
} from '@/src/models/order_ops';
import {
	buildOrderOpsSnapshot,
	bumpOrderOpsMeta,
	dispatchNewOrdersSynced,
	dispatchOrderOpsUpdated,
	getDeviceDisplayName,
	getOrderOpsMeta,
	setOrderOpsMetaVersion,
} from '@/src/utils/order_ops_meta';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	replaceOrderHistoryFromSync,
	upsertOrdersInHistory,
} from '@/src/utils/order_history';
import { maintainOrders } from '@/src/utils/order_utils';
import localforage from 'localforage';

const ORDERS_KEY = 'orders';
const SYNC_REQUEST_COOLDOWN_MS = 2_000;

let suppressSyncNotify = false;
let publishStateDelta: ((snapshot: OrderOpsSnapshot) => Promise<void>) | null =
	null;
let updatePresenceData:
	| ((snapshot: OrderOpsSnapshot) => Promise<void>)
	| null = null;
let lastSyncRequestAt = 0;
let syncConflictBlocking = false;

export function setSyncConflictBlocking(blocking: boolean): void {
	syncConflictBlocking = blocking;
}

export function isSyncConflictBlocking(): boolean {
	return syncConflictBlocking;
}

export function registerOrderOpsPublisher(
	publisher: (snapshot: OrderOpsSnapshot) => Promise<void>
): void {
	publishStateDelta = publisher;
}

export function unregisterOrderOpsPublisher(): void {
	publishStateDelta = null;
}

export function registerOrderOpsPresenceUpdater(
	updater: (snapshot: OrderOpsSnapshot) => Promise<void>
): void {
	updatePresenceData = updater;
}

export function unregisterOrderOpsPresenceUpdater(): void {
	updatePresenceData = null;
}

export function isSyncNotifySuppressed(): boolean {
	return suppressSyncNotify;
}

export async function runWithoutSyncNotify<T>(fn: () => Promise<T>): Promise<T> {
	suppressSyncNotify = true;
	try {
		return await fn();
	} finally {
		suppressSyncNotify = false;
	}
}

export async function notifyOrderOpsChange(): Promise<void> {
	if (suppressSyncNotify || typeof window === 'undefined') {
		return;
	}

	await bumpOrderOpsMeta();
	const snapshot = await buildOrderOpsSnapshot();

	if (updatePresenceData) {
		await updatePresenceData(snapshot);
	}

	if (publishStateDelta) {
		await publishStateDelta(snapshot);
	}

	dispatchOrderOpsUpdated();
}

export async function applyOrderOpsSnapshot(
	payload: OrderOpsSnapshot
): Promise<boolean> {
	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (payload.businessDate !== today || meta.businessDate !== today) {
		return false;
	}

	if (payload.stateVersion <= meta.stateVersion) {
		return false;
	}

	let newOrderIds: string[] = [];

	await runWithoutSyncNotify(async () => {
		const existing = await localforage.getItem<TOrdersStore>(ORDERS_KEY);
		const beforeIds = new Set((existing?.orders ?? []).map((order) => order.id));

		const maintained = maintainOrders(payload.orders, Date.now());
		newOrderIds = maintained
			.filter((order) => !beforeIds.has(order.id))
			.map((order) => order.id);

		await localforage.setItem<TOrdersStore>(ORDERS_KEY, { orders: maintained });

		const inventoryStore =
			(await localforage.getItem<Record<string, Record<string, number>>>(
				INVENTORY_KEY
			)) ?? {};
		inventoryStore[payload.businessDate] = { ...payload.inventory };
		await localforage.setItem(INVENTORY_KEY, inventoryStore);

		if (payload.orderHistory) {
			await replaceOrderHistoryFromSync(
				payload.businessDate,
				payload.orderHistory
			);
		} else {
			await upsertOrdersInHistory(maintained);
		}

		await setOrderOpsMetaVersion(payload.stateVersion, payload.businessDate);

		if (updatePresenceData) {
			const snapshot = await buildOrderOpsSnapshot();
			await updatePresenceData(snapshot);
		}
	});

	dispatchOrderOpsUpdated();
	if (newOrderIds.length > 0) {
		dispatchNewOrdersSynced(newOrderIds);
	}
	return true;
}

export type PresenceMember = {
	clientId: string;
	timestamp: number;
	data?: Record<string, unknown>;
};

function getPeerStateVersion(member: PresenceMember): number {
	const version = member.data?.stateVersion;
	return typeof version === 'number' ? version : 0;
}

function getPeerBusinessDate(member: PresenceMember): string | null {
	const businessDate = member.data?.businessDate;
	return typeof businessDate === 'string' ? businessDate : null;
}

function getPeerInitialized(member: PresenceMember): boolean {
	const initialized = member.data?.initializedForToday;
	if (typeof initialized === 'boolean') {
		return initialized;
	}
	return getPeerStateVersion(member) > 0;
}

export function getPeerDeviceName(member: PresenceMember): string {
	const name = member.data?.deviceName;
	if (typeof name === 'string' && name.trim()) {
		return name.trim();
	}
	return `Device ${member.clientId.slice(-4)}`;
}

function peersForToday(
	members: PresenceMember[],
	selfClientId: string,
	today: string
): PresenceMember[] {
	return members.filter(
		(member) =>
			member.clientId !== selfClientId &&
			getPeerBusinessDate(member) === today
	);
}

export async function detectSyncConflict(
	members: PresenceMember[],
	selfClientId: string
): Promise<SyncConflict | null> {
	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (meta.businessDate !== today) {
		return null;
	}

	const todayPeers = peersForToday(members, selfClientId, today);
	if (todayPeers.length === 0) {
		return null;
	}

	const peers: SyncConflictPeer[] = todayPeers.map((member) => ({
		clientId: member.clientId,
		deviceName: getPeerDeviceName(member),
		stateVersion: getPeerStateVersion(member),
		initializedForToday: getPeerInitialized(member),
	}));

	const hasInitializedPeer = peers.some(
		(peer) => peer.initializedForToday || peer.stateVersion > 0
	);
	const localInitialized = meta.initializedForToday ?? false;

	// Only prompt when this device joins mid-day with stale/uninitialized state.
	// Version drift between initialized peers is handled by auto-sync, not the modal.
	if (localInitialized || !hasInitializedPeer) {
		return null;
	}

	const recommendedPeer = peers.reduce((best, peer) =>
		peer.stateVersion > best.stateVersion ? peer : best
	);

	return {
		businessDate: today,
		localVersion: meta.stateVersion,
		localInitialized,
		localDeviceName: getDeviceDisplayName(),
		recommendedPeerClientId: recommendedPeer.clientId,
		peers,
	};
}

export async function requestSyncFromPeer(
	publish: (payload: SyncRequestMessage) => Promise<void>,
	selfClientId: string,
	targetClientId: string
): Promise<void> {
	const meta = await getOrderOpsMeta();
	resetSyncRequestCooldown();
	await publish({
		requesterId: selfClientId,
		targetId: targetClientId,
		requesterVersion: meta.stateVersion,
		requesterBusinessDate: getTodayDateKey(),
	});
}

export async function resolveSyncKeepLocal(): Promise<void> {
	await notifyOrderOpsChange();
}

export async function handleSyncRequest(
	message: SyncRequestMessage,
	respond: (payload: SyncResponseMessage) => Promise<void>
): Promise<void> {
	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (message.targetId !== meta.deviceId) {
		return;
	}

	if (message.requesterBusinessDate !== today || meta.businessDate !== today) {
		return;
	}

	if (!meta.initializedForToday) {
		return;
	}

	if (meta.stateVersion < message.requesterVersion) {
		return;
	}

	const snapshot = await buildOrderOpsSnapshot();
	if (snapshot.businessDate !== today) {
		return;
	}

	await respond({
		...snapshot,
		targetId: message.requesterId,
		responderId: meta.deviceId,
	});
}

export function resetSyncRequestCooldown(): void {
	lastSyncRequestAt = 0;
}

export async function maybeRequestSyncFromPeers(
	publish: (payload: SyncRequestMessage) => Promise<void>,
	members: PresenceMember[],
	selfClientId: string
): Promise<void> {
	if (syncConflictBlocking) {
		return;
	}

	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (meta.businessDate !== today) {
		return;
	}

	const todayPeers = peersForToday(members, selfClientId, today);
	if (todayPeers.length === 0) {
		return;
	}

	const source = todayPeers.reduce((best, member) => {
		const version = getPeerStateVersion(member);
		const bestVersion = getPeerStateVersion(best);
		if (version > bestVersion) {
			return member;
		}
		if (version === bestVersion && member.timestamp < best.timestamp) {
			return member;
		}
		return best;
	});

	const sourceVersion = getPeerStateVersion(source);
	const needsInitialSync = !meta.initializedForToday;

	if (!needsInitialSync && sourceVersion <= meta.stateVersion) {
		return;
	}

	if (
		needsInitialSync &&
		sourceVersion <= meta.stateVersion &&
		meta.stateVersion > 0
	) {
		return;
	}

	const now = Date.now();
	if (now - lastSyncRequestAt < SYNC_REQUEST_COOLDOWN_MS) {
		return;
	}
	lastSyncRequestAt = now;

	const payload: SyncRequestMessage = {
		requesterId: selfClientId,
		targetId: source.clientId,
		requesterVersion: meta.stateVersion,
		requesterBusinessDate: today,
	};

	await publish(payload);
}

export async function handleSyncResponse(
	message: SyncResponseMessage
): Promise<boolean> {
	const meta = await getOrderOpsMeta();

	if (message.targetId !== meta.deviceId) {
		return false;
	}

	return applyOrderOpsSnapshot(message);
}

export async function handleStateDelta(
	message: StateDeltaMessage
): Promise<boolean> {
	const meta = await getOrderOpsMeta();

	if (message.deviceId === meta.deviceId) {
		return false;
	}

	return applyOrderOpsSnapshot(message);
}

export function pickOldestMember(
	members: PresenceMember[]
): PresenceMember | null {
	if (members.length === 0) {
		return null;
	}

	return members.reduce((oldest, member) =>
		member.timestamp < oldest.timestamp ? member : oldest
	);
}

export function isNewestMember(
	members: PresenceMember[],
	selfClientId: string
): boolean {
	if (members.length <= 1) {
		return false;
	}

	const self = members.find((member) => member.clientId === selfClientId);
	if (!self) {
		return false;
	}

	return members.every((member) => member.timestamp <= self.timestamp);
}
