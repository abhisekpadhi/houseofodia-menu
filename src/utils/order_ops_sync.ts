import {
	BillingContext,
	INVENTORY_KEY,
	TBill,
	TCart,
	TOrder,
	TOrderItem,
	TOrdersStore,
	formatOrderKindLabel,
} from '@/src/models/common';
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
	ORDER_OPS_DOMAINS,
} from '@/src/models/order_ops';
import {
	buildOrderOpsDomainSnapshot,
	buildOrderOpsSnapshot,
	bumpAllOrderOpsDomains,
	bumpOrderOpsDomain,
	dispatchNewOrdersSynced,
	dispatchOrderOpsUpdated,
	getDeviceDisplayName,
	getOrderOpsMeta,
	getStableDeviceId,
	setOrderOpsMetaVersions,
} from '@/src/utils/order_ops_meta';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	getTodayOrderHistory,
	replaceOrderHistoryFromSync,
	upsertOrdersInHistory,
} from '@/src/utils/order_history';
import { maintainOrders } from '@/src/utils/order_utils';
import { applyDailyOrderNumberSnapshot } from '@/src/utils/daily_order_number';
import { applyDayChecklistSnapshot } from '@/src/utils/day_checklist_utils';
import { applySupplyInventorySnapshot } from '@/src/utils/supply_inventory_utils';
import { applyWaitlistSnapshot } from '@/src/utils/waitlist_utils';
import { applyServiceRequestsSnapshot } from '@/src/utils/service_requests_utils';
import { applyBillingSessions } from '@/src/utils/billing_state';
import localforage from 'localforage';

import {
	publishSyncResponseChunks,
	SYNC_CHUNK_TIMEOUT_MS,
	SyncResponseChunkAssembler,
	isCompleteSyncResponse,
	type SyncResponseWireMessage,
	type SyncTransferProgress,
} from '@/src/utils/sync_response_chunk';

const ORDERS_KEY = 'orders';
const SYNC_REQUEST_COOLDOWN_MS = 2_000;

export { SYNC_CHUNK_TIMEOUT_MS };
export type { SyncResponseWireMessage, SyncTransferProgress };

let suppressSyncNotify = false;
let publishStateDelta: ((snapshot: OrderOpsSnapshot) => Promise<void>) | null =
	null;
let updatePresenceData:
	| ((snapshot: OrderOpsSnapshot) => Promise<void>)
	| null = null;
let publishKotPrintMessage:
	| ((payload: KotPrintRequestMessage) => Promise<void>)
	| null = null;
let lastSyncRequestAt = 0;
let syncConflictBlocking = false;

/** KOT print request published on the order_ops Ably channel (auto or manual). */
export type KotPrintRequestMessage = {
	order: TOrder;
	mode: 'new' | 'update';
	/** Stable id so printers can ignore duplicate deliveries of the same job. */
	printJobId: string;
	nameByBillName?: Record<string, string>;
	/** Table session footer e.g. "1 - 3". */
	tableSessionLabel?: string;
	requestedAt: number;
	requesterId: string;
};

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

export function registerKotPrintPublisher(
	publisher: (payload: KotPrintRequestMessage) => Promise<void>
): void {
	publishKotPrintMessage = publisher;
}

export function unregisterKotPrintPublisher(): void {
	publishKotPrintMessage = null;
}

export type BillPrintRequestMessage = {
	bill: TBill;
	context: {
		kind: BillingContext['kind'];
		label: string;
		tableNumbers?: number[];
	};
	discount?: number;
	discountLabel?: string;
	/** When true, printer should emit native ESC/POS UPI QR. */
	includePaymentQr?: boolean;
	upiId?: string;
	upiPayload?: string;
	printJobId?: string;
	requestedAt: number;
	requesterId: string;
};

let publishBillPrintMessage:
	| ((payload: BillPrintRequestMessage) => Promise<void>)
	| null = null;

export function registerBillPrintPublisher(
	publisher: (payload: BillPrintRequestMessage) => Promise<void>
): void {
	publishBillPrintMessage = publisher;
}

export function unregisterBillPrintPublisher(): void {
	publishBillPrintMessage = null;
}

