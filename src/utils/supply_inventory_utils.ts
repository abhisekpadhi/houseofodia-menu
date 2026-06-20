import type { SupplyInventoryKind } from '@/src/constants/supply_inventory';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export const SUPPLY_INVENTORY_KEY = 'supplyInventory';

export type SupplyInventoryDayStore = Record<string, number>;

export type SupplyInventoryStore = Record<string, SupplyInventoryDayStore>;

function storeKey(dateKey: string, kind: SupplyInventoryKind): string {
	return `${dateKey}:${kind}`;
}

export async function getSupplyInventoryStore(): Promise<SupplyInventoryStore> {
	const store =
		await localforage.getItem<SupplyInventoryStore>(SUPPLY_INVENTORY_KEY);
	return store ?? {};
}

export async function getSupplyInventoryForDate(
	dateKey: string,
	kind: SupplyInventoryKind
): Promise<SupplyInventoryDayStore> {
	const store = await getSupplyInventoryStore();
	return store[storeKey(dateKey, kind)] ?? {};
}

export async function saveSupplyInventoryForDate(
	dateKey: string,
	kind: SupplyInventoryKind,
	items: SupplyInventoryDayStore
): Promise<void> {
	const store = await getSupplyInventoryStore();
	store[storeKey(dateKey, kind)] = items;
	await localforage.setItem(SUPPLY_INVENTORY_KEY, store);
	const { notifyOrderOpsChange, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);
	if (!isSyncNotifySuppressed()) {
		await notifyOrderOpsChange();
	}
}

export async function getSupplyInventorySnapshotForDate(dateKey: string): Promise<{
	utensils: SupplyInventoryDayStore;
	tableware: SupplyInventoryDayStore;
	'raw-materials': SupplyInventoryDayStore;
}> {
	const [utensils, tableware, rawMaterials] = await Promise.all([
		getSupplyInventoryForDate(dateKey, 'utensils'),
		getSupplyInventoryForDate(dateKey, 'tableware'),
		getSupplyInventoryForDate(dateKey, 'raw-materials'),
	]);
	return {
		utensils,
		tableware,
		'raw-materials': rawMaterials,
	};
}

export async function applySupplyInventorySnapshot(
	dateKey: string,
	snapshot: {
		utensils: SupplyInventoryDayStore;
		tableware: SupplyInventoryDayStore;
		'raw-materials': SupplyInventoryDayStore;
	}
): Promise<void> {
	const store = await getSupplyInventoryStore();
	store[storeKey(dateKey, 'utensils')] = { ...snapshot.utensils };
	store[storeKey(dateKey, 'tableware')] = { ...snapshot.tableware };
	store[storeKey(dateKey, 'raw-materials')] = { ...snapshot['raw-materials'] };
	await localforage.setItem(SUPPLY_INVENTORY_KEY, store);
}

export { getTodayDateKey };
