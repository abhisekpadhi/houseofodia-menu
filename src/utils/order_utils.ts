import {
	BillingContext,
	DishUnit,
	ItemGroup,
	OrderGroup,
	OrderKind,
	TABLE_COUNT,
	TCart,
	TDish,
	TOrder,
	TOrderItem,
	TOrdersStore,
} from '@/src/models/common';
import {
	KITCHEN_ITEM_GROUPS,
	mapCategoryToKitchenGroup,
} from '@/src/utils/menu_utils';
import { notifyOrderOpsChange, isSyncNotifySuppressed } from '@/src/utils/order_ops_sync';
import { upsertOrdersInHistory } from '@/src/utils/order_history';
import localforage from 'localforage';

const ORDERS_KEY = 'orders';

export function generateOrderId(): string {
	return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function getOrdersStore(): Promise<TOrdersStore> {
	if (typeof window === 'undefined') {
		return { orders: [] };
	}

	try {
		const store = await localforage.getItem<TOrdersStore>(ORDERS_KEY);
		return store ?? { orders: [] };
	} catch (error) {
		console.error('Failed to read orders from storage:', error);
		return { orders: [] };
	}
}

export async function saveOrdersStore(store: TOrdersStore): Promise<void> {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		await localforage.setItem(ORDERS_KEY, store);
		await upsertOrdersInHistory(store.orders);
		if (!isSyncNotifySuppressed()) {
			await notifyOrderOpsChange();
		}
	} catch (error) {
		console.error('Failed to save orders to storage:', error);
		throw error;
	}
}

export async function addOrder(order: TOrder): Promise<void> {
	const store = await getOrdersStore();
	store.orders.push(order);
	await saveOrdersStore(store);
}

export function normalizeOrderItemsAfterEdit(
	order: TOrder,
	items: TOrderItem[]
): TOrder {
	const normalizedItems = items
		.filter((item) => item.qty > 0)
		.map((item) => ({
			...item,
			fulfilledQty: Math.min(item.fulfilledQty ?? 0, item.qty),
		}));

	let updated: TOrder = { ...order, items: normalizedItems };

	if (normalizedItems.length === 0) {
		return updated;
	}

	if (isOrderReady({ ...updated, items: normalizedItems })) {
		updated = { ...updated, readyAt: order.readyAt ?? Date.now() };
	} else if (updated.readyAt !== undefined) {
		const { readyAt: _readyAt, ...rest } = updated;
		updated = rest as TOrder;
	}

	return updated;
}

export async function updateOrderItems(
	orderId: string,
	items: TOrderItem[]
): Promise<TOrder[]> {
	const store = await getOrdersStore();
	const index = store.orders.findIndex((order) => order.id === orderId);
	if (index === -1) {
		throw new Error('Order not found');
	}

	const updated = normalizeOrderItemsAfterEdit(store.orders[index], items);

	if (updated.items.length === 0) {
		store.orders.splice(index, 1);
	} else {
		store.orders[index] = updated;
	}

	return updateOrders(store.orders);
}

export function formatOrderTime(createdAt: number): string {
	return new Date(createdAt).toLocaleTimeString('en-IN', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	});
}

