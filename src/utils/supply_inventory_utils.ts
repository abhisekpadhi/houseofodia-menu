import type { SupplyInventoryKind } from '@/src/constants/supply_inventory';
import localforage from 'localforage';

export const SUPPLY_INVENTORY_KEY = 'supplyInventory';

export type RawMaterialQty = {
	kg: number;
	gm: number;
	pcs: number;
};

export type RawMaterialUnit = keyof RawMaterialQty;

export const EMPTY_RAW_MATERIAL_QTY: RawMaterialQty = {
	kg: 0,
	gm: 0,
	pcs: 0,
};

/** Utensils/tableware use numbers; raw-materials use { kg, gm, pcs }. */
export type SupplyInventoryDayStore = Record<string, number | RawMaterialQty>;

export type SupplyInventoryStore = Record<string, SupplyInventoryDayStore>;

export function getTodayDateKey(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function normalizeRawMaterialQty(value: unknown): RawMaterialQty {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Partial<RawMaterialQty>;
		return {
			kg: Math.max(0, Math.floor(Number(record.kg) || 0)),
			gm: Math.max(0, Math.floor(Number(record.gm) || 0)),
			pcs: Math.max(0, Math.floor(Number(record.pcs) || 0)),
		};
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return { ...EMPTY_RAW_MATERIAL_QTY, kg: Math.max(0, Math.floor(value)) };
	}
	return { ...EMPTY_RAW_MATERIAL_QTY };
}

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

export async function hasSupplyInventoryForDate(
	dateKey: string,
	kind: SupplyInventoryKind
): Promise<boolean> {
	const store = await getSupplyInventoryStore();
	return Object.prototype.hasOwnProperty.call(store, storeKey(dateKey, kind));
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
		await notifyOrderOpsChange('supplyInventory');
	}
}

export async function getSupplyInventorySnapshotForDate(dateKey: string): Promise<{
	utensils: SupplyInventoryDayStore;
	tableware: SupplyInventoryDayStore;
	'raw-materials': SupplyInventoryDayStore;
	dish: SupplyInventoryDayStore;
}> {
	const [utensils, tableware, rawMaterials, dish] = await Promise.all([
		getSupplyInventoryForDate(dateKey, 'utensils'),
		getSupplyInventoryForDate(dateKey, 'tableware'),
		getSupplyInventoryForDate(dateKey, 'raw-materials'),
		getSupplyInventoryForDate(dateKey, 'dish'),
	]);
	return {
		utensils,
		tableware,
		'raw-materials': rawMaterials,
		dish,
	};
}

export async function applySupplyInventorySnapshot(
	dateKey: string,
	snapshot: {
		utensils: SupplyInventoryDayStore;
		tableware: SupplyInventoryDayStore;
		'raw-materials': SupplyInventoryDayStore;
		dish?: SupplyInventoryDayStore;
	}
): Promise<void> {
	const store = await getSupplyInventoryStore();
	store[storeKey(dateKey, 'utensils')] = { ...snapshot.utensils };
	store[storeKey(dateKey, 'tableware')] = { ...snapshot.tableware };
	store[storeKey(dateKey, 'raw-materials')] = { ...snapshot['raw-materials'] };
	if (snapshot.dish) {
		store[storeKey(dateKey, 'dish')] = { ...snapshot.dish };
	}
	await localforage.setItem(SUPPLY_INVENTORY_KEY, store);
}
