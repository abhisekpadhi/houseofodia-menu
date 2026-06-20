import type { DayChecklistKind } from '@/src/constants/day_checklists';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export const DAY_CHECKLIST_KEY = 'dayChecklists';

export type DayChecklistState = Record<string, boolean>;

export type DayChecklistStore = Record<string, DayChecklistState>;

function storeKey(dateKey: string, kind: DayChecklistKind): string {
	return `${dateKey}:${kind}`;
}

export async function getDayChecklistStore(): Promise<DayChecklistStore> {
	const store = await localforage.getItem<DayChecklistStore>(DAY_CHECKLIST_KEY);
	return store ?? {};
}

export async function getDayChecklistForDate(
	dateKey: string,
	kind: DayChecklistKind
): Promise<DayChecklistState> {
	const store = await getDayChecklistStore();
	return store[storeKey(dateKey, kind)] ?? {};
}

export async function saveDayChecklistForDate(
	dateKey: string,
	kind: DayChecklistKind,
	state: DayChecklistState
): Promise<void> {
	const store = await getDayChecklistStore();
	store[storeKey(dateKey, kind)] = state;
	await localforage.setItem(DAY_CHECKLIST_KEY, store);
	const { notifyOrderOpsChange, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);
	if (!isSyncNotifySuppressed()) {
		await notifyOrderOpsChange();
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
	store[storeKey(dateKey, 'open')] = { ...snapshot.open };
	store[storeKey(dateKey, 'close')] = { ...snapshot.close };
	await localforage.setItem(DAY_CHECKLIST_KEY, store);
}

export function isDayChecklistComplete(
	itemIds: string[],
	state: DayChecklistState
): boolean {
	return itemIds.every((id) => state[id] === true);
}

export { getTodayDateKey };
