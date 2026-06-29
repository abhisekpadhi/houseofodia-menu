import {
	BillingContext,
	DishUnit,
	ItemCancelReason,
	ItemGroup,
	OrderGroup,
	OrderItemUnitState,
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
import {
	isInfiniteInventoryDish,
	PACKAGING_CHARGE_DISH_NAME,
} from '@/src/utils/inventory_utils';
import { getCachedMenuItems, fetchAndCacheMenuItems } from '@/src/utils/menu_cache';
import { notifyOrderOpsChange, isSyncNotifySuppressed } from '@/src/utils/order_ops_sync';
import { upsertOrdersInHistory } from '@/src/utils/order_history';
import localforage from 'localforage';

const ORDERS_KEY = 'orders';

export function isUnitStateFulfilled(state: OrderItemUnitState): boolean {
	return state === 'fulfilled';
}

export function isUnitStateCancelled(state: OrderItemUnitState): boolean {
	return typeof state === 'object' && state.status === 'cancelled';
}

export function isUnitStatePending(state: OrderItemUnitState): boolean {
	return state === 'pending';
}

export function getUnitCancelReason(
	state: OrderItemUnitState
): ItemCancelReason | undefined {
	if (typeof state === 'object' && state.status === 'cancelled') {
		return state.reason;
	}
	return undefined;
}

function buildUnitStatesFromLegacy(item: TOrderItem): OrderItemUnitState[] {
	const fulfilledQty = item.fulfilledQty ?? 0;
	return Array.from({ length: item.qty }, (_, unitIndex) =>
		unitIndex < fulfilledQty ? 'fulfilled' : 'pending'
	);
}

function normalizeParcelUnits(item: TOrderItem, qty: number): boolean[] {
	const existing = item.parcelUnits ?? [];
	if (existing.length < qty) {
		return [
			...existing,
			...Array.from({ length: qty - existing.length }, () => false),
		];
	}
	return existing.slice(0, qty);
}

export function normalizeOrderItem(item: TOrderItem): TOrderItem {
	let states = item.unitStates;
	if (!states || states.length === 0) {
		states = buildUnitStatesFromLegacy(item);
	}

	if (states.length < item.qty) {
		states = [
			...states,
			...Array.from(
				{ length: item.qty - states.length },
				() => 'pending' as const
			),
		];
	} else if (states.length > item.qty) {
		states = states.slice(0, item.qty);
	}

	const fulfilledQty = states.filter((state) => state === 'fulfilled').length;
	const parcelUnits = normalizeParcelUnits(item, item.qty);
	return { ...item, unitStates: states, fulfilledQty, parcelUnits };
}

export function getItemUnitStates(item: TOrderItem): OrderItemUnitState[] {
	return normalizeOrderItem(item).unitStates ?? [];
}

export function getItemPendingQty(item: TOrderItem): number {
	return getItemUnitStates(item).filter(isUnitStatePending).length;
}

export function getItemCancelledQty(item: TOrderItem): number {
	return getItemUnitStates(item).filter(isUnitStateCancelled).length;
}

export function getItemFulfilledQty(item: TOrderItem): number {
	return getItemUnitStates(item).filter(isUnitStateFulfilled).length;
}

export function getItemBillableQty(item: TOrderItem): number {
	return Math.max(0, item.qty - getItemCancelledQty(item));
}

export type OrderItemUnitDisplay = 'pending' | 'fulfilled' | 'cancelled';

export function getOrderItemUnitDisplay(
	item: TOrderItem,
	unitIndex: number
): OrderItemUnitDisplay {
	const state = getItemUnitStates(item)[unitIndex];
	if (state === 'fulfilled') {
		return 'fulfilled';
	}
	if (isUnitStateCancelled(state)) {
		return 'cancelled';
	}
	return 'pending';
}

export function isItemUnitParcel(item: TOrderItem, unitIndex: number): boolean {
	const normalized = normalizeOrderItem(item);
	return normalized.parcelUnits?.[unitIndex] === true;
}

function dishUnitFromItem(
	order: TOrder,
	item: TOrderItem,
	itemIndex: number,
	unitIndex: number
): DishUnit {
	const state = getItemUnitStates(item)[unitIndex] ?? 'pending';
	return {
		orderId: order.id,
		itemIndex,
		unitIndex,
		dishName: item.name,
		orderLabel: formatOrderLabel(order),
		createdAt: order.createdAt,
		fulfilled: state === 'fulfilled',
		cancelled: isUnitStateCancelled(state),
		cancelReason: getUnitCancelReason(state),
	};
}

function serializeItemForCompare(item: TOrderItem): string {
	const normalized = normalizeOrderItem(item);
	return `${normalized.qty}:${JSON.stringify(normalized.unitStates)}:${JSON.stringify(normalized.parcelUnits ?? [])}`;
}

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
			await notifyOrderOpsChange('orders');
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
	const existingByName = new Map(order.items.map((item) => [item.name, item]));

	const normalizedItems = items
		.filter((item) => item.qty > 0)
		.map((item) => {
			const existing = existingByName.get(item.name);
			let states: OrderItemUnitState[];
			let parcelUnits: boolean[] | undefined;
			if (existing) {
				const previous = getItemUnitStates(existing);
				const previousParcel = normalizeOrderItem(existing).parcelUnits ?? [];
				if (item.qty <= previous.length) {
					states = previous.slice(0, item.qty);
					parcelUnits = previousParcel.slice(0, item.qty);
				} else {
					states = [
						...previous,
						...Array.from(
							{ length: item.qty - previous.length },
							() => 'pending' as const
						),
					];
					parcelUnits = [
						...previousParcel,
						...Array.from(
							{ length: item.qty - previousParcel.length },
							() => false
						),
					];
				}
			} else {
				states = Array.from({ length: item.qty }, () => 'pending' as const);
			}
			return normalizeOrderItem({ ...item, unitStates: states, parcelUnits });
		});

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
	return items.reduce((sum, item) => {
		const normalized = normalizeOrderItem(item);
		return sum + item.price * getItemBillableQty(normalized);
	}, 0);
}

