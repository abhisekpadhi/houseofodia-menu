import type {
	BillingContext,
	OrderBillSummary,
	TOrder,
} from '@/src/models/common';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	getTodayOrderHistory,
	upsertOrdersInHistory,
} from '@/src/utils/order_history';
import {
	bumpOrderOpsDomain,
	dispatchOrderOpsUpdated,
	setOrderOpsMetaVersions,
	getOrderOpsMeta,
	getStableDeviceId,
} from '@/src/utils/order_ops_meta';
import {
	getOrdersStore,
	orderBelongsToBillingGroup,
} from '@/src/utils/order_utils';
import localforage from 'localforage';

const ORDERS_KEY = 'orders';

export type TableCloseIntent = {
	closeId: string;
	deviceId: string;
	businessDate: string;
	sessionId: string;
	groupKey: string;
	kind: BillingContext['kind'];
	tableNumbers: number[];
	orderIds: string[];
	billedAt: number;
	billSummary?: OrderBillSummary;
	sentAt: number;
};

let publishTableCloseIntent:
	| ((intent: TableCloseIntent) => Promise<void>)
	| null = null;

export function registerTableClosePublisher(
	publisher: (intent: TableCloseIntent) => Promise<void>,
): void {
	publishTableCloseIntent = publisher;
}

export function unregisterTableClosePublisher(): void {
	publishTableCloseIntent = null;
}

export function resolveCloseOrderIds(
	context: BillingContext,
	activeOrders: TOrder[],
): string[] {
	const frozen = (context.orderIds ?? []).map((id) => id.trim()).filter(Boolean);
	if (frozen.length > 0) {
		return frozen;
	}
	return activeOrders
		.filter((order) => orderBelongsToBillingGroup(order, context))
		.map((order) => order.id);
}

export function buildTableCloseIntent(
	context: BillingContext,
	orderIds: string[],
	billSummary?: OrderBillSummary,
): TableCloseIntent {
	const billedAt = Date.now();
	return {
		closeId: `close:${context.sessionId}`,
		deviceId: getStableDeviceId(),
		businessDate: getTodayDateKey(),
		sessionId: context.sessionId,
		groupKey: context.groupKey,
		kind: context.kind,
		tableNumbers: context.tableNumbers ?? [],
		orderIds,
		billedAt,
		...(billSummary ? { billSummary } : {}),
		sentAt: billedAt,
	};
}

export function isTableCloseFullyApplied(
	orderHistory: TOrder[],
	intent: TableCloseIntent,
): boolean {
	const ids = intent.orderIds.map((id) => id.trim()).filter(Boolean);
	if (ids.length === 0) return false;
	return ids.every((id) => {
		const row = orderHistory.find((order) => order.id === id);
		return row?.billedAt != null;
	});
}

export function applyTableCloseIntent(
	activeOrders: TOrder[],
	orderHistory: TOrder[],
	intent: TableCloseIntent,
): { orders: TOrder[]; orderHistory: TOrder[]; changed: boolean } {
	const ids = new Set(intent.orderIds.map((id) => id.trim()).filter(Boolean));
	if (ids.size === 0) {
		return { orders: activeOrders, orderHistory, changed: false };
	}

	if (isTableCloseFullyApplied(orderHistory, intent)) {
		const remaining = activeOrders.filter(
			(order) => !ids.has(order.id.trim()),
		);
		const activeChanged = remaining.length !== activeOrders.length;
		return {
			orders: remaining,
			orderHistory,
			changed: activeChanged,
		};
	}

	const billPatch: Partial<TOrder> = {
		billedAt: intent.billedAt,
		...(intent.billSummary ? { billSummary: intent.billSummary } : {}),
	};

	const toArchive: TOrder[] = [];
	const remaining = activeOrders.filter((order) => {
		const id = order.id.trim();
		if (!ids.has(id)) return true;
		const alreadyBilled = orderHistory.some(
			(row) => row.id === id && row.billedAt != null,
		);
		if (alreadyBilled) return false;
		toArchive.push({ ...order, ...billPatch });
		return false;
	});

	if (toArchive.length === 0) {
		return { orders: remaining, orderHistory, changed: remaining.length !== activeOrders.length };
	}

	const byId = new Map(orderHistory.map((order) => [order.id, order]));
	for (const archived of toArchive) {
		const existing = byId.get(archived.id);
		byId.set(
			archived.id,
			existing ? { ...existing, ...archived } : archived,
		);
	}

	return {
		orders: remaining,
		orderHistory: Array.from(byId.values()),
		changed: true,
	};
}

