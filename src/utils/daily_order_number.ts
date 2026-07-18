import { TOrder } from '@/src/models/common';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import { getTodayOrderHistory } from '@/src/utils/order_history';
import localforage from 'localforage';

export const DAILY_ORDER_NUMBER_KEY = 'daily_order_number';

type DailyOrderNumberStore = {
	businessDate: string;
	/** Next number to assign (1 on a fresh day) */
	next: number;
};

function maxOrderNumberFromOrders(orders: TOrder[], businessDate: string): number {
	let max = 0;
	for (const order of orders) {
		if (order.orderNumber == null || !Number.isFinite(order.orderNumber)) {
			continue;
		}
		if (getTodayDateKey(new Date(order.createdAt)) !== businessDate) {
			continue;
		}
		max = Math.max(max, Math.floor(order.orderNumber));
	}
	return max;
}

async function readStore(): Promise<DailyOrderNumberStore> {
	const today = getTodayDateKey();
	try {
		const stored = await localforage.getItem<DailyOrderNumberStore>(
			DAILY_ORDER_NUMBER_KEY
		);
		if (stored?.businessDate === today && typeof stored.next === 'number') {
			return {
				businessDate: today,
				next: Math.max(1, Math.floor(stored.next)),
			};
		}
	} catch (error) {
		console.error('Failed to read daily order number:', error);
	}
	return { businessDate: today, next: 1 };
}

async function writeStore(store: DailyOrderNumberStore): Promise<void> {
	await localforage.setItem(DAILY_ORDER_NUMBER_KEY, store);
}

/** Next serial to assign today across active + history + persisted counter. */
export async function getNextDailyOrderNumber(
	activeOrders: TOrder[] = []
): Promise<number> {
	const today = getTodayDateKey();
	const [store, history] = await Promise.all([
		readStore(),
		getTodayOrderHistory(),
	]);
	const maxAssigned = Math.max(
		maxOrderNumberFromOrders(activeOrders, today),
		maxOrderNumberFromOrders(history, today),
		store.next - 1
	);
	return Math.max(1, maxAssigned + 1);
}

/**
 * Reserve and return the next global daily order serial (#1, #2, …).
 * One sequence for the whole day across table, takeaway, and delivery.
 * Persists the counter so discarded orders still advance the sequence.
 */
export async function allocateNextDailyOrderNumber(
	activeOrders: TOrder[] = []
): Promise<number> {
	const today = getTodayDateKey();
	const next = await getNextDailyOrderNumber(activeOrders);
	await writeStore({ businessDate: today, next: next + 1 });
	return next;
}

export async function getDailyOrderNumberSnapshot(): Promise<number> {
	return (await readStore()).next;
}

/** Merge remote counter / assigned numbers so the sequence only moves forward. */
export async function applyDailyOrderNumberSnapshot(
	businessDate: string,
	nextOrderNumber: number | undefined,
	orders: TOrder[] = [],
	orderHistory: TOrder[] = []
): Promise<void> {
	const today = getTodayDateKey();
	if (businessDate !== today) {
		return;
	}

	const local = await readStore();
	const maxAssigned = Math.max(
		maxOrderNumberFromOrders(orders, today),
		maxOrderNumberFromOrders(orderHistory, today)
	);
	const remoteNext =
		typeof nextOrderNumber === 'number' && Number.isFinite(nextOrderNumber)
			? Math.max(1, Math.floor(nextOrderNumber))
			: 1;

	const mergedNext = Math.max(local.next, remoteNext, maxAssigned + 1, 1);
	await writeStore({ businessDate: today, next: mergedNext });
}

export function formatDailyOrderNumber(orderNumber: number | undefined): string {
	if (orderNumber == null || !Number.isFinite(orderNumber) || orderNumber < 1) {
		return '';
	}
	return `#${Math.floor(orderNumber)}`;
}
