import type { SupplyInventoryKind } from '@/src/constants/supply_inventory';
import localforage from 'localforage';

export const SUPPLY_INVENTORY_KEY = 'supplyInventory';

const PERSISTENT_KINDS = new Set<SupplyInventoryKind>([
	'utensils',
	'tableware',
	'raw-materials',
	'dish',
]);

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

/** Coerce a stored supply value to a plain number (utensils/tableware). */
export function normalizeSupplyNumber(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.floor(value));
	}
	return 0;
}

function isPersistentKind(kind: SupplyInventoryKind): boolean {
	return PERSISTENT_KINDS.has(kind);
}

function storeKey(dateKey: string, kind: SupplyInventoryKind): string {
	if (isPersistentKind(kind)) {
		return `persistent:${kind}`;
	}
	return `${dateKey}:${kind}`;
}

function isEmptyDayStore(items: SupplyInventoryDayStore | undefined): boolean {
	return !items || Object.keys(items).length === 0;
}

function latestDatedStore(
	store: SupplyInventoryStore,
	kind: SupplyInventoryKind
): SupplyInventoryDayStore | undefined {
	const keys = Object.keys(store)
		.filter(
			(key) =>
				key.endsWith(`:${kind}`) && !key.startsWith('persistent:')
		)
		.sort();
	for (let index = keys.length - 1; index >= 0; index -= 1) {
		const value = store[keys[index]];
		if (!isEmptyDayStore(value)) {
			return value;
		}
	}
	return undefined;
}

function resolveKindStore(
	store: SupplyInventoryStore,
	dateKey: string,
	kind: SupplyInventoryKind
): { items: SupplyInventoryDayStore; migrated: boolean } {
	const key = storeKey(dateKey, kind);
	if (Object.prototype.hasOwnProperty.call(store, key)) {
		return { items: store[key] ?? {}, migrated: false };
	}
	if (!isPersistentKind(kind)) {
		return { items: {}, migrated: false };
	}
	const dated = latestDatedStore(store, kind);
	if (!dated) {
		return { items: {}, migrated: false };
	}
	store[key] = { ...dated };
	return { items: store[key], migrated: true };
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
	const { items, migrated } = resolveKindStore(store, dateKey, kind);
	if (migrated) {
		await localforage.setItem(SUPPLY_INVENTORY_KEY, store);
	}
	return items;
}

export async function hasSupplyInventoryForDate(
	dateKey: string,
	kind: SupplyInventoryKind
): Promise<boolean> {
	const items = await getSupplyInventoryForDate(dateKey, kind);
	return !isEmptyDayStore(items);
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

	const applyKind = (
		kind: SupplyInventoryKind,
		incoming: SupplyInventoryDayStore | undefined
	) => {
		if (incoming == null) {
			return;
		}
		const key = storeKey(dateKey, kind);
		if (isPersistentKind(kind) && isEmptyDayStore(incoming)) {
			const existing = store[key] ?? latestDatedStore(store, kind);
			if (!isEmptyDayStore(existing)) {
				return;
			}
		}
		store[key] = { ...incoming };
	};

	applyKind('utensils', snapshot.utensils);
	applyKind('tableware', snapshot.tableware);
	applyKind('raw-materials', snapshot['raw-materials']);
	applyKind('dish', snapshot.dish);

	await localforage.setItem(SUPPLY_INVENTORY_KEY, store);
}
