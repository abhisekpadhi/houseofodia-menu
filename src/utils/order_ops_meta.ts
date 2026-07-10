import {
	ORDER_OPS_DEVICE_ID_KEY,
	ORDER_OPS_DEVICE_NAME_KEY,
	ORDER_OPS_META_KEY,
	ORDER_OPS_EVENT,
	ORDER_OPS_NEW_ORDERS_EVENT,
	maxOrderOpsVersion,
	mergeOrderOpsVersions,
	OrderOpsDomain,
	OrderOpsMeta,
	OrderOpsNewOrdersDetail,
	OrderOpsSnapshot,
	OrderOpsVersions,
	ORDER_OPS_DOMAINS,
	ZERO_ORDER_OPS_VERSIONS,
	versionsFromLegacyStateVersion,
} from '@/src/models/order_ops';
import { TOrdersStore } from '@/src/models/common';
import { getInventorySnapshotForDate, getTodayDateKey } from '@/src/utils/inventory_utils';
import { getTodayOrderHistory } from '@/src/utils/order_history';
import { getOrdersStore, maintainOrders } from '@/src/utils/order_utils';
import { getDayChecklistSnapshotForDate, pruneDayChecklistsForToday } from '@/src/utils/day_checklist_utils';
import { getSupplyInventorySnapshotForDate } from '@/src/utils/supply_inventory_utils';
import { getWaitlistSnapshotForDate } from '@/src/utils/waitlist_utils';
import { getServiceRequestsSnapshotForDate } from '@/src/utils/service_requests_utils';
import localforage from 'localforage';

const DEVICE_ID_PATTERN =
	/^device-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function getStableDeviceId(): string {
	if (typeof window === 'undefined') {
		return 'device-server';
	}

	const existing = localStorage.getItem(ORDER_OPS_DEVICE_ID_KEY);
	if (existing && DEVICE_ID_PATTERN.test(existing)) {
		return existing;
	}

	const id = `device-${crypto.randomUUID()}`;
	localStorage.setItem(ORDER_OPS_DEVICE_ID_KEY, id);
	return id;
}

export function getDeviceDisplayName(): string {
	if (typeof window === 'undefined') {
		return 'Server';
	}

	const custom = localStorage.getItem(ORDER_OPS_DEVICE_NAME_KEY)?.trim();
	if (custom) {
		return custom;
	}

	const id = getStableDeviceId();
	return `Device ${id.slice(-4)}`;
}

export function setDeviceDisplayName(name: string): void {
	if (typeof window === 'undefined') {
		return;
	}

	const trimmed = name.trim();
	if (trimmed) {
		localStorage.setItem(ORDER_OPS_DEVICE_NAME_KEY, trimmed);
		return;
	}

	localStorage.removeItem(ORDER_OPS_DEVICE_NAME_KEY);
}

function nextDomainVersion(current: number): number {
	return Math.max(current + 1, Date.now());
}

function migrateMetaVersions(stored: OrderOpsMeta): OrderOpsVersions {
	if (stored.versions) {
		return mergeOrderOpsVersions(ZERO_ORDER_OPS_VERSIONS, stored.versions);
	}
	return versionsFromLegacyStateVersion(stored.stateVersion ?? 0);
}

function createFreshMeta(deviceId: string): OrderOpsMeta {
	return {
		deviceId,
		versions: { ...ZERO_ORDER_OPS_VERSIONS },
		businessDate: getTodayDateKey(),
		lastUpdatedAt: Date.now(),
		initializedForToday: false,
	};
}

function normalizeMetaForToday(stored: OrderOpsMeta, today: string): OrderOpsMeta {
	const versions = migrateMetaVersions(stored);

	if (stored.businessDate !== today) {
		return {
			deviceId: stored.deviceId,
			versions: { ...ZERO_ORDER_OPS_VERSIONS },
			businessDate: today,
			lastUpdatedAt: Date.now(),
			initializedForToday: false,
		};
	}

	return {
		deviceId: stored.deviceId,
		versions,
		businessDate: today,
		lastUpdatedAt: stored.lastUpdatedAt,
		initializedForToday:
			stored.initializedForToday ?? maxOrderOpsVersion(versions) > 0,
	};
}