const PARCEL_LINE_SUFFIX = ' (parcel)';

function addCartLine(
	itemMap: Map<string, TDish>,
	name: string,
	price: number,
	qty: number
): void {
	if (qty <= 0) {
		return;
	}
	const existing = itemMap.get(name);
	if (existing) {
		existing.qty += qty;
		return;
	}
	itemMap.set(name, { name, price, qty });
}

export function orderGroupToCart(group: OrderGroup): TCart {
	const itemMap = new Map<string, TDish>();

	for (const order of group.orders) {
		for (const item of order.items) {
			const normalized = normalizeOrderItem(item);
			const states = getItemUnitStates(normalized);
			let regularQty = 0;
			let parcelQty = 0;

			for (let unitIndex = 0; unitIndex < normalized.qty; unitIndex++) {
				if (isUnitStateCancelled(states[unitIndex])) {
					continue;
				}
				if (order.kind === 'table' && isItemUnitParcel(normalized, unitIndex)) {
					parcelQty += 1;
				} else {
					regularQty += 1;
				}
			}

			addCartLine(itemMap, item.name, item.price, regularQty);
			addCartLine(
				itemMap,
				`${item.name}${PARCEL_LINE_SUFFIX}`,
				item.price,
				parcelQty
			);
		}
	}

	return { items: Array.from(itemMap.values()) };
}

export function groupHasBillableItems(group: OrderGroup): boolean {
	return orderGroupToCart(group).items.length > 0;
}

