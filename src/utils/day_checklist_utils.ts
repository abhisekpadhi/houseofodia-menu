import {
	getAllDayChecklistItemIds,
	type DayChecklistKind,
} from '@/src/constants/day_checklists';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export const DAY_CHECKLIST_KEY = 'dayChecklists';

export type DayChecklistState = Record<string, boolean>;

export type DayChecklistStore = Record<string, DayChecklistState>;

function storeKey(dateKey: string, kind: DayChecklistKind): string {
	return `${dateKey}:${kind}`;
}

export function normalizeDayChecklistState(
	state: DayChecklistState,
	itemIds: string[]
): DayChecklistState {
	const normalized: DayChecklistState = {};
	for (const id of itemIds) {
		if (state[id] === true) {
			normalized[id] = true;
		}
	}
	return normalized;
}

/** Drop checklist progress from previous days — each day starts fresh. */
export async function pruneDayChecklistsForToday(
	today = getTodayDateKey()
): Promise<void> {
	const store = await getDayChecklistStore();
	const openKey = storeKey(today, 'open');
	const closeKey = storeKey(today, 'close');
	const pruned: DayChecklistStore = {};

	if (store[openKey]) {
		pruned[openKey] = store[openKey];
	}
	if (store[closeKey]) {
		pruned[closeKey] = store[closeKey];
	}

	const hadOlderEntries = Object.keys(store).some(
		(key) => key !== openKey && key !== closeKey
	);
	if (!hadOlderEntries) {
		return;
	}

	await localforage.setItem(DAY_CHECKLIST_KEY, pruned);
}

export async function getDayChecklistStore(): Promise<DayChecklistStore> {
	const store = await localforage.getItem<DayChecklistStore>(DAY_CHECKLIST_KEY);
	return store ?? {};
}

export async function getDayChecklistForDate(
	dateKey: string,
	kind: DayChecklistKind
): Promise<DayChecklistState> {
	if (dateKey === getTodayDateKey()) {
		await pruneDayChecklistsForToday(dateKey);
	}

	const store = await getDayChecklistStore();
	const raw = store[storeKey(dateKey, kind)] ?? {};
	return normalizeDayChecklistState(raw, getAllDayChecklistItemIds(kind));
}

export async function saveDayChecklistForDate(
	dateKey: string,
	kind: DayChecklistKind,
	state: DayChecklistState
): Promise<void> {
	const normalized = normalizeDayChecklistState(
		state,
		getAllDayChecklistItemIds(kind)
	);
	const store = await getDayChecklistStore();
	store[storeKey(dateKey, kind)] = normalized;
	await localforage.setItem(DAY_CHECKLIST_KEY, store);
	const { notifyOrderOpsChange, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);
	if (!isSyncNotifySuppressed()) {
		await notifyOrderOpsChange('dayChecklists');
	}
}

export async function getDayChecklistSnapshotForDate(
	dateKey: string
): Promise<{ open: DayChecklistState; close: DayChecklistState }> {
	const [open, close] = await Promise.all([
		getDayChecklistForDate(dateKey, 'open'),
		getDayChecklistForDate(dateKey, 'close'),
	]);
	return { open, close };
}

export async function applyDayChecklistSnapshot(
	dateKey: string,
	snapshot: { open: DayChecklistState; close: DayChecklistState }
): Promise<void> {
	const store = await getDayChecklistStore();
	store[storeKey(dateKey, 'open')] = normalizeDayChecklistState(
		snapshot.open,
		getAllDayChecklistItemIds('open')
	);
	store[storeKey(dateKey, 'close')] = normalizeDayChecklistState(
		snapshot.close,
		getAllDayChecklistItemIds('close')
	);
	await localforage.setItem(DAY_CHECKLIST_KEY, store);
}

export function isDayChecklistComplete(
	itemIds: string[],
	state: DayChecklistState
): boolean {
	return itemIds.every((id) => state[id] === true);
}

export { getTodayDateKey };