async function persistCloseLocally(
	orders: TOrder[],
	archived: TOrder[],
	billPatch: Partial<TOrder>,
): Promise<void> {
	await localforage.setItem(ORDERS_KEY, { orders });
	if (archived.length > 0) {
		await upsertOrdersInHistory(archived, billPatch);
	}
}

/** Apply close locally and publish orders:close (no full orders snapshot). */
export async function closeTableWithIntent(
	context: BillingContext,
	billSummary?: OrderBillSummary,
): Promise<TOrder[]> {
	if (typeof window === 'undefined') {
		return [];
	}

	const { assertCanPublishOrderOps } = await import('@/src/utils/sync_write_gate');
	assertCanPublishOrderOps();

	const store = await getOrdersStore();
	const orderIds = resolveCloseOrderIds(context, store.orders);
	if (orderIds.length === 0) {
		console.warn('[close] no order ids to archive for session', context.sessionId);
		return store.orders;
	}

	const intent = buildTableCloseIntent(context, orderIds, billSummary);
	const history = await getTodayOrderHistory();
	const billPatch: Partial<TOrder> = {
		billedAt: intent.billedAt,
		...(billSummary ? { billSummary } : {}),
	};
	const { orders, changed } = applyTableCloseIntent(
		store.orders,
		history,
		intent,
	);

	const archived = store.orders.filter((order) =>
		orderIds.includes(order.id),
	);

	const { runWithoutSyncNotify, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);

	await runWithoutSyncNotify(async () => {
		await persistCloseLocally(orders, changed ? archived : [], billPatch);
	});

	await bumpOrderOpsDomain('orders');

	if (!isSyncNotifySuppressed() && publishTableCloseIntent) {
		await publishTableCloseIntent(intent);
	}

	dispatchOrderOpsUpdated('orders');
	return orders;
}

/** Apply a remote orders:close from another device or hub. */
export async function handleTableCloseIntent(
	intent: TableCloseIntent,
): Promise<boolean> {
	if (typeof window === 'undefined') {
		return false;
	}

	const meta = await getOrderOpsMeta();
	if (intent.deviceId === meta.deviceId) {
		return false;
	}
	if (intent.businessDate !== meta.businessDate) {
		return false;
	}

	const store = await getOrdersStore();
	const history = await getTodayOrderHistory();
	const applied = applyTableCloseIntent(store.orders, history, intent);
	if (!applied.changed && !isTableCloseFullyApplied(history, intent)) {
		return false;
	}

	const billPatch: Partial<TOrder> = {
		billedAt: intent.billedAt,
		...(intent.billSummary ? { billSummary: intent.billSummary } : {}),
	};
	const archived = store.orders.filter((order) =>
		intent.orderIds.includes(order.id),
	);

	const { runWithoutSyncNotify } = await import('@/src/utils/order_ops_sync');

	await runWithoutSyncNotify(async () => {
		await persistCloseLocally(applied.orders, archived, billPatch);
	});

	if (intent.sentAt > (meta.versions.orders ?? 0)) {
		await setOrderOpsMetaVersions(
			{ ...meta.versions, orders: intent.sentAt },
			meta.businessDate,
		);
	}

	dispatchOrderOpsUpdated('orders');
	return true;
}