export function orderTotal(items: TOrder['items']): number {
	return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function orderGroupToCart(group: OrderGroup): TCart {
	const itemMap = new Map<string, TDish>();

	for (const order of group.orders) {
		for (const item of order.items) {
			const existing = itemMap.get(item.name);
			if (existing) {
				existing.qty += item.qty;
			} else {
				itemMap.set(item.name, {
					name: item.name,
					price: item.price,
					qty: item.qty,
				});
			}
		}
	}

	return { items: Array.from(itemMap.values()) };
}

export function orderBelongsToBillingGroup(
	order: TOrder,
	context: BillingContext
): boolean {
	if (order.kind !== context.kind) {
		return false;
	}

	if (context.kind === 'takeaway' || context.kind === 'delivery') {
		return true;
	}

	const orderTables = [...(order.tableNumbers ?? [])].sort((a, b) => a - b);
	const groupTables = [...context.tableNumbers].sort((a, b) => a - b);

	if (orderTables.length !== groupTables.length) {
		return false;
	}

	return orderTables.every((table, index) => table === groupTables[index]);
}

export function removeOrdersForBillingGroup(
	orders: TOrder[],
	context: BillingContext
): TOrder[] {
	return orders.filter((order) => !orderBelongsToBillingGroup(order, context));
}

export async function closeTableFromBilling(
	context: BillingContext
): Promise<TOrder[]> {
	const store = await getOrdersStore();
	const removing = store.orders.filter((order) =>
		orderBelongsToBillingGroup(order, context)
	);
	await upsertOrdersInHistory(removing, { billedAt: Date.now() });
	const remaining = removeOrdersForBillingGroup(store.orders, context);
	return updateOrders(remaining);
}

export function formatTableGroupLabel(tableNumbers: number[]): string {
	if (tableNumbers.length === 1) {
		return `Table ${tableNumbers[0]}`;
	}
	return `Table ${tableNumbers.join(' & ')}`;
}

export function groupOrdersByTable(orders: TOrder[]): OrderGroup[] {
	const groupMap = new Map<string, OrderGroup>();

	const ensureGroup = (
		key: string,
		label: string,
		kind: OrderKind,
		tableNumbers?: number[]
	) => {
		if (!groupMap.has(key)) {
			groupMap.set(key, {
				key,
				label,
				kind,
				tableNumbers,
				orders: [],
				oldestOrderAt: Number.MAX_SAFE_INTEGER,
			});
		}
		return groupMap.get(key)!;
	};

	for (const order of orders) {
		if (order.kind === 'takeaway') {
			const group = ensureGroup('takeaway', 'Takeaway', 'takeaway');
			group.orders.push(order);
			group.oldestOrderAt = Math.min(group.oldestOrderAt, order.createdAt);
			continue;
		}

		if (order.kind === 'delivery') {
			const group = ensureGroup('delivery', 'Delivery', 'delivery');
			group.orders.push(order);
			group.oldestOrderAt = Math.min(group.oldestOrderAt, order.createdAt);
			continue;
		}

		const tableNumbers = (order.tableNumbers ?? [])
			.filter((n) => n >= 1 && n <= TABLE_COUNT)
			.sort((a, b) => a - b);

		if (tableNumbers.length === 0) {
			continue;
		}

		const key = `table-${tableNumbers.join('-')}`;
		const group = ensureGroup(
			key,
			formatTableGroupLabel(tableNumbers),
			'table',
			tableNumbers
		);
		group.orders.push(order);
		group.oldestOrderAt = Math.min(group.oldestOrderAt, order.createdAt);
	}

	const groups = Array.from(groupMap.values());

	for (const group of groups) {
		group.orders.sort((a, b) => a.createdAt - b.createdAt);
	}

	groups.sort((a, b) => {
		const aDone = isGroupFullyMarkedDone(a);
		const bDone = isGroupFullyMarkedDone(b);
		if (aDone !== bDone) {
			return aDone ? 1 : -1;
		}
		return a.oldestOrderAt - b.oldestOrderAt;
	});

	return groups;
}

export function getOccupiedTableNumbers(orders: TOrder[]): Set<number> {
	const occupied = new Set<number>();

	for (const order of orders) {
		if (order.kind !== 'table') {
			continue;
		}

		for (const tableNumber of order.tableNumbers ?? []) {
			if (tableNumber >= 1 && tableNumber <= TABLE_COUNT) {
				occupied.add(tableNumber);
			}
		}
	}

	return occupied;
}

export function parseTableParam(value: string | null): number[] {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((part) => parseInt(part.trim(), 10))
		.filter((n) => !Number.isNaN(n) && n >= 1 && n <= TABLE_COUNT)
		.sort((a, b) => a - b);
}

export function normalizeOrders(orders: TOrder[]): TOrder[] {
	return orders.map((order) => ({
		...order,
		items: order.items.map((item) => ({
			...item,
			fulfilledQty: item.fulfilledQty ?? 0,
		})),
	}));
}

export function getItemRemainingQty(item: TOrderItem): number {
	return item.qty - (item.fulfilledQty ?? 0);
}

export const LATE_ORDER_THRESHOLD_MS = 20 * 60 * 1000;
export const ORDER_EDIT_WINDOW_MS = 5 * 60 * 1000;

export function isOrderReady(order: TOrder): boolean {
	return order.items.every((item) => getItemRemainingQty(item) === 0);
}

export function maintainOrders(orders: TOrder[], now = Date.now()): TOrder[] {
	const normalized = normalizeOrders(orders);

	return normalized.map((order) => {
		if (isOrderReady(order)) {
			return { ...order, readyAt: order.readyAt ?? now };
		}
		if (order.readyAt !== undefined) {
			const { readyAt: _readyAt, ...rest } = order;
			return rest as TOrder;
		}
		return order;
	});
}

export function isOrderMarkedDone(order: TOrder): boolean {
	return order.markedDoneAt != null;
}

export function isOrderEditable(order: TOrder, now = Date.now()): boolean {
	return now - order.createdAt < ORDER_EDIT_WINDOW_MS;
}

export function isGroupFullyMarkedDone(group: OrderGroup): boolean {
	return (
		group.orders.length > 0 &&
		group.orders.every((order) => isOrderMarkedDone(order))
	);
}

export function ordersStoreChanged(before: TOrder[], after: TOrder[]): boolean {
	if (before.length !== after.length) {
		return true;
	}
	return before.some((order, index) => {
		const next = after[index];
		if (!next || order.id !== next.id) {
			return true;
		}
		if (
			order.readyAt !== next.readyAt ||
			order.markedDoneAt !== next.markedDoneAt ||
			order.welcomeDrinkServed !== next.welcomeDrinkServed ||
			order.complementaryServed !== next.complementaryServed ||
			order.items.length !== next.items.length
		) {
			return true;
		}
		return order.items.some((item, itemIndex) => {
			const nextItem = next.items[itemIndex];
			return (
				!nextItem ||
				item.qty !== nextItem.qty ||
				item.fulfilledQty !== nextItem.fulfilledQty
			);
		});
	});
}

export function isOrderLate(order: TOrder, now = Date.now()): boolean {
	if (order.kind !== 'table') {
		return false;
	}
	if (isOrderReady(order)) {
		return false;
	}
	return now - order.createdAt > LATE_ORDER_THRESHOLD_MS;
}

export function isGroupLate(group: OrderGroup, now = Date.now()): boolean {
	if (group.kind !== 'table') {
		return false;
	}
	return group.orders.some((order) => isOrderLate(order, now));
}

export function getGroupOldestPendingOrder(group: OrderGroup): TOrder | null {
	if (group.kind !== 'table') {
		return null;
	}

	const pending = group.orders.filter(
		(order) => order.kind === 'table' && !isOrderReady(order)
	);
	if (pending.length === 0) {
		return null;
	}

	return pending.reduce((oldest, order) =>
		order.createdAt < oldest.createdAt ? order : oldest
	);
}

export function getGroupLateByMs(group: OrderGroup, now = Date.now()): number {
	const oldestPending = getGroupOldestPendingOrder(group);
	if (!oldestPending) {
		return 0;
	}

	const lateSince = oldestPending.createdAt + LATE_ORDER_THRESHOLD_MS;
	if (now <= lateSince) {
		return 0;
	}

	return now - lateSince;
}

export function formatLateDuration(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
	if (totalMinutes < 60) {
		return `${totalMinutes}m`;
	}

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatOrderLabel(order: TOrder): string {
	if (order.kind === 'takeaway') {
		return 'Takeaway';
	}
	if (order.kind === 'delivery') {
		return 'Delivery';
	}
	const tables = (order.tableNumbers ?? [])
		.filter((n) => n >= 1 && n <= TABLE_COUNT)
		.sort((a, b) => a - b);
	if (tables.length === 0) {
		return 'Table order';
	}
	return formatTableGroupLabel(tables);
}

export function getReadyOrders(orders: TOrder[]): TOrder[] {
	return normalizeOrders(orders)
		.filter((order) => isOrderReady(order) && !isOrderMarkedDone(order))
		.sort((a, b) => a.createdAt - b.createdAt);
}

function updateOrderById(
	orders: TOrder[],
	orderId: string,
	updater: (order: TOrder) => TOrder
): TOrder[] {
	return orders.map((order) => (order.id === orderId ? updater(order) : order));
}

export function markOrderDone(orders: TOrder[], orderId: string): TOrder[] {
	return updateOrderById(orders, orderId, (order) => {
		if (order.markedDoneAt != null || !isOrderReady(order)) {
			return order;
		}
		return { ...order, markedDoneAt: Date.now() };
	});
}

function orderIdsInGroup(group: OrderGroup): Set<string> {
	return new Set(group.orders.map((order) => order.id));
}

export function isTableWelcomeDrinkServed(group: OrderGroup): boolean {
	return group.orders.some((order) => order.welcomeDrinkServed);
}

export function isTableComplementaryServed(group: OrderGroup): boolean {
	return group.orders.some((order) => order.complementaryServed);
}

export function getTableServiceFlagsForTables(
	orders: TOrder[],
	tableNumbers: number[]
): Pick<TOrder, 'welcomeDrinkServed' | 'complementaryServed'> {
	const context: BillingContext = {
		source: 'orders',
		groupKey: '',
		kind: 'table',
		tableNumbers,
		label: '',
	};

	const tableOrders = orders.filter((order) =>
		orderBelongsToBillingGroup(order, context)
	);

	return {
		...(tableOrders.some((order) => order.welcomeDrinkServed)
			? { welcomeDrinkServed: true }
			: {}),
		...(tableOrders.some((order) => order.complementaryServed)
			? { complementaryServed: true }
			: {}),
	};
}

export function markTableWelcomeDrinkServed(
	orders: TOrder[],
	group: OrderGroup
): TOrder[] {
	if (isTableWelcomeDrinkServed(group)) {
		return orders;
	}

	const orderIds = orderIdsInGroup(group);
	return orders.map((order) =>
		orderIds.has(order.id) ? { ...order, welcomeDrinkServed: true } : order
	);
}

export function markTableComplementaryServed(
	orders: TOrder[],
	group: OrderGroup
): TOrder[] {
	if (isTableComplementaryServed(group)) {
		return orders;
	}

	const orderIds = orderIdsInGroup(group);
	return orders.map((order) =>
		orderIds.has(order.id) ? { ...order, complementaryServed: true } : order
	);
}

export function getDishUnits(orders: TOrder[], dishName: string): DishUnit[] {
	const units: DishUnit[] = [];
	const sorted = [...normalizeOrders(orders)].sort(
		(a, b) => a.createdAt - b.createdAt
	);

	for (const order of sorted) {
		order.items.forEach((item, itemIndex) => {
			if (item.name !== dishName) {
				return;
			}
			const fulfilledQty = item.fulfilledQty ?? 0;
			for (let unitIndex = 0; unitIndex < item.qty; unitIndex++) {
				units.push({
					orderId: order.id,
					itemIndex,
					unitIndex,
					dishName: item.name,
					orderLabel: formatOrderLabel(order),
					createdAt: order.createdAt,
					fulfilled: unitIndex < fulfilledQty,
				});
			}
		});
	}

	return units;
}

export function isUnitNextToFulfill(orders: TOrder[], unit: DishUnit): boolean {
	if (unit.fulfilled) {
		return false;
	}
	const globalUnits = getDishUnits(orders, unit.dishName);
	const next = globalUnits.find((candidate) => !candidate.fulfilled);
	return (
		next !== undefined &&
		next.orderId === unit.orderId &&
		next.itemIndex === unit.itemIndex &&
		next.unitIndex === unit.unitIndex
	);
}

export function isUnitLastFulfilled(orders: TOrder[], unit: DishUnit): boolean {
	if (!unit.fulfilled) {
		return false;
	}
	const globalUnits = getDishUnits(orders, unit.dishName);
	const lastFulfilled = [...globalUnits].reverse().find((candidate) => candidate.fulfilled);
	return (
		lastFulfilled !== undefined &&
		lastFulfilled.orderId === unit.orderId &&
		lastFulfilled.itemIndex === unit.itemIndex &&
		lastFulfilled.unitIndex === unit.unitIndex
	);
}

export function groupItemsByKitchenGroup(
	orders: TOrder[],
	nameToCategory: Record<string, string>
): ItemGroup[] {
	const groupUnits = new Map<string, DishUnit[]>();
	for (const group of KITCHEN_ITEM_GROUPS) {
		groupUnits.set(group, []);
	}

	const sortedOrders = [...normalizeOrders(orders)].sort(
		(a, b) => a.createdAt - b.createdAt
	);

	for (const order of sortedOrders) {
		order.items.forEach((item, itemIndex) => {
			const menuCategory = nameToCategory[item.name] ?? '';
			const kitchenGroup = mapCategoryToKitchenGroup(menuCategory);
			if (!kitchenGroup) {
				return;
			}

			const fulfilledQty = item.fulfilledQty ?? 0;
			for (let unitIndex = 0; unitIndex < item.qty; unitIndex++) {
				groupUnits.get(kitchenGroup)!.push({
					orderId: order.id,
					itemIndex,
					unitIndex,
					dishName: item.name,
					orderLabel: formatOrderLabel(order),
					createdAt: order.createdAt,
					fulfilled: unitIndex < fulfilledQty,
				});
			}
		});
	}

	return KITCHEN_ITEM_GROUPS.flatMap((name) => {
		const units = groupUnits.get(name)!;
		if (units.length === 0) {
			return [];
		}
		return [
			{
				name,
				totalQty: units.length,
				remainingQty: units.filter((unit) => !unit.fulfilled).length,
				units,
			},
		];
	});
}

/** @deprecated use groupItemsByKitchenGroup */
export function groupItemsByDish(orders: TOrder[]): ItemGroup[] {
	const dishNames = new Set<string>();
	for (const order of orders) {
		for (const item of order.items) {
			dishNames.add(item.name);
		}
	}

	const groups: ItemGroup[] = [];

	for (const name of Array.from(dishNames)) {
		const units = getDishUnits(orders, name);
		if (units.length === 0) {
			continue;
		}
		groups.push({
			name,
			totalQty: units.length,
			remainingQty: units.filter((unit) => !unit.fulfilled).length,
			units,
		});
	}

	groups.sort((a, b) => a.name.localeCompare(b.name));

	return groups;
}

function cloneOrders(orders: TOrder[]): TOrder[] {
	return orders.map((order) => ({
		...order,
		items: order.items.map((item) => ({ ...item })),
	}));
}

export function fulfillNextUnitForDish(
	orders: TOrder[],
	dishName: string
): TOrder[] {
	const updated = cloneOrders(normalizeOrders(orders));
	const sorted = [...updated].sort((a, b) => a.createdAt - b.createdAt);

	for (const order of sorted) {
		const orderIndex = updated.findIndex((candidate) => candidate.id === order.id);
		if (orderIndex === -1) {
			continue;
		}

		for (let itemIndex = 0; itemIndex < updated[orderIndex].items.length; itemIndex++) {
			const item = updated[orderIndex].items[itemIndex];
			if (item.name !== dishName) {
				continue;
			}
			const fulfilledQty = item.fulfilledQty ?? 0;
			if (fulfilledQty < item.qty) {
				updated[orderIndex].items[itemIndex] = {
					...item,
					fulfilledQty: fulfilledQty + 1,
				};
				return updated;
			}
		}
	}

	return updated;
}

export function unfulfillLastUnitForDish(
	orders: TOrder[],
	dishName: string
): TOrder[] {
	const updated = cloneOrders(normalizeOrders(orders));
	const sorted = [...updated].sort((a, b) => b.createdAt - a.createdAt);

	for (const order of sorted) {
		const orderIndex = updated.findIndex((candidate) => candidate.id === order.id);
		if (orderIndex === -1) {
			continue;
		}

		for (let itemIndex = updated[orderIndex].items.length - 1; itemIndex >= 0; itemIndex--) {
			const item = updated[orderIndex].items[itemIndex];
			if (item.name !== dishName) {
				continue;
			}
			const fulfilledQty = item.fulfilledQty ?? 0;
			if (fulfilledQty > 0) {
				updated[orderIndex].items[itemIndex] = {
					...item,
					fulfilledQty: fulfilledQty - 1,
				};
				return updated;
			}
		}
	}

	return updated;
}

export function getOrderItemUnits(order: TOrder, itemIndex: number): boolean[] {
	const item = order.items[itemIndex];
	if (!item) {
		return [];
	}
	const fulfilledQty = item.fulfilledQty ?? 0;
	return Array.from({ length: item.qty }, (_, unitIndex) => unitIndex < fulfilledQty);
}

export async function updateOrders(orders: TOrder[], now = Date.now()): Promise<TOrder[]> {
	const maintained = maintainOrders(orders, now);
	await saveOrdersStore({ orders: maintained });
	return maintained;
}
