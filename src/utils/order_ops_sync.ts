import { INVENTORY_KEY, TOrdersStore } from '@/src/models/common';
import {
	OrderOpsDomain,
	OrderOpsSnapshot,
	OrderOpsVersions,
	resolveSnapshotVersions,
	SyncConflict,
	SyncConflictPeer,
	SyncRequestMessage,
	SyncResponseMessage,
	StateDeltaMessage,
	isAnyDomainBehind,
	maxOrderOpsVersion,
	mergeOrderOpsVersions,
} from '@/src/models/order_ops';
import {
	buildOrderOpsSnapshot,
	bumpAllOrderOpsDomains,
	bumpOrderOpsDomain,
	dispatchNewOrdersSynced,
	dispatchOrderOpsUpdated,
	getDeviceDisplayName,
	getOrderOpsMeta,
	setOrderOpsMetaVersions,
} from '@/src/utils/order_ops_meta';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	replaceOrderHistoryFromSync,
	upsertOrdersInHistory,
} from '@/src/utils/order_history';
import { maintainOrders } from '@/src/utils/order_utils';
import { applyDayChecklistSnapshot } from '@/src/utils/day_checklist_utils';
import { applySupplyInventorySnapshot } from '@/src/utils/supply_inventory_utils';
import { applyWaitlistSnapshot } from '@/src/utils/waitlist_utils';
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

export async function notifyOrderOpsChange(
	domain: OrderOpsDomain
): Promise<void> {
	if (suppressSyncNotify || typeof window === 'undefined') {
		return;
	}

	await bumpOrderOpsDomain(domain);
	const snapshot = await buildOrderOpsSnapshot();

	if (updatePresenceData) {
		await updatePresenceData(snapshot);
	}

	if (publishStateDelta) {
		await publishStateDelta(snapshot);
	}

	dispatchOrderOpsUpdated();
}

export async function notifyOrderOpsFullBroadcast(): Promise<void> {
	if (suppressSyncNotify || typeof window === 'undefined') {
		return;
	}

	await bumpAllOrderOpsDomains();
	const snapshot = await buildOrderOpsSnapshot();

	if (updatePresenceData) {
		await updatePresenceData(snapshot);
	}

	if (publishStateDelta) {
		await publishStateDelta(snapshot);
	}

	dispatchOrderOpsUpdated();
}

function shouldApplyDomain(
	localVersions: OrderOpsVersions,
	remoteVersions: OrderOpsVersions,
	domain: OrderOpsDomain,
	legacyApplyAll: boolean
): boolean {
	if (legacyApplyAll) {
		return true;
	}
	return remoteVersions[domain] > localVersions[domain];
}

