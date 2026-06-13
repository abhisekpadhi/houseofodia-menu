import {
	ORDER_OPS_DEVICE_ID_KEY,
	ORDER_OPS_DEVICE_NAME_KEY,
	ORDER_OPS_META_KEY,
	ORDER_OPS_EVENT,
	ORDER_OPS_NEW_ORDERS_EVENT,
	OrderOpsMeta,
	OrderOpsNewOrdersDetail,
	OrderOpsSnapshot,
} from '@/src/models/order_ops';
import { TOrdersStore } from '@/src/models/common';
import { getInventorySnapshotForDate, getTodayDateKey } from '@/src/utils/inventory_utils';
import { getTodayOrderHistory } from '@/src/utils/order_history';
import { getOrdersStore, maintainOrders } from '@/src/utils/order_utils';
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

function nextStateVersion(current: number): number {
	return Math.max(current + 1, Date.now());
}

function createFreshMeta(deviceId: string): OrderOpsMeta {
	return {
		deviceId,
		stateVersion: 0,
		businessDate: getTodayDateKey(),
		lastUpdatedAt: Date.now(),
		initializedForToday: false,
	};
}

function normalizeMetaForToday(stored: OrderOpsMeta, today: string): OrderOpsMeta {
	if (stored.businessDate !== today) {
		return {
			deviceId: stored.deviceId,
			stateVersion: 0,
			businessDate: today,
			lastUpdatedAt: Date.now(),
			initializedForToday: false,
		};
	}

	return {
		...stored,
		businessDate: today,
		initializedForToday:
			stored.initializedForToday ?? stored.stateVersion > 0,
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
	if (
		meta.businessDate !== stored.businessDate ||
		meta.stateVersion !== stored.stateVersion ||
		meta.initializedForToday !== stored.initializedForToday
	) {
		await localforage.setItem(ORDER_OPS_META_KEY, meta);
	}
	return meta;
}

export async function bumpOrderOpsMeta(): Promise<OrderOpsMeta> {
	const meta = await getOrderOpsMeta();
	const today = getTodayDateKey();
	const next: OrderOpsMeta = {
		...meta,
		stateVersion: nextStateVersion(meta.stateVersion),
		businessDate: today,
		lastUpdatedAt: Date.now(),
		initializedForToday: true,
	};
	await localforage.setItem(ORDER_OPS_META_KEY, next);
	return next;
}

export async function setOrderOpsMetaVersion(
	stateVersion: number,
	businessDate: string
): Promise<OrderOpsMeta> {
	const meta = await getOrderOpsMeta();
	const next: OrderOpsMeta = {
		...meta,
		stateVersion,
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

	return {
		deviceId: meta.deviceId,
		stateVersion: meta.stateVersion,
		businessDate,
		orders,
		inventory,
		orderHistory,
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