/** Billable units that need packaging: all units for takeaway; parcel units for table. */
export function getPackagingUnitCount(group: OrderGroup): number {
	if (group.kind !== 'table' && group.kind !== 'takeaway') {
		return 0;
	}

	let count = 0;

	for (const order of group.orders) {
		for (const item of order.items) {
			const normalized = normalizeOrderItem(item);
			if (isInfiniteInventoryDish(item.name)) {
				continue;
			}

			const states = getItemUnitStates(normalized);
			for (let unitIndex = 0; unitIndex < normalized.qty; unitIndex++) {
				if (isUnitStateCancelled(states[unitIndex])) {
					continue;
				}
				if (group.kind === 'takeaway') {
					count += 1;
				} else if (isItemUnitParcel(normalized, unitIndex)) {
					count += 1;
				}
			}
		}
	}

	return count;
}

export function addPackagingChargeToCart(
	cart: TCart,
	unitCount: number,
	packagingPrice: number
): TCart {
	if (unitCount <= 0) {
		return cart;
	}

	const items = cart.items.map((item) => ({ ...item }));
	const existing = items.find((item) => isInfiniteInventoryDish(item.name));

	if (existing) {
		existing.qty += unitCount;
	} else {
		items.push({
			name: PACKAGING_CHARGE_DISH_NAME,
			price: packagingPrice,
			qty: unitCount,
		});
	}

	return { items };
}

const DEFAULT_PACKAGING_CHARGE_PRICE = 20;

export async function getPackagingChargePrice(): Promise<number> {
	try {
		let menuItems = await getCachedMenuItems();
		if (!menuItems?.length) {
			menuItems = await fetchAndCacheMenuItems();
		}
		const match = menuItems?.find((item) => isInfiniteInventoryDish(item.name));
		const price = match ? parseFloat(match.price) : Number.NaN;
		return Number.isNaN(price) ? DEFAULT_PACKAGING_CHARGE_PRICE : price;
	} catch {
		return DEFAULT_PACKAGING_CHARGE_PRICE;
	}
}

export const WATER_DISH_NAME = 'Water';

const DEFAULT_WATER_BOTTLE_PRICE = 20;

export async function getWaterBottlePrice(): Promise<number> {
	try {
		let menuItems = await getCachedMenuItems();
		if (!menuItems?.length) {
			menuItems = await fetchAndCacheMenuItems();
		}
		const match = menuItems?.find((item) => item.name === WATER_DISH_NAME);
		const price = match ? parseFloat(match.price) : Number.NaN;
		return Number.isNaN(price) ? DEFAULT_WATER_BOTTLE_PRICE : price;
	} catch {
		return DEFAULT_WATER_BOTTLE_PRICE;
	}
}

export function getGroupWaterBottleCount(group: OrderGroup): number {
	let count = 0;

	for (const order of group.orders) {
		for (const item of order.items) {
			if (item.name !== WATER_DISH_NAME) {
				continue;
			}
			count += getItemBillableQty(normalizeOrderItem(item));
		}
	}

	return count;
}

