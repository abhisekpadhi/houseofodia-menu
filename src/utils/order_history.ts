import { TOrder } from '@/src/models/common';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export const ORDER_HISTORY_KEY = 'order_history';
const ORDERS_KEY = 'orders';

export type TOrderHistoryStore = {
	businessDate: string;
	orders: TOrder[];
};

export type OrderHistorySort = 'time-asc' | 'time-desc' | 'table-asc' | 'amount-desc';

export type OrderHistoryTableFilter = 'all' | 'takeaway' | 'delivery' | number;

async function readOrderHistoryStore(): Promise<TOrderHistoryStore> {
	if (typeof window === 'undefined') {
		return { businessDate: getTodayDateKey(), orders: [] };
	}

	try {
		const store = await localforage.getItem<TOrderHistoryStore>(ORDER_HISTORY_KEY);
		return store ?? { businessDate: getTodayDateKey(), orders: [] };
	} catch (error) {
		console.error('Failed to read order history:', error);
		return { businessDate: getTodayDateKey(), orders: [] };
	}
}

async function writeOrderHistoryStore(store: TOrderHistoryStore): Promise<void> {
	if (typeof window === 'undefined') {
		return;
	}

	await localforage.setItem(ORDER_HISTORY_KEY, store);
}

function isOrderFromBusinessDate(order: TOrder, businessDate: string): boolean {
	const createdKey = getTodayDateKey(new Date(order.createdAt));
	return createdKey === businessDate;
}

function mergeOrderSnapshot(order: TOrder, patch?: Partial<TOrder>): TOrder {
	return patch ? { ...order, ...patch } : order;
}

export async function upsertOrdersInHistory(
	orders: TOrder[],
	patch?: Partial<TOrder>
): Promise<void> {
	if (typeof window === 'undefined' || orders.length === 0) {
		return;
	}

	const today = getTodayDateKey();
	const store = await readOrderHistoryStore();
	const nextStore: TOrderHistoryStore =
		store.businessDate === today ? store : { businessDate: today, orders: [] };

	const byId = new Map(nextStore.orders.map((order) => [order.id, order]));

	for (const order of orders) {
		if (!isOrderFromBusinessDate(order, today)) {
			continue;
		}

		const existing = byId.get(order.id);
		const merged = existing
			? { ...existing, ...order, ...(patch ?? {}) }
			: mergeOrderSnapshot(order, patch);
		byId.set(order.id, merged);
	}

	nextStore.orders = Array.from(byId.values());
	await writeOrderHistoryStore(nextStore);
}

export async function replaceOrderHistoryFromSync(
	businessDate: string,
	orders: TOrder[]
): Promise<void> {
	if (typeof window === 'undefined') {
		return;
	}

	await writeOrderHistoryStore({
		businessDate,
		orders: orders.filter((order) =>
			isOrderFromBusinessDate(order, businessDate)
		),
	});
}

export async function getTodayOrderHistory(): Promise<TOrder[]> {
	const today = getTodayDateKey();
	const [historyStore, activeOrders] = await Promise.all([
		readOrderHistoryStore(),
		readActiveOrders(),
	]);

	const byId = new Map<string, TOrder>();

	if (historyStore.businessDate === today) {
		for (const order of historyStore.orders) {
			if (isOrderFromBusinessDate(order, today)) {
				byId.set(order.id, order);
			}
		}
	}

	for (const order of activeOrders) {
		if (!isOrderFromBusinessDate(order, today)) {
			continue;
		}

		const existing = byId.get(order.id);
		if (existing?.billedAt) {
			continue;
		}
		byId.set(order.id, order);
	}

	return Array.from(byId.values());
}

async function readActiveOrders(): Promise<TOrder[]> {
	if (typeof window === 'undefined') {
		return [];
	}

	try {
		const store = await localforage.getItem<{ orders: TOrder[] }>(ORDERS_KEY);
		return store?.orders ?? [];
	} catch {
		return [];
	}
}

export function getOrderHistoryStatus(order: TOrder): string {
	if (order.billedAt != null) {
		return 'Billed';
	}
	if (order.markedDoneAt != null) {
		return 'Done';
	}
	if (order.readyAt != null) {
		return 'Ready';
	}
	return 'Active';
}

