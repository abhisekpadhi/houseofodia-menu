import { TOrder } from '@/src/models/common';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	formatTableGroupLabel,
	getOrderGroupKey,
} from '@/src/utils/order_utils';
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

function orderLineTotal(order: TOrder): number {
	return order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function formatHistoryClockTime(ms: number): string {
	return new Date(ms).toLocaleString('en-IN', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	});
}

function formatSessionDateTime(ms: number): string {
	return new Date(ms).toLocaleString('en-IN', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	});
}

function sessionPax(orders: TOrder[]): number | '' {
	for (const order of orders) {
		if (order.pax != null && order.pax >= 1) {
			return order.pax;
		}
	}
	return '';
}

export type OrderHistorySession = {
	sessionLabel: string;
	groupKey: string;
	tableLabel: string;
	sessionNumber: number;
	startedAt: number;
	closedAt: number | null;
	pax: number | '';
	sessionTotal: number;
	/** Present when the session was closed with a saved bill snapshot */
	billSummary?: {
		subtotal: number;
		cgst: number;
		sgst: number;
		roundOff: number;
		payable: number;
		billNumber?: string;
	};
	orders: TOrder[];
};

function sessionBillSummary(orders: TOrder[]) {
	return orders.find((order) => order.billSummary)?.billSummary;
}

function sessionAmountTotal(orders: TOrder[]): number {
	const summary = sessionBillSummary(orders);
	if (summary) {
		return summary.payable;
	}
	return orders.reduce((sum, order) => sum + orderLineTotal(order), 0);
}

/** Groups orders into table/takeaway/delivery sessions closed by "Close table" (billedAt batch). */
export function buildOrderHistorySessions(orders: TOrder[]): OrderHistorySession[] {
	const byGroup = new Map<string, TOrder[]>();

	for (const order of orders) {
		const groupKey = getOrderGroupKey(order);
		const groupOrders = byGroup.get(groupKey) ?? [];
		groupOrders.push(order);
		byGroup.set(groupKey, groupOrders);
	}

	const sessions: OrderHistorySession[] = [];

	for (const [groupKey, groupOrders] of Array.from(byGroup.entries())) {
		const closedByBilledAt = new Map<number, TOrder[]>();
		const openOrders: TOrder[] = [];

		for (const order of groupOrders) {
			if (order.billedAt != null) {
				const batch = closedByBilledAt.get(order.billedAt) ?? [];
				batch.push(order);
				closedByBilledAt.set(order.billedAt, batch);
			} else {
				openOrders.push(order);
			}
		}

		const tableLabel =
			groupOrders[0]?.kind === 'table'
				? formatTableGroupLabel(groupOrders[0].tableNumbers ?? [])
				: getOrderHistoryTableLabel(groupOrders[0]);

		let sessionNumber = 1;

		const closedSessions = Array.from(closedByBilledAt.entries()).sort(
			(a, b) => a[0] - b[0]
		);

		for (const [closedAt, sessionOrders] of closedSessions) {
			const sortedOrders = [...sessionOrders].sort(
				(a, b) => a.createdAt - b.createdAt
			);
			const startedAt = sortedOrders[0]?.createdAt ?? closedAt;
			sessions.push({
				sessionLabel: `${tableLabel} · Session ${sessionNumber}`,
				groupKey,
				tableLabel,
				sessionNumber,
				startedAt,
				closedAt,
				pax: sessionPax(sortedOrders),
				sessionTotal: sessionAmountTotal(sortedOrders),
				billSummary: sessionBillSummary(sortedOrders),
				orders: sortedOrders,
			});
			sessionNumber += 1;
		}

		if (openOrders.length > 0) {
			const sortedOrders = [...openOrders].sort(
				(a, b) => a.createdAt - b.createdAt
			);
			const startedAt = sortedOrders[0]?.createdAt ?? Date.now();
			sessions.push({
				sessionLabel: `${tableLabel} · Session ${sessionNumber}`,
				groupKey,
				tableLabel,
				sessionNumber,
				startedAt,
				closedAt: null,
				pax: sessionPax(sortedOrders),
				sessionTotal: sessionAmountTotal(sortedOrders),
				billSummary: sessionBillSummary(sortedOrders),
				orders: sortedOrders,
			});
		}
	}

	sessions.sort(
		(a, b) =>
			a.startedAt - b.startedAt ||
			a.tableLabel.localeCompare(b.tableLabel) ||
			a.sessionNumber - b.sessionNumber
	);

	return sessions;
}