export function syncGroupWaterBottleCount(
	orders: TOrder[],
	group: OrderGroup,
	targetQty: number,
	waterPrice: number
): TOrder[] {
	if (targetQty < 0) {
		return orders;
	}

	const currentQty = getGroupWaterBottleCount(group);
	if (targetQty === currentQty) {
		return orders;
	}

	const orderIds = new Set(group.orders.map((order) => order.id));
	let nextOrders = orders.map((order) => ({
		...order,
		items: order.items.map((item) => ({ ...item })),
	}));

	const groupOrders = nextOrders
		.filter((order) => orderIds.has(order.id))
		.sort((a, b) => b.createdAt - a.createdAt);

	if (targetQty > currentQty) {
		const addQty = targetQty - currentQty;
		const orderWithWater = groupOrders.find((order) =>
			order.items.some((item) => item.name === WATER_DISH_NAME)
		);

		if (orderWithWater) {
			return nextOrders.map((order) => {
				if (order.id !== orderWithWater.id) {
					return order;
				}
				const items = order.items.map((item) => ({ ...item }));
				const waterIndex = items.findIndex(
					(item) => item.name === WATER_DISH_NAME
				);
				if (waterIndex === -1) {
					return order;
				}
				items[waterIndex] = {
					...items[waterIndex],
					qty: items[waterIndex].qty + addQty,
				};
				return normalizeOrderItemsAfterEdit(order, items);
			});
		}

		const template = groupOrders[0];
		if (!template) {
			return orders;
		}

		const tableNumbers = template.tableNumbers ?? group.tableNumbers ?? [];
		const tableServiceFlags = getTableServiceFlagsForTables(
			nextOrders,
			tableNumbers
		);
		const pax = template.pax ?? getGroupPax(group) ?? undefined;
		const newOrder: TOrder = {
			id: generateOrderId(),
			createdAt: Date.now(),
			kind: 'table',
			tableNumbers,
			items: [
				normalizeOrderItem({
					name: WATER_DISH_NAME,
					price: waterPrice,
					qty: addQty,
				}),
			],
			...(pax != null ? { pax } : {}),
			...tableServiceFlags,
		};

		nextOrders.push(newOrder);
		return nextOrders;
	}

	let toRemove = currentQty - targetQty;

	for (const order of groupOrders) {
		if (toRemove <= 0) {
			break;
		}

		const orderIndex = nextOrders.findIndex((entry) => entry.id === order.id);
		if (orderIndex === -1) {
			continue;
		}

		const items = nextOrders[orderIndex].items.map((item) => ({ ...item }));
		let changed = false;

		for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex--) {
			if (toRemove <= 0) {
				break;
			}

			const item = items[itemIndex];
			if (item.name !== WATER_DISH_NAME) {
				continue;
			}

			const billable = getItemBillableQty(normalizeOrderItem(item));
			if (billable <= 0) {
				continue;
			}

			const removeFromItem = Math.min(toRemove, billable);
			items[itemIndex] = {
				...item,
				qty: item.qty - removeFromItem,
			};
			toRemove -= removeFromItem;
			changed = true;
		}

		if (!changed) {
			continue;
		}

		const updated = normalizeOrderItemsAfterEdit(nextOrders[orderIndex], items);
		if (updated.items.length === 0) {
			nextOrders.splice(orderIndex, 1);
		} else {
			nextOrders[orderIndex] = updated;
		}
	}

	return nextOrders;
}

export async function orderGroupToBillCart(group: OrderGroup): Promise<TCart> {
	const cart = orderGroupToCart(group);
	const packagingQty = getPackagingUnitCount(group);
	if (packagingQty <= 0) {
		return cart;
	}
	const packagingPrice = await getPackagingChargePrice();
	return addPackagingChargeToCart(cart, packagingQty, packagingPrice);
}

