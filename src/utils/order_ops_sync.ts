import { INVENTORY_KEY, TOrdersStore } from '@/src/models/common';
import {
	OrderOpsSnapshot,
	SyncRequestMessage,
	SyncResponseMessage,
	StateDeltaMessage,
} from '@/src/models/order_ops';
import {
	buildOrderOpsSnapshot,
	bumpOrderOpsMeta,
	dispatchOrderOpsUpdated,
	getOrderOpsMeta,
	setOrderOpsMetaVersion,
} from '@/src/utils/order_ops_meta';
import { getInventoryForDate, getTodayDateKey } from '@/src/utils/inventory_utils';
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
	const meta = await getOrderOpsMeta();

	if (payload.stateVersion <= meta.stateVersion) {
		return false;
	}

	if (payload.businessDate !== getTodayDateKey()) {
		return false;
	}

	await runWithoutSyncNotify(async () => {
		const maintained = maintainOrders(payload.orders, Date.now());
		await localforage.setItem<TOrdersStore>(ORDERS_KEY, { orders: maintained });

		const inventoryStore =
			(await localforage.getItem<Record<string, Record<string, number>>>(
				INVENTORY_KEY
			)) ?? {};
		inventoryStore[payload.businessDate] = { ...payload.inventory };
		await localforage.setItem(INVENTORY_KEY, inventoryStore);

		await setOrderOpsMetaVersion(payload.stateVersion, payload.businessDate);

		if (updatePresenceData) {
			const snapshot = await buildOrderOpsSnapshot();
			await updatePresenceData(snapshot);
		}
	});

	dispatchOrderOpsUpdated();
	return true;
}

export type PresenceMember = {
	clientId: string;
	timestamp: number;
	data?: Record<string, unknown>;
};

export async function handleSyncRequest(
	message: SyncRequestMessage,
	respond: (payload: SyncResponseMessage) => Promise<void>
): Promise<void> {
	const meta = await getOrderOpsMeta();

	if (message.targetId !== meta.deviceId) {
		return;
	}

	if (meta.stateVersion < message.requesterVersion) {
		return;
	}

	const snapshot = await buildOrderOpsSnapshot();
	await respond({
		...snapshot,
		targetId: message.requesterId,
		responderId: meta.deviceId,
	});
}

function getPeerStateVersion(member: PresenceMember): number {
	const version = member.data?.stateVersion;
	return typeof version === 'number' ? version : 0;
}

export function resetSyncRequestCooldown(): void {
	lastSyncRequestAt = 0;
}

export async function maybeRequestSyncFromPeers(
	publish: (payload: SyncRequestMessage) => Promise<void>,
	members: PresenceMember[],
	selfClientId: string
): Promise<void> {
	const meta = await getOrderOpsMeta();
	const others = members.filter((member) => member.clientId !== selfClientId);

	if (others.length === 0) {
		return;
	}

	const source = others.reduce((best, member) => {
		const version = getPeerStateVersion(member);
		if (version > getPeerStateVersion(best)) {
			return member;
		}
		return best;
	});

	const sourceVersion = getPeerStateVersion(source);
	if (sourceVersion <= meta.stateVersion) {
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