/** Publish a one-shot KOT print request for KOT Printer. */
export async function requestKotPrint(
	order: TOrder,
	options?: {
		mode?: 'new' | 'update';
		nameByBillName?: Record<string, string>;
		/** Defaults to a unique manual id so staff can force a reprint. */
		printJobId?: string;
		tableSessionLabel?: string;
		/** When true, skip quietly if sync/print channel is not ready. */
		soft?: boolean;
	}
): Promise<void> {
	if (typeof window === 'undefined') {
		return;
	}
	if (!publishKotPrintMessage) {
		if (options?.soft) {
			console.warn('[kot] print skipped — not connected to order sync');
			return;
		}
		throw new Error('Not connected to order sync — cannot reach KOT Printer');
	}

	const mode = options?.mode ?? 'new';
	const requestedAt = Date.now();
	const meta = await getOrderOpsMeta();
	const printJobId =
		options?.printJobId?.trim() ||
		`manual:${order.id}:${mode}:${requestedAt}`;

	try {
		await publishKotPrintMessage({
			order,
			mode,
			printJobId,
			nameByBillName: options?.nameByBillName,
			tableSessionLabel: options?.tableSessionLabel,
			requestedAt,
			requesterId: meta.deviceId || getStableDeviceId(),
		});
	} catch (error) {
		if (options?.soft) {
			console.warn('[kot] print publish failed:', error);
			return;
		}
		throw error;
	}
}

/**
 * After a local orders save, publish explicit kot:print for kitchen-relevant
 * new/updated orders. No-op when sync notify is suppressed (remote apply).
 */
export async function emitKotPrintsForLocalOrderChanges(
	prevOrders: TOrder[],
	nextOrders: TOrder[]
): Promise<void> {
	if (suppressSyncNotify || typeof window === 'undefined') {
		return;
	}
	if (!publishKotPrintMessage) {
		return;
	}

	const { collectKotPrintIntents } = await import('@/src/utils/kot_print_diff');
	const intents = collectKotPrintIntents(prevOrders, nextOrders);
	for (const intent of intents) {
		await requestKotPrint(intent.order, {
			mode: intent.mode,
			printJobId: intent.printJobId,
			soft: true,
		});
	}
}

/** Publish a customer bill print request for Bill Printer. */
export async function requestBillPrint(
	bill: TBill,
	context: BillingContext,
	options?: {
		discount?: number;
		discountLabel?: string;
		includePaymentQr?: boolean;
		upiId?: string;
		upiPayload?: string;
	}
): Promise<void> {
	if (typeof window === 'undefined') {
		return;
	}
	if (!publishBillPrintMessage) {
		throw new Error('Not connected to order sync — cannot reach Bill Printer');
	}

	const meta = await getOrderOpsMeta();
	const label =
		context.label?.trim() ||
		(context.kind === 'table' && context.tableNumbers.length > 0
			? `Table ${context.tableNumbers.join('+')}`
			: formatOrderKindLabel(context.kind));

	const requestedAt = Date.now();
	await publishBillPrintMessage({
		bill,
		context: {
			kind: context.kind,
			label,
			tableNumbers: context.tableNumbers,
		},
		discount: options?.discount,
		discountLabel: options?.discountLabel,
		includePaymentQr: options?.includePaymentQr === true,
		upiId: options?.upiId,
		upiPayload: options?.upiPayload,
		printJobId: `bill:${bill.billNumber}:${requestedAt}`,
		requestedAt,
		requesterId: meta.deviceId || getStableDeviceId(),
	});
}

export {
	BILL_PRINTER_DEVICE_NAME,
	KOT_PRINTER_DEVICE_NAME,
	isBillPrinterOnline,
	isKotPrinterOnline,
} from '@/src/utils/print_servers';

const PARCEL_CART_SUFFIX = ' (parcel)';

function cartItemsToOrderItems(cart: TCart): TOrderItem[] {
	return cart.items
		.filter((item) => item.qty > 0)
		.map((item) => {
			const isParcel = item.name.endsWith(PARCEL_CART_SUFFIX);
			const name = isParcel
				? item.name.slice(0, -PARCEL_CART_SUFFIX.length)
				: item.name;
			return {
				name,
				price: item.price,
				qty: item.qty,
				...(item.internal_name?.trim()
					? { internal_name: item.internal_name.trim() }
					: {}),
				unitStates: Array.from({ length: item.qty }, () => 'pending' as const),
				parcelUnits: Array.from({ length: item.qty }, () => isParcel),
			};
		});
}

/**
 * Build a printable TOrder from the current bill (works for freeflow and order checkout).
 */