export function getOrderHistoryTableLabel(order: TOrder): string {
	if (order.kind === 'takeaway') {
		return 'Takeaway';
	}
	if (order.kind === 'delivery') {
		return 'Delivery';
	}

	const tables = [...(order.tableNumbers ?? [])].sort((a, b) => a - b);
	if (tables.length === 0) {
		return 'Table';
	}
	if (tables.length === 1) {
		return `Table ${tables[0]}`;
	}
	return `Table ${tables.join(' & ')}`;
}

export function getOrderHistorySortKey(order: TOrder): number {
	if (order.kind !== 'table') {
		return order.kind === 'takeaway' ? 1000 : 1001;
	}

	const tables = order.tableNumbers ?? [];
	return tables.length > 0 ? Math.min(...tables) : 999;
}

export function filterOrderHistory(
	orders: TOrder[],
	tableFilter: OrderHistoryTableFilter
): TOrder[] {
	if (tableFilter === 'all') {
		return orders;
	}

	if (tableFilter === 'takeaway') {
		return orders.filter((order) => order.kind === 'takeaway');
	}

	if (tableFilter === 'delivery') {
		return orders.filter((order) => order.kind === 'delivery');
	}

	return orders.filter(
		(order) =>
			order.kind === 'table' && (order.tableNumbers ?? []).includes(tableFilter)
	);
}

export function sortOrderHistory(
	orders: TOrder[],
	sort: OrderHistorySort
): TOrder[] {
	const sorted = [...orders];

	switch (sort) {
		case 'time-desc':
			sorted.sort((a, b) => b.createdAt - a.createdAt);
			break;
		case 'table-asc':
			sorted.sort((a, b) => {
				const tableDiff = getOrderHistorySortKey(a) - getOrderHistorySortKey(b);
				return tableDiff !== 0 ? tableDiff : a.createdAt - b.createdAt;
			});
			break;
		case 'amount-desc':
			sorted.sort((a, b) => {
				const totalA = a.items.reduce(
					(sum, item) => sum + item.price * item.qty,
					0
				);
				const totalB = b.items.reduce(
					(sum, item) => sum + item.price * item.qty,
					0
				);
				return totalB - totalA || a.createdAt - b.createdAt;
			});
			break;
		case 'time-asc':
		default:
			sorted.sort((a, b) => a.createdAt - b.createdAt);
			break;
	}

	return sorted;
}

function escapeCsvCell(value: string | number): string {
	const text = String(value);
	if (/[",\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export function buildOrderHistoryCsv(orders: TOrder[]): string {
	const header = [
		'Time',
		'Table',
		'Order ID',
		'Item',
		'Qty',
		'Unit Price',
		'Line Total',
		'Order Total',
		'Status',
		'Notes',
	];

	const rows = [header.join(',')];

	for (const order of orders) {
		const orderTotal = order.items.reduce(
			(sum, item) => sum + item.price * item.qty,
			0
		);
		const tableLabel = getOrderHistoryTableLabel(order);
		const status = getOrderHistoryStatus(order);
		const time = new Date(order.createdAt).toLocaleString('en-IN', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
		});
		const notes = order.notes?.trim() ?? '';

		if (order.items.length === 0) {
			rows.push(
				[
					time,
					tableLabel,
					order.id,
					'',
					0,
					0,
					0,
					orderTotal,
					status,
					notes,
				]
					.map(escapeCsvCell)
					.join(',')
			);
			continue;
		}

		for (const item of order.items) {
			rows.push(
				[
					time,
					tableLabel,
					order.id,
					item.name,
					item.qty,
					item.price,
					item.price * item.qty,
					orderTotal,
					status,
					notes,
				]
					.map(escapeCsvCell)
					.join(',')
			);
		}
	}

	return `\uFEFF${rows.join('\n')}`;
}

export async function shareOrderHistoryAsExcel(
	orders: TOrder[],
	dateKey = getTodayDateKey()
): Promise<void> {
	const csv = buildOrderHistoryCsv(orders);
	const filename = `order-history-${dateKey}.csv`;
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const file = new File([blob], filename, { type: 'text/csv' });

	if (
		typeof navigator !== 'undefined' &&
		'share' in navigator &&
		(typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))
	) {
		await navigator.share({
			files: [file],
			title: `Order history ${dateKey}`,
		});
		return;
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
