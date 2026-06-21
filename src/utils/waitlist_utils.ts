import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export const WAITLIST_KEY = 'waitlist';

export type WaitlistEntry = {
	id: string;
	name: string;
	number: string;
	pax?: number;
	checked: boolean;
	createdAt: number;
	checkedAt?: number;
};

export type WaitlistStore = Record<string, WaitlistEntry[]>;

export function sortWaitlistEntries(entries: WaitlistEntry[]): WaitlistEntry[] {
	const active = entries
		.filter((entry) => !entry.checked)
		.sort((a, b) => a.createdAt - b.createdAt);
	const done = entries
		.filter((entry) => entry.checked)
		.sort(
			(a, b) =>
				(a.checkedAt ?? a.createdAt) - (b.checkedAt ?? b.createdAt)
		);
	return [...active, ...done];
}

async function getWaitlistStore(): Promise<WaitlistStore> {
	const raw = await localforage.getItem<WaitlistStore | WaitlistEntry[]>(
		WAITLIST_KEY
	);
	if (Array.isArray(raw)) {
		const migrated: WaitlistStore = {
			[getTodayDateKey()]: sortWaitlistEntries(raw),
		};
		await localforage.setItem(WAITLIST_KEY, migrated);
		return migrated;
	}
	return raw ?? {};
}

export async function getWaitlistEntries(
	dateKey = getTodayDateKey()
): Promise<WaitlistEntry[]> {
	const store = await getWaitlistStore();
	return sortWaitlistEntries(store[dateKey] ?? []);
}

export async function saveWaitlistEntries(
	entries: WaitlistEntry[],
	dateKey = getTodayDateKey()
): Promise<void> {
	const store = await getWaitlistStore();
	store[dateKey] = sortWaitlistEntries(entries);
	await localforage.setItem(WAITLIST_KEY, store);
	const { notifyOrderOpsChange, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);
	if (!isSyncNotifySuppressed()) {
		await notifyOrderOpsChange();
	}
}

export async function getWaitlistSnapshotForDate(
	dateKey: string
): Promise<WaitlistEntry[]> {
	return getWaitlistEntries(dateKey);
}

export async function applyWaitlistSnapshot(
	dateKey: string,
	entries: WaitlistEntry[]
): Promise<void> {
	const store = await getWaitlistStore();
	store[dateKey] = sortWaitlistEntries(entries.map((entry) => ({ ...entry })));
	await localforage.setItem(WAITLIST_KEY, store);
}

export function generateWaitlistId(): string {
	return `wait-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeCsvCell(value: string | number): string {
	const text = String(value);
	if (/[",\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function buildWaitlistCsv(entries: WaitlistEntry[]): string {
	const rows = [
		['Name', 'Phone', 'Pax', 'Status', 'Added', 'Seated at'].map(escapeCsvCell).join(','),
	];

	for (const entry of sortWaitlistEntries(entries)) {
		const added = new Date(entry.createdAt).toLocaleString('en-IN');
		const seated = entry.checkedAt
			? new Date(entry.checkedAt).toLocaleString('en-IN')
			: '';
		rows.push(
			[
				entry.name,
				entry.number,
				entry.pax ?? '',
				entry.checked ? 'Seated' : 'Waiting',
				added,
				seated,
			]
				.map(escapeCsvCell)
				.join(',')
		);
	}

	return `\uFEFF${rows.join('\n')}`;
}

export async function shareWaitlistAsExcel(
	entries: WaitlistEntry[],
	dateKey = getTodayDateKey()
): Promise<void> {
	const csv = buildWaitlistCsv(entries);
	const filename = `waiting-list-${dateKey}.csv`;
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const file = new File([blob], filename, { type: 'text/csv' });

	if (
		typeof navigator !== 'undefined' &&
		'share' in navigator &&
		(typeof navigator.canShare !== 'function' ||
			navigator.canShare({ files: [file] }))
	) {
		await navigator.share({
			files: [file],
			title: `Waiting list ${dateKey}`,
		});
		return;
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export { getTodayDateKey };