export async function getOrderOpsMeta(): Promise<OrderOpsMeta> {
	const deviceId = getStableDeviceId();
	const today = getTodayDateKey();
	const stored = await localforage.getItem<OrderOpsMeta>(ORDER_OPS_META_KEY);

	if (!stored || stored.deviceId !== deviceId) {
		const meta = createFreshMeta(deviceId);
		await localforage.setItem(ORDER_OPS_META_KEY, meta);
		return meta;
	}

	const meta = normalizeMetaForToday(stored, today);
	if (stored.businessDate !== today) {
		await pruneDayChecklistsForToday(today);
	}
	const storedVersions = migrateMetaVersions(stored);
	const versionsChanged = ORDER_OPS_DOMAINS.some(
		(domain) => meta.versions[domain] !== storedVersions[domain]
	);
	if (
		meta.businessDate !== stored.businessDate ||
		versionsChanged ||
		meta.initializedForToday !== stored.initializedForToday
	) {
		await localforage.setItem(ORDER_OPS_META_KEY, meta);
	}
	return meta;
}

export async function bumpOrderOpsDomain(
	domain: OrderOpsDomain,
	meta?: OrderOpsMeta
): Promise<OrderOpsMeta> {
	const current = meta ?? (await getOrderOpsMeta());
	const today = getTodayDateKey();
	const next: OrderOpsMeta = {
		...current,
		versions: {
			...current.versions,
			[domain]: nextDomainVersion(current.versions[domain]),
		},
		businessDate: today,
		lastUpdatedAt: Date.now(),
		initializedForToday: true,
	};
	await localforage.setItem(ORDER_OPS_META_KEY, next);
	return next;
}

export async function bumpAllOrderOpsDomains(): Promise<OrderOpsMeta> {
	let meta = await getOrderOpsMeta();
	for (const domain of ORDER_OPS_DOMAINS) {
		meta = await bumpOrderOpsDomain(domain, meta);
	}
	return meta;
}

/** @deprecated Use bumpOrderOpsDomain(domain) */
export async function bumpOrderOpsMeta(): Promise<OrderOpsMeta> {
	return bumpAllOrderOpsDomains();
}

export async function setOrderOpsMetaVersions(
	versions: OrderOpsVersions,
	businessDate: string
): Promise<OrderOpsMeta> {
	const meta = await getOrderOpsMeta();
	const next: OrderOpsMeta = {
		...meta,
		versions: mergeOrderOpsVersions(meta.versions, versions),
		businessDate,
		lastUpdatedAt: Date.now(),
		initializedForToday: true,
	};
	await localforage.setItem(ORDER_OPS_META_KEY, next);
	return next;
}

export async function buildOrderOpsSnapshot(): Promise<OrderOpsSnapshot> {
	const meta = await getOrderOpsMeta();
	const businessDate = getTodayDateKey();
	const store: TOrdersStore = await getOrdersStore();
	const orders = maintainOrders(store.orders, Date.now());
	const inventory = await getInventorySnapshotForDate(businessDate);
	const orderHistory = await getTodayOrderHistory();
	const [dayChecklists, supplyInventory, waitlist, serviceRequests] =
		await Promise.all([
			getDayChecklistSnapshotForDate(businessDate),
			getSupplyInventorySnapshotForDate(businessDate),
			getWaitlistSnapshotForDate(businessDate),
			getServiceRequestsSnapshotForDate(businessDate),
		]);

	return {
		deviceId: meta.deviceId,
		versions: meta.versions,
		stateVersion: maxOrderOpsVersion(meta.versions),
		businessDate,
		orders,
		inventory,
		orderHistory,
		dayChecklists,
		supplyInventory,
		waitlist,
		serviceRequests,
		sentAt: Date.now(),
	};
}

export function dispatchOrderOpsUpdated(): void {
	if (typeof window === 'undefined') {
		return;
	}
	window.dispatchEvent(new CustomEvent(ORDER_OPS_EVENT));
}

export function dispatchNewOrdersSynced(orderIds: string[]): void {
	if (typeof window === 'undefined' || orderIds.length === 0) {
		return;
	}

	const detail: OrderOpsNewOrdersDetail = {
		orderIds,
		count: orderIds.length,
	};
	window.dispatchEvent(
		new CustomEvent<OrderOpsNewOrdersDetail>(ORDER_OPS_NEW_ORDERS_EVENT, {
			detail,
		})
	);
}