export function buildKotOrderFromBill(
	bill: TBill,
	context: BillingContext,
	orderNumber?: number
): TOrder {
	return {
		id: `bill-kot:${bill.sessionId || context.sessionId}`,
		createdAt: bill.updatedAt || Date.now(),
		kind: context.kind,
		tableNumbers: context.tableNumbers ?? [],
		items: cartItemsToOrderItems(bill.cart),
		...(orderNumber != null && Number.isFinite(orderNumber)
			? { orderNumber: Math.floor(orderNumber) }
			: {}),
		...(bill.customerPhone?.trim()
			? { customerPhone: bill.customerPhone.trim() }
			: {}),
	};
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

	const { canPublishOrderOps } = await import('@/src/utils/sync_write_gate');
	if (!canPublishOrderOps()) {
		console.warn(`[sync-gate] block notifyOrderOpsChange(${domain})`);
		return;
	}

	await bumpOrderOpsDomain(domain);
	const snapshot = await buildOrderOpsDomainSnapshot(domain);

	if (updatePresenceData) {
		await updatePresenceData(snapshot);
	}

	if (publishStateDelta) {
		await publishStateDelta(snapshot);
	}

	dispatchOrderOpsUpdated(domain);
}

export async function notifyOrderOpsFullBroadcast(): Promise<void> {
	if (suppressSyncNotify || typeof window === 'undefined') {
		return;
	}

	const { canPublishOrderOps } = await import('@/src/utils/sync_write_gate');
	if (!canPublishOrderOps()) {
		console.warn('[sync-gate] block notifyOrderOpsFullBroadcast');
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

	dispatchOrderOpsUpdated('all');
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

/** True when the snapshot actually carries orders-domain payload (not a billing/inventory partial). */
export function ordersDomainIncluded(payload: OrderOpsSnapshot): boolean {
	if (payload.orders != null && payload.orders.length > 0) {
		return true;
	}
	if (payload.orderHistory != null && payload.orderHistory.length > 0) {
		return true;
	}
	// Legacy billing notifies carried empty placeholders — never treat as orders update.
	if (payload.billingSessions != null) {
		return false;
	}
	if (payload.nextOrderNumber != null) {
		return true;
	}
	return false;
}

function shouldApplyOrdersDomain(
	payload: OrderOpsSnapshot,
	localVersions: OrderOpsVersions,
	remoteVersions: OrderOpsVersions,
	legacyApplyAll: boolean
): boolean {
	if (!shouldApplyDomain(localVersions, remoteVersions, 'orders', legacyApplyAll)) {
		return false;
	}
	if (legacyApplyAll) {
		return true;
	}
	return ordersDomainIncluded(payload);
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
			shouldApplyOrdersDomain(
				payload,
				localVersions,
				remoteVersions,
				legacyApplyAll
			)
		) {
			const existing = await localforage.getItem<TOrdersStore>(ORDERS_KEY);
			const beforeOrders = existing?.orders ?? [];
			const beforeIds = new Set(beforeOrders.map((order) => order.id));

			const maintained = maintainOrders(payload.orders ?? [], Date.now());
			const payloadHistory = Array.isArray(payload.orderHistory)
				? payload.orderHistory
				: [];
			const localHistory = await getTodayOrderHistory();
			const billedIds = new Set<string>();
			for (const row of [...localHistory, ...payloadHistory]) {
				if (row.billedAt != null && row.id) {
					billedIds.add(row.id);
				}
			}
			const withoutResurrected = maintained.filter((order) => {
				if (billedIds.has(order.id)) {
					console.warn(
						`[sync] strip resurrected billed order ${order.id}`
					);
					return false;
				}
				return true;
			});
			newOrderIds = withoutResurrected
				.filter((order) => !beforeIds.has(order.id))
				.map((order) => order.id);

			await localforage.setItem<TOrdersStore>(ORDERS_KEY, {
				orders: withoutResurrected,
			});

			if (payload.orderHistory != null && payload.orderHistory.length > 0) {
				await replaceOrderHistoryFromSync(
					payload.businessDate,
					payload.orderHistory
				);
			} else {
				await upsertOrdersInHistory(withoutResurrected);
			}

			await applyDailyOrderNumberSnapshot(
				payload.businessDate,
				payload.nextOrderNumber,
				withoutResurrected,
				payload.orderHistory ?? localHistory
			);

			appliedVersions.orders = remoteVersions.orders;
		}

		if (
			shouldApplyDomain(
				localVersions,
				remoteVersions,
				'inventory',
				legacyApplyAll
			) &&
			payload.inventory != null
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

		if (
			shouldApplyDomain(
				localVersions,
				remoteVersions,
				'serviceRequests',
				legacyApplyAll
			) &&
			payload.serviceRequests
		) {
			await applyServiceRequestsSnapshot(
				payload.businessDate,
				payload.serviceRequests
			);
			appliedVersions.serviceRequests = remoteVersions.serviceRequests;
		}

		if (
			shouldApplyDomain(localVersions, remoteVersions, 'billing', legacyApplyAll) &&
			payload.billingSessions
		) {
			await applyBillingSessions(payload.billingSessions);
			appliedVersions.billing = remoteVersions.billing;
		}

		await setOrderOpsMetaVersions(appliedVersions, payload.businessDate);

		if (updatePresenceData) {
			await updatePresenceData(payload);
		}
	});

	const changedDomains = ORDER_OPS_DOMAINS.filter(
		(domain) => appliedVersions[domain] !== localVersions[domain]
	);
	dispatchOrderOpsUpdated(
		changedDomains.length === 1 ? changedDomains[0] : 'all'
	);
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

export function peerIsSyncHub(member: PresenceMember): boolean {
	return (
		member.data?.isSyncHub === true &&
		(getPeerInitialized(member) || getPeerStateVersion(member) > 0)
	);
}

function isHubRole(member: PresenceMember): boolean {
	return member.data?.role === 'syncHub' || member.data?.isSyncHub === true;
}

/** True if a sync-hub process is on the channel (ready or still booting). */
export function hasSyncHubMember(
	members: PresenceMember[],
	selfClientId: string,
	today: string
): boolean {
	return peersForToday(members, selfClientId, today).some(isHubRole);
}

function pickHighestVersionPeer(
	candidates: PresenceMember[]
): PresenceMember | null {
	if (candidates.length === 0) {
		return null;
	}
	return candidates.reduce((best, member) => {
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
}

export type PickSyncSourceOptions = {
	/**
	 * When true, if no ready hub is present, sync from tablets (pre-hub P2P).
	 * When false, a booting/silent hub blocks P2P so callers can wait then retry.
	 */
	p2pFallback?: boolean;
};

/**
 * Prefer a ready hub. If none: wait (unless p2pFallback) then highest-version peer.
 */
export function pickSyncSourcePeer(
	members: PresenceMember[],
	selfClientId: string,
	today: string,
	options?: PickSyncSourceOptions
): PresenceMember | null {
	const todayPeers = peersForToday(members, selfClientId, today);
	if (todayPeers.length === 0) {
		return null;
	}

	const readyHub = pickHighestVersionPeer(todayPeers.filter(peerIsSyncHub));
	if (readyHub) {
		return readyHub;
	}

	if (hasSyncHubMember(members, selfClientId, today) && !options?.p2pFallback) {
		return null;
	}

	const p2pPeers = todayPeers.filter((member) => !isHubRole(member));
	const pool = p2pPeers.filter(
		(member) => getPeerInitialized(member) || getPeerStateVersion(member) > 0
	);
	const candidates = pool.length > 0 ? pool : p2pPeers;
	return pickHighestVersionPeer(candidates);
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
			isSyncHub: peerIsSyncHub(member),
		};
	});

	const hasInitializedPeer = peers.some(
		(peer) => peer.initializedForToday || peer.stateVersion > 0
	);
	const localInitialized = meta.initializedForToday ?? false;

	if (localInitialized || !hasInitializedPeer) {
		return null;
	}

	// Hub present → auto-sync from hub; never show source picker.
	const hubPeer = peers.find((peer) => peer.isSyncHub);
	if (hubPeer) {
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
	respond: (payload: SyncResponseWireMessage) => Promise<void>
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

	await publishSyncResponseChunks(respond, {
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
	selfClientId: string,
	options?: PickSyncSourceOptions
): Promise<{ requested: boolean; reason: string }> {
	if (syncConflictBlocking) {
		return { requested: false, reason: 'conflict_blocking' };
	}

	const today = getTodayDateKey();
	const meta = await getOrderOpsMeta();

	if (meta.businessDate !== today) {
		return { requested: false, reason: 'wrong_date' };
	}

	const source = pickSyncSourcePeer(members, selfClientId, today, options);
	if (!source) {
		if (
			hasSyncHubMember(members, selfClientId, today) &&
			!options?.p2pFallback
		) {
			return { requested: false, reason: 'hub_not_ready' };
		}
		return { requested: false, reason: 'no_peers' };
	}

	const sourceVersions = getPeerVersions(source);
	const needsInitialSync = !meta.initializedForToday;
	const needsCatchUp = isAnyDomainBehind(meta.versions, sourceVersions);

	if (!needsInitialSync && !needsCatchUp) {
		return { requested: false, reason: 'already_current' };
	}

	if (
		needsInitialSync &&
		!needsCatchUp &&
		maxOrderOpsVersion(meta.versions) > 0
	) {
		return { requested: false, reason: 'initialized_local' };
	}

	const now = Date.now();
	if (now - lastSyncRequestAt < SYNC_REQUEST_COOLDOWN_MS) {
		return { requested: false, reason: 'cooldown' };
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
	return {
		requested: true,
		reason: peerIsSyncHub(source) ? 'from_hub' : 'from_peer',
	};
}

export type HandleSyncResponseResult = {
	applied: boolean;
	progress: SyncTransferProgress | null;
	/**
	 * Full sync:response was addressed to this device.
	 * Catch-up can complete even when apply is a no-op (empty / already-current SoT).
	 */
	completeForSelf: boolean;
};

export async function handleSyncResponse(
	message: SyncResponseMessage | SyncResponseWireMessage,
	assembler?: SyncResponseChunkAssembler
): Promise<HandleSyncResponseResult> {
	const meta = await getOrderOpsMeta();

	let complete: SyncResponseMessage | null = null;
	let progress: SyncTransferProgress | null = null;

	if (assembler && !isCompleteSyncResponse(message as SyncResponseWireMessage)) {
		const wire = message as SyncResponseWireMessage;
		if (wire.targetId !== meta.deviceId) {
			return { applied: false, progress: null, completeForSelf: false };
		}
		progress = assembler.getProgress(wire);
		complete = assembler.ingest(wire);
		if (complete && 'totalChunks' in wire && wire.totalChunks) {
			progress = {
				received: wire.totalChunks,
				total: wire.totalChunks,
			};
		} else if (!complete) {
			progress = assembler.getProgress(wire);
		}
	} else {
		complete = message as SyncResponseMessage;
		progress = { received: 1, total: 1 };
	}

	if (!complete) {
		return { applied: false, progress, completeForSelf: false };
	}

	if (complete.targetId !== meta.deviceId) {
		return { applied: false, progress: null, completeForSelf: false };
	}

	const applied = await applyOrderOpsSnapshot(complete);
	if (applied) {
		return { applied: true, progress, completeForSelf: true };
	}

	// Empty or already-current snapshot: still settle initial sync for today so
	// catch-up does not hang after the transfer timer is cleared.
	const today = getTodayDateKey();
	if (
		complete.businessDate === today &&
		meta.businessDate === today &&
		!isAnyDomainBehind(meta.versions, resolveSnapshotVersions(complete))
	) {
		if (!meta.initializedForToday) {
			await setOrderOpsMetaVersions(meta.versions, today);
		}
	}

	return { applied: false, progress, completeForSelf: true };
}

export function listFallbackSyncPeers(
	members: PresenceMember[],
	selfClientId: string,
	today: string
): SyncConflictPeer[] {
	const todayPeers = peersForToday(members, selfClientId, today);
	return todayPeers
		.filter(
			(member) =>
				!isHubRole(member) &&
				(getPeerInitialized(member) || getPeerStateVersion(member) > 0)
		)
		.map((member) => {
			const versions = getPeerVersions(member);
			return {
				clientId: member.clientId,
				deviceName: getPeerDeviceName(member),
				versions,
				stateVersion: maxOrderOpsVersion(versions),
				initializedForToday: getPeerInitialized(member),
				isSyncHub: false,
			};
		})
		.sort((a, b) => b.stateVersion - a.stateVersion);
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

export function orderIdsContentHash(orders: { id: string }[]): string {
	return orders
		.map((order) => order.id)
		.sort()
		.join('|');
}

export function isSyncHubOnlineAmong(
	members: PresenceMember[],
	selfClientId: string,
	today: string
): boolean {
	return peersForToday(members, selfClientId, today).some((member) =>
		peerIsSyncHub(member)
	);
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

/** Mark order as KOT-printed locally (idempotent). Hub also patches SoT; this covers manual KOT when hub is down. */
export async function applyKotPrintedAck(
	orderId: string,
	printedAt = Date.now()
): Promise<void> {
	if (!orderId || typeof window === 'undefined') {
		return;
	}
	const { getOrdersStore, saveOrdersStore } = await import(
		'@/src/utils/order_utils'
	);
	const store = await getOrdersStore();
	let changed = false;
	const nextOrders = store.orders.map((order) => {
		if (order.id !== orderId) {
			return order;
		}
		if (order.kotPrintedAt != null && order.kotPrintedAt >= printedAt) {
			return order;
		}
		changed = true;
		return { ...order, kotPrintedAt: printedAt };
	});
	if (!changed) {
		return;
	}
	await runWithoutSyncNotify(async () => {
		await saveOrdersStore({ orders: nextOrders });
	});
	dispatchOrderOpsUpdated('orders');
}

export type KotPrintAckMessage = {
	orderId?: string;
	printJobId?: string;
	printedAt?: number;
	error?: string;
	deviceId?: string;
};

