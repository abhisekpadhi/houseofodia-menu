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

	groups.sort((a, b) => a.oldestOrderAt - b.oldestOrderAt);

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
export const READY_ORDER_PURGE_MS = 5 * 60 * 1000;

export function isOrderReady(order: TOrder): boolean {
	return order.items.every((item) => getItemRemainingQty(item) === 0);
}

export function maintainOrders(orders: TOrder[], now = Date.now()): TOrder[] {
	const normalized = normalizeOrders(orders);

	const withTimestamps = normalized.map((order) => {
		if (isOrderReady(order)) {
			return { ...order, readyAt: order.readyAt ?? now };
		}
		if (order.readyAt !== undefined) {
			const { readyAt: _readyAt, ...rest } = order;
			return rest as TOrder;
		}
		return order;
	});

	return withTimestamps.filter((order) => {
		if (!isOrderReady(order)) {
			return true;
		}
		return now - (order.readyAt ?? now) < READY_ORDER_PURGE_MS;
	});
}

export function ordersStoreChanged(before: TOrder[], after: TOrder[]): boolean {
	if (before.length !== after.length) {
		return true;
	}
	return before.some((order, index) => {
		const next = after[index];
		return (
			order.id !== next?.id ||
			order.readyAt !== next?.readyAt ||
			order.items.length !== next?.items.length
		);
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
		.filter(isOrderReady)
		.sort((a, b) => a.createdAt - b.createdAt);
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