export function orderBelongsToBillingGroup(
	order: TOrder,
	context: BillingContext
): boolean {
	if (order.kind !== context.kind) {
		return false;
	}

	if (context.kind === 'takeaway' || context.kind === 'delivery') {
		return getOrderGroupKey(order) === context.groupKey;
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

export const CUSTOMER_PHONE_DIGITS = 10;

export function isValidCustomerPhone(phone: string): boolean {
	return new RegExp(`^\\d{${CUSTOMER_PHONE_DIGITS}}$`).test(phone.trim());
}

export function formatCustomerContact(order: TOrder): string | null {
	const name = order.customerName?.trim();
	const phone = order.customerPhone?.trim();
	if (!name && !phone) {
		return null;
	}
	if (name && phone) {
		return `${name} · ${phone}`;
	}
	return name ?? phone ?? null;
}

export function getOrderGroupKey(order: TOrder): string {
	if (order.kind === 'table') {
		const tableNumbers = (order.tableNumbers ?? [])
			.filter((n) => n >= 1 && n <= TABLE_COUNT)
			.sort((a, b) => a - b);
		if (tableNumbers.length === 0) {
			return `table-unknown-${order.id}`;
		}
		return `table-${tableNumbers.join('-')}`;
	}

	const phone = order.customerPhone?.trim();
	if (phone && isValidCustomerPhone(phone)) {
		return `${order.kind}-${phone}`;
	}

	return `${order.kind}-${order.id}`;
}

export function getCustomerContactFlagsForGroupKey(
	orders: TOrder[],
	groupKey: string,
	kind: OrderKind
): Pick<TOrder, 'customerName' | 'customerPhone' | 'groupNotes' | 'pax'> {
	if (kind !== 'takeaway' && kind !== 'delivery') {
		return {};
	}

	for (const order of orders) {
		if (order.kind !== kind || getOrderGroupKey(order) !== groupKey) {
			continue;
		}

		const name = order.customerName?.trim();
		const phone = order.customerPhone?.trim();
		const groupNotes = order.groupNotes?.trim();
		const pax = order.pax;
		if (name || phone || groupNotes || (pax != null && pax >= 1)) {
			return {
				...(name ? { customerName: name } : {}),
				...(phone ? { customerPhone: phone } : {}),
				...(groupNotes ? { groupNotes } : {}),
				...(pax != null && pax >= 1 ? { pax } : {}),
			};
		}
	}

	return {};
}

export function getGroupPax(group: OrderGroup): number | null {
	const sorted = [...group.orders].sort((a, b) => a.createdAt - b.createdAt);
	for (const order of sorted) {
		if (order.pax != null && order.pax >= 1) {
			return order.pax;
		}
	}
	return null;
}

export function getGroupNotes(group: OrderGroup): string | null {
	for (const order of group.orders) {
		const notes = order.groupNotes?.trim();
		if (notes) {
			return notes;
		}
	}
	return null;
}

export function formatGroupCustomerContact(group: OrderGroup): string | null {
	for (const order of group.orders) {
		const contact = formatCustomerContact(order);
		if (contact) {
			return contact;
		}
	}
	return null;
}

export function getGroupCustomerDetails(group: OrderGroup): {
	name?: string;
	phone?: string;
} {
	for (const order of group.orders) {
		const name = order.customerName?.trim();
		const phone = order.customerPhone?.trim();
		if (name || phone) {
			return {
				...(name ? { name } : {}),
				...(phone ? { phone } : {}),
			};
		}
	}
	return {};
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
		if (order.kind === 'takeaway' || order.kind === 'delivery') {
			const key = getOrderGroupKey(order);
			const label = order.kind === 'takeaway' ? 'Takeaway' : 'Delivery';
			const group = ensureGroup(key, label, order.kind);
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

export function normalizeTableNumbers(tableNumbers: number[]): number[] {
	return [...tableNumbers]
		.filter((tableNumber) => tableNumber >= 1 && tableNumber <= TABLE_COUNT)
		.sort((a, b) => a - b);
}

export function tableNumbersEqual(
	left: number[],
	right: number[]
): boolean {
	const normalizedLeft = normalizeTableNumbers(left);
	const normalizedRight = normalizeTableNumbers(right);
	return (
		normalizedLeft.length === normalizedRight.length &&
		normalizedLeft.every(
			(tableNumber, index) => tableNumber === normalizedRight[index]
		)
	);
}

export function isTableAvailableForGroupMove(
	tableNumber: number,
	group: OrderGroup,
	occupiedTables: Set<number>
): boolean {
	if ((group.tableNumbers ?? []).includes(tableNumber)) {
		return true;
	}
	return !occupiedTables.has(tableNumber);
}

export function canMoveTableGroupToTables(
	orders: TOrder[],
	group: OrderGroup,
	newTableNumbers: number[]
): boolean {
	const target = normalizeTableNumbers(newTableNumbers);
	if (target.length === 0) {
		return false;
	}
	if (tableNumbersEqual(target, group.tableNumbers ?? [])) {
		return false;
	}

	const orderIds = orderIdsInGroup(group);
	const targetSet = new Set(target);

	for (const order of orders) {
		if (order.kind !== 'table' || orderIds.has(order.id)) {
			continue;
		}

		for (const tableNumber of order.tableNumbers ?? []) {
			if (targetSet.has(tableNumber)) {
				return false;
			}
		}
	}

	return true;
}

export function moveTableGroupToTables(
	orders: TOrder[],
	group: OrderGroup,
	newTableNumbers: number[]
): TOrder[] {
	const target = normalizeTableNumbers(newTableNumbers);
	if (target.length === 0) {
		return orders;
	}

	const orderIds = orderIdsInGroup(group);

	return orders.map((order) => {
		if (!orderIds.has(order.id) || order.kind !== 'table') {
			return order;
		}
		return { ...order, tableNumbers: target };
	});
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
		items: order.items.map((item) => normalizeOrderItem(item)),
	}));
}

export function getItemRemainingQty(item: TOrderItem): number {
	return getItemPendingQty(item);
}

export const LATE_ORDER_THRESHOLD_MS = 20 * 60 * 1000;

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

export function isOrderEditable(order: TOrder): boolean {
	return !isOrderMarkedDone(order);
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
			order.kidMenuEnabled !== next.kidMenuEnabled ||
			order.kidMenuServed !== next.kidMenuServed ||
			order.customerName !== next.customerName ||
			order.customerPhone !== next.customerPhone ||
			order.pax !== next.pax ||
			order.groupNotes !== next.groupNotes ||
			order.items.length !== next.items.length
		) {
			return true;
		}
		return order.items.some((item, itemIndex) => {
			const nextItem = next.items[itemIndex];
			return (
				!nextItem || serializeItemForCompare(item) !== serializeItemForCompare(nextItem)
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

export function getOrderLateByMs(order: TOrder, now = Date.now()): number {
	if (!isOrderLate(order, now)) {
		return 0;
	}

	const lateSince = order.createdAt + LATE_ORDER_THRESHOLD_MS;
	return now - lateSince;
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

export function updateGroupNotes(
	orders: TOrder[],
	group: OrderGroup,
	notes: string
): TOrder[] {
	const trimmed = notes.trim();
	const orderIds = orderIdsInGroup(group);

	return orders.map((order) => {
		if (!orderIds.has(order.id)) {
			return order;
		}
		if (!trimmed) {
			const { groupNotes: _removed, ...rest } = order;
			return rest;
		}
		return { ...order, groupNotes: trimmed };
	});
}

export function isTableWelcomeDrinkServed(group: OrderGroup): boolean {
	return group.orders.some((order) => order.welcomeDrinkServed);
}

export function isTableComplementaryServed(group: OrderGroup): boolean {
	return group.orders.some((order) => order.complementaryServed);
}

export function isTableKidMenuServed(group: OrderGroup): boolean {
	return group.orders.some((order) => order.kidMenuServed);
}

export function isTableKidMenuEnabled(group: OrderGroup): boolean {
	return group.orders.some((order) => order.kidMenuEnabled);
}

export function getTableServiceFlagsForTables(
	orders: TOrder[],
	tableNumbers: number[]
): Pick<
	TOrder,
	| 'welcomeDrinkServed'
	| 'complementaryServed'
	| 'kidMenuEnabled'
	| 'kidMenuServed'
	| 'groupNotes'
	| 'pax'
> {
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
	const groupNotes = tableOrders
		.map((order) => order.groupNotes?.trim())
		.find((notes) => notes);
	const groupPax = tableOrders
		.map((order) => order.pax)
		.find((value) => value != null && value >= 1);

	return {
		...(tableOrders.some((order) => order.welcomeDrinkServed)
			? { welcomeDrinkServed: true }
			: {}),
		...(tableOrders.some((order) => order.complementaryServed)
			? { complementaryServed: true }
			: {}),
		...(tableOrders.some((order) => order.kidMenuEnabled)
			? { kidMenuEnabled: true }
			: {}),
		...(tableOrders.some((order) => order.kidMenuServed)
			? { kidMenuServed: true }
			: {}),
		...(groupNotes ? { groupNotes } : {}),
		...(groupPax != null ? { pax: groupPax } : {}),
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

export function markTableKidMenuServed(
	orders: TOrder[],
	group: OrderGroup
): TOrder[] {
	if (isTableKidMenuServed(group)) {
		return orders;
	}

	const orderIds = orderIdsInGroup(group);
	return orders.map((order) =>
		orderIds.has(order.id) ? { ...order, kidMenuServed: true } : order
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
			for (let unitIndex = 0; unitIndex < item.qty; unitIndex++) {
				units.push(dishUnitFromItem(order, item, itemIndex, unitIndex));
			}
		});
	}

	return units;
}

export function isUnitPending(unit: DishUnit): boolean {
	return !unit.fulfilled && !unit.cancelled;
}

export function isUnitNextToFulfill(orders: TOrder[], unit: DishUnit): boolean {
	if (!isUnitPending(unit)) {
		return false;
	}
	const globalUnits = getDishUnits(orders, unit.dishName);
	const next = globalUnits.find((candidate) => isUnitPending(candidate));
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
				groupUnits.get(kitchenGroup)!.push(
					dishUnitFromItem(order, item, itemIndex, unitIndex)
				);
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
				remainingQty: units.filter((unit) => isUnitPending(unit)).length,
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
			remainingQty: units.filter((unit) => isUnitPending(unit)).length,
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
			const states = [...getItemUnitStates(item)];
			const pendingIndex = states.findIndex((state) => state === 'pending');
			if (pendingIndex === -1) {
				continue;
			}
			states[pendingIndex] = 'fulfilled';
			updated[orderIndex].items[itemIndex] = normalizeOrderItem({
				...item,
				unitStates: states,
			});
			return updated;
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
			const states = [...getItemUnitStates(item)];
			for (let unitIndex = states.length - 1; unitIndex >= 0; unitIndex--) {
				if (states[unitIndex] !== 'fulfilled') {
					continue;
				}
				states[unitIndex] = 'pending';
				updated[orderIndex].items[itemIndex] = normalizeOrderItem({
					...item,
					unitStates: states,
				});
				return updated;
			}
		}
	}

	return updated;
}

export function getOrderItemUnits(
	order: TOrder,
	itemIndex: number
): OrderItemUnitDisplay[] {
	const item = order.items[itemIndex];
	if (!item) {
		return [];
	}
	return Array.from({ length: item.qty }, (_, unitIndex) =>
		getOrderItemUnitDisplay(item, unitIndex)
	);
}

export function cancelItemUnit(
	orders: TOrder[],
	orderId: string,
	itemIndex: number,
	unitIndex: number,
	reason: ItemCancelReason
): TOrder[] {
	return updateOrderById(orders, orderId, (order) => {
		if (isOrderMarkedDone(order)) {
			return order;
		}

		const items = order.items.map((item, idx) => {
			if (idx !== itemIndex) {
				return normalizeOrderItem(item);
			}

			const states = [...getItemUnitStates(item)];
			if (states[unitIndex] !== 'pending') {
				return normalizeOrderItem(item);
			}

			states[unitIndex] = {
				status: 'cancelled',
				reason,
				cancelledAt: Date.now(),
			};
			return normalizeOrderItem({ ...item, unitStates: states });
		});

		return { ...order, items };
	});
}

export function toggleItemUnitParcel(
	orders: TOrder[],
	orderId: string,
	itemIndex: number,
	unitIndex: number
): TOrder[] {
	return updateOrderById(orders, orderId, (order) => {
		const items = order.items.map((item, idx) => {
			if (idx !== itemIndex) {
				return normalizeOrderItem(item);
			}

			const states = getItemUnitStates(item);
			const state = states[unitIndex];
			if (state !== "pending" && state !== "fulfilled") {
				return normalizeOrderItem(item);
			}

			const parcelUnits = [...(normalizeOrderItem(item).parcelUnits ?? [])];
			parcelUnits[unitIndex] = !parcelUnits[unitIndex];
			return normalizeOrderItem({ ...item, parcelUnits });
		});

		return { ...order, items };
	});
}

export async function updateOrders(orders: TOrder[], now = Date.now()): Promise<TOrder[]> {
	const maintained = maintainOrders(orders, now);
	await saveOrdersStore({ orders: maintained });
	return maintained;
}