export function formatOrderHistorySessionTime(ms: number): string {
	return formatSessionDateTime(ms);
}

export function getOrderHistoryTotalPax(
	sessions: OrderHistorySession[]
): number {
	return sessions.reduce((sum, session) => {
		if (typeof session.pax === 'number') {
			return sum + session.pax;
		}
		return sum;
	}, 0);
}

export function sortOrderHistorySessions(
	sessions: OrderHistorySession[],
	sort: OrderHistorySort
): OrderHistorySession[] {
	const sorted = [...sessions];

	switch (sort) {
		case 'time-desc':
			sorted.sort(
				(a, b) =>
					b.startedAt - a.startedAt ||
					a.tableLabel.localeCompare(b.tableLabel) ||
					a.sessionNumber - b.sessionNumber
			);
			break;
		case 'table-asc':
			sorted.sort(
				(a, b) =>
					a.tableLabel.localeCompare(b.tableLabel) ||
					a.sessionNumber - b.sessionNumber ||
					a.startedAt - b.startedAt
			);
			break;
		case 'amount-desc':
			sorted.sort(
				(a, b) =>
					b.sessionTotal - a.sessionTotal ||
					a.startedAt - b.startedAt ||
					a.tableLabel.localeCompare(b.tableLabel)
			);
			break;
		case 'time-asc':
		default:
			sorted.sort(
				(a, b) =>
					a.startedAt - b.startedAt ||
					a.tableLabel.localeCompare(b.tableLabel) ||
					a.sessionNumber - b.sessionNumber
			);
			break;
	}

	return sorted;
}

function sessionBillCsvFields(session: OrderHistorySession): (string | number)[] {
	const summary = session.billSummary;
	if (!summary) {
		return ['', '', '', '', ''];
	}
	return [
		summary.subtotal,
		summary.cgst,
		summary.sgst,
		summary.roundOff,
		summary.payable,
	];
}

export function buildOrderHistoryCsv(orders: TOrder[]): string {
	const header = [
		'Session',
		'Table',
		'Session Start',
		'Session End',
		'Session Pax',
		'Session Total',
		'SubTotal',
		'CGST',
		'SGST',
		'Round Off',
		'Payable',
		'Bill No',
		'Order Time',
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
	const sessions = buildOrderHistorySessions(orders);

	for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
		const session = sessions[sessionIndex];
		const sessionStart = formatSessionDateTime(session.startedAt);
		const sessionEnd =
			session.closedAt != null
				? formatSessionDateTime(session.closedAt)
				: 'Open';
		const billFields = sessionBillCsvFields(session);
		const billNumber = session.billSummary?.billNumber ?? '';

		for (const order of session.orders) {
			const orderTotal = orderLineTotal(order);
			const status = getOrderHistoryStatus(order);
			const orderTime = formatHistoryClockTime(order.createdAt);
			const notes = order.notes?.trim() ?? '';

			if (order.items.length === 0) {
				rows.push(
					[
						session.sessionLabel,
						session.tableLabel,
						sessionStart,
						sessionEnd,
						session.pax,
						session.sessionTotal,
						...billFields,
						billNumber,
						orderTime,
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
						session.sessionLabel,
						session.tableLabel,
						sessionStart,
						sessionEnd,
						session.pax,
						session.sessionTotal,
						...billFields,
						billNumber,
						orderTime,
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

		if (sessionIndex < sessions.length - 1) {
			rows.push('');
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
