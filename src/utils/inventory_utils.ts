import { INVENTORY_KEY, TDish, TInventoryStore } from '@/src/models/common';
import localforage from 'localforage';

export function getTodayDateKey(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export async function getInventoryStore(): Promise<TInventoryStore> {
	const store = await localforage.getItem<TInventoryStore>(INVENTORY_KEY);
	return store ?? {};
}

function findLatestInventoryDateBefore(
	store: TInventoryStore,
	dateKey: string
): string | null {
	const dates = Object.keys(store)
		.filter((d) => d < dateKey)
		.sort();

	for (let i = dates.length - 1; i >= 0; i--) {
		const key = dates[i];
		if (Object.keys(store[key]).length > 0) {
			return key;
		}
	}

	return null;
}

function getCarriedOverInventory(
	store: TInventoryStore,
	dateKey: string
): Record<string, number> {
	const previousKey = findLatestInventoryDateBefore(store, dateKey);
	if (!previousKey) {
		return {};
	}

	return { ...store[previousKey] };
}

export async function getInventoryForDate(
	dateKey: string
): Promise<Record<string, number>> {
	const store = await getInventoryStore();

	if (store[dateKey] !== undefined) {
		return store[dateKey];
	}

	return getCarriedOverInventory(store, dateKey);
}

export async function saveInventoryForDate(
	dateKey: string,
	items: Record<string, number>
): Promise<void> {
	const store = await getInventoryStore();
	store[dateKey] = items;
	await localforage.setItem(INVENTORY_KEY, store);
}

/** Missing entries default to 0 for the day. */
export function getInventoryQty(
	inventory: Record<string, number>,
	dishName: string
): number {
	return inventory[dishName] ?? 0;
}

export function getAvailableQty(
	inventory: Record<string, number>,
	dishName: string,
	cartQty: number
): number {
	return Math.max(0, getInventoryQty(inventory, dishName) - cartQty);
}

export function isOutOfStock(
	inventory: Record<string, number>,
	dishName: string,
	cartQty = 0
): boolean {
	return getAvailableQty(inventory, dishName, cartQty) <= 0;
}

export async function decrementInventoryForOrder(
	dateKey: string,
	items: TDish[]
): Promise<void> {
	await adjustInventoryDelta(dateKey, items, 'decrement');
}

function itemsToQtyMap(items: TDish[]): Record<string, number> {
	const map: Record<string, number> = {};
	for (const item of items) {
		map[item.name] = (map[item.name] ?? 0) + item.qty;
	}
	return map;
}

async function adjustInventoryDelta(
	dateKey: string,
	items: TDish[],
	mode: 'decrement' | 'replenish'
): Promise<void> {
	const store = await getInventoryStore();
	const base =
		store[dateKey] !== undefined
			? store[dateKey]
			: getCarriedOverInventory(store, dateKey);
	const dayInventory = { ...base };

	for (const item of items) {
		const current = dayInventory[item.name] ?? 0;
		if (mode === 'decrement') {
			dayInventory[item.name] = Math.max(0, current - item.qty);
		} else {
			dayInventory[item.name] = current + item.qty;
		}
	}

	store[dateKey] = dayInventory;
	await localforage.setItem(INVENTORY_KEY, store);
}

/** Replenish stock when order qty is reduced or items removed. */
export async function replenishInventoryForOrder(
	dateKey: string,
	items: TDish[]
): Promise<void> {
	if (items.length === 0) {
		return;
	}
	await adjustInventoryDelta(dateKey, items, 'replenish');
}

/** Apply inventory changes when an order's items are edited. */
export async function adjustInventoryForOrderEdit(
	dateKey: string,
	beforeItems: TDish[],
	afterItems: TDish[]
): Promise<void> {
	const beforeMap = itemsToQtyMap(beforeItems);
	const afterMap = itemsToQtyMap(afterItems);
	const dishNames = new Set([
		...Object.keys(beforeMap),
		...Object.keys(afterMap),
	]);

	const toDecrement: TDish[] = [];
	const toReplenish: TDish[] = [];

	for (const name of dishNames) {
		const delta = (afterMap[name] ?? 0) - (beforeMap[name] ?? 0);
		if (delta > 0) {
			toDecrement.push({ name, qty: delta, price: 0 });
		} else if (delta < 0) {
			toReplenish.push({ name, qty: Math.abs(delta), price: 0 });
		}
	}

	if (toDecrement.length > 0) {
		await adjustInventoryDelta(dateKey, toDecrement, 'decrement');
	}
	if (toReplenish.length > 0) {
		await adjustInventoryDelta(dateKey, toReplenish, 'replenish');
	}
}

export function getMaxEditableQty(
	inventory: Record<string, number>,
	dishName: string,
	originalQty: number
): number {
	return originalQty + getInventoryQty(inventory, dishName);
}

export function canIncreaseOrderItemQty(
	inventory: Record<string, number>,
	dishName: string,
	originalQty: number,
	nextQty: number
): boolean {
	return nextQty <= getMaxEditableQty(inventory, dishName, originalQty);
}