export async function applyOrderOpsSnapshot(
	payload: OrderOpsSnapshot
): Promise<boolean> {
	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (payload.businessDate !== today || meta.businessDate !== today) {
		return false;
	}

	const remoteVersions = resolveSnapshotVersions(payload);
	const localVersions = meta.versions;
	const legacyApplyAll =
		!payload.versions &&
		maxOrderOpsVersion(remoteVersions) > maxOrderOpsVersion(localVersions);

	if (!legacyApplyAll && !isAnyDomainBehind(localVersions, remoteVersions)) {
		return false;
	}

	let newOrderIds: string[] = [];
	const appliedVersions: OrderOpsVersions = { ...localVersions };

	await runWithoutSyncNotify(async () => {
		if (
			shouldApplyDomain(localVersions, remoteVersions, 'orders', legacyApplyAll)
		) {
			const existing = await localforage.getItem<TOrdersStore>(ORDERS_KEY);
			const beforeIds = new Set(
				(existing?.orders ?? []).map((order) => order.id)
			);

			const maintained = maintainOrders(payload.orders, Date.now());
			newOrderIds = maintained
				.filter((order) => !beforeIds.has(order.id))
				.map((order) => order.id);

			await localforage.setItem<TOrdersStore>(ORDERS_KEY, {
				orders: maintained,
			});

			if (payload.orderHistory) {
				await replaceOrderHistoryFromSync(
					payload.businessDate,
					payload.orderHistory
				);
			} else {
				await upsertOrdersInHistory(maintained);
			}

			appliedVersions.orders = remoteVersions.orders;
		}

		if (
			shouldApplyDomain(
				localVersions,
				remoteVersions,
				'inventory',
				legacyApplyAll
			)
		) {
			const inventoryStore =
				(await localforage.getItem<Record<string, Record<string, number>>>(
					INVENTORY_KEY
				)) ?? {};
			inventoryStore[payload.businessDate] = { ...payload.inventory };
			await localforage.setItem(INVENTORY_KEY, inventoryStore);
			appliedVersions.inventory = remoteVersions.inventory;
		}

		if (
			shouldApplyDomain(
				localVersions,
				remoteVersions,
				'dayChecklists',
				legacyApplyAll
			) &&
			payload.dayChecklists
		) {
			await applyDayChecklistSnapshot(
				payload.businessDate,
				payload.dayChecklists
			);
			appliedVersions.dayChecklists = remoteVersions.dayChecklists;
		}

		if (
			shouldApplyDomain(
				localVersions,
				remoteVersions,
				'supplyInventory',
				legacyApplyAll
			) &&
			payload.supplyInventory
		) {
			await applySupplyInventorySnapshot(
				payload.businessDate,
				payload.supplyInventory
			);
			appliedVersions.supplyInventory = remoteVersions.supplyInventory;
		}

		if (
			shouldApplyDomain(localVersions, remoteVersions, 'waitlist', legacyApplyAll) &&
			payload.waitlist
		) {
			await applyWaitlistSnapshot(payload.businessDate, payload.waitlist);
			appliedVersions.waitlist = remoteVersions.waitlist;
		}

		await setOrderOpsMetaVersions(appliedVersions, payload.businessDate);

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

function getPeerVersions(member: PresenceMember): OrderOpsVersions {
	const versions = member.data?.versions;
	if (versions && typeof versions === 'object') {
		return resolveSnapshotVersions({
			versions: versions as OrderOpsVersions,
			stateVersion:
				typeof member.data?.stateVersion === 'number'
					? member.data.stateVersion
					: undefined,
		});
	}
	const legacyVersion =
		typeof member.data?.stateVersion === 'number' ? member.data.stateVersion : 0;
	return resolveSnapshotVersions({ stateVersion: legacyVersion });
}

function getPeerStateVersion(member: PresenceMember): number {
	return maxOrderOpsVersion(getPeerVersions(member));
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

	const peers: SyncConflictPeer[] = todayPeers.map((member) => {
		const versions = getPeerVersions(member);
		return {
			clientId: member.clientId,
			deviceName: getPeerDeviceName(member),
			versions,
			stateVersion: maxOrderOpsVersion(versions),
			initializedForToday: getPeerInitialized(member),
		};
	});

	const hasInitializedPeer = peers.some(
		(peer) => peer.initializedForToday || peer.stateVersion > 0
	);
	const localInitialized = meta.initializedForToday ?? false;

	if (localInitialized || !hasInitializedPeer) {
		return null;
	}

	const recommendedPeer = peers.reduce((best, peer) =>
		peer.stateVersion > best.stateVersion ? peer : best
	);

	return {
		businessDate: today,
		localVersions: meta.versions,
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
		requesterVersions: meta.versions,
		requesterVersion: maxOrderOpsVersion(meta.versions),
		requesterBusinessDate: getTodayDateKey(),
	});
}

export async function resolveSyncKeepLocal(): Promise<void> {
	await notifyOrderOpsFullBroadcast();
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

	const requesterVersions = message.requesterVersions
		? message.requesterVersions
		: resolveSnapshotVersions({ stateVersion: message.requesterVersion });

	if (
		maxOrderOpsVersion(meta.versions) < maxOrderOpsVersion(requesterVersions)
	) {
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

	const sourceVersions = getPeerVersions(source);
	const needsInitialSync = !meta.initializedForToday;
	const needsCatchUp = isAnyDomainBehind(meta.versions, sourceVersions);

	if (!needsInitialSync && !needsCatchUp) {
		return;
	}

	if (
		needsInitialSync &&
		!needsCatchUp &&
		maxOrderOpsVersion(meta.versions) > 0
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
		requesterVersions: meta.versions,
		requesterVersion: maxOrderOpsVersion(meta.versions),
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
