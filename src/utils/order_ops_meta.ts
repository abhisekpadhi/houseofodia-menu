import {
	ORDER_OPS_DEVICE_ID_KEY,
	ORDER_OPS_META_KEY,
	ORDER_OPS_EVENT,
	OrderOpsMeta,
	OrderOpsSnapshot,
} from '@/src/models/order_ops';
import { TOrdersStore } from '@/src/models/common';
import { getInventorySnapshotForDate, getTodayDateKey } from '@/src/utils/inventory_utils';
import { getOrdersStore, maintainOrders } from '@/src/utils/order_utils';
import localforage from 'localforage';

const DEVICE_ID_PATTERN = /^device-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

export async function getOrderOpsMeta(): Promise<OrderOpsMeta> {
	const deviceId = getStableDeviceId();
	const stored = await localforage.getItem<OrderOpsMeta>(ORDER_OPS_META_KEY);

	if (stored && stored.deviceId === deviceId) {
		return stored;
	}

	const meta: OrderOpsMeta = {
		deviceId,
		stateVersion: 0,
		businessDate: getTodayDateKey(),
		lastUpdatedAt: Date.now(),
	};
	await localforage.setItem(ORDER_OPS_META_KEY, meta);
	return meta;
}

export async function bumpOrderOpsMeta(): Promise<OrderOpsMeta> {
	const meta = await getOrderOpsMeta();
	const next: OrderOpsMeta = {
		...meta,
		stateVersion: meta.stateVersion + 1,
		businessDate: getTodayDateKey(),
		lastUpdatedAt: Date.now(),
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
	};
	await localforage.setItem(ORDER_OPS_META_KEY, next);
	return next;
}

export async function buildOrderOpsSnapshot(): Promise<OrderOpsSnapshot> {
	const meta = await getOrderOpsMeta();
	const store: TOrdersStore = await getOrdersStore();
	const businessDate = getTodayDateKey();
	const orders = maintainOrders(store.orders, Date.now());
	const inventory = await getInventorySnapshotForDate(businessDate);

	return {
		deviceId: meta.deviceId,
		stateVersion: meta.stateVersion,
		businessDate,
		orders,
		inventory,
		sentAt: Date.now(),
	};
}

export function dispatchOrderOpsUpdated(): void {
	if (typeof window === 'undefined') {
		return;
	}
	window.dispatchEvent(new CustomEvent(ORDER_OPS_EVENT));
}
