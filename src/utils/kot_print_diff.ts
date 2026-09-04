import type { TOrder } from '@/src/models/common';
import { getOrderKotLines, isWaterBottleDish } from '@/src/utils/order_utils';

function kotLineKey(line: { name: string; isParcel: boolean }): string {
	return `${line.name}|${line.isParcel ? '1' : '0'}`;
}

/** Dish totals for change detection — parcel toggles do not reprint KOT. */
function kotLineKeyForChangeDetection(line: { name: string }): string {
	return line.name;
}

/** Kitchen-facing KOT lines — excludes water bottles (not cooked). */
function getKitchenKotLines(order: TOrder) {
	return getOrderKotLines(order).filter((line) => !isWaterBottleDish(line.name));
}

function linesMap(
	lines: ReturnType<typeof getOrderKotLines>,
	keyFn: (line: { name: string; isParcel: boolean }) => string
): Map<string, number> {
	const map = new Map<string, number>();
	for (const line of lines) {
		const key = keyFn(line);
		map.set(key, (map.get(key) ?? 0) + line.qty);
	}
	return map;
}

/** True when kitchen KOT lines or notes differ (water and parcel-only changes ignored). */
export function hasKitchenRelevantChange(prev: TOrder, next: TOrder): boolean {
	const before = linesMap(getKitchenKotLines(prev), kotLineKeyForChangeDetection);
	const after = linesMap(getKitchenKotLines(next), kotLineKeyForChangeDetection);
	const keys = Array.from(
		new Set([...Array.from(before.keys()), ...Array.from(after.keys())])
	);
	for (const key of keys) {
		if ((before.get(key) ?? 0) !== (after.get(key) ?? 0)) {
			return true;
		}
	}
	return (prev.notes?.trim() || '') !== (next.notes?.trim() || '');
}

/** Stable fingerprint of what the kitchen ticket would show. */
export function kotContentFingerprint(order: TOrder): string {
	const lines = getKitchenKotLines(order)
		.map((line) => `${line.qty}|${kotLineKey(line)}`)
		.sort()
		.join(';');
	const notes = order.notes?.trim() ?? '';
	return `${lines}#${notes}`;
}

export type KotPrintIntent = {
	order: TOrder;
	mode: 'new' | 'update';
	printJobId: string;
};

/**
 * Diff active order lists and return explicit KOT print intents.
 * Skips water-only orders and anything with no kitchen-printable lines.
 */
export function collectKotPrintIntents(
	prevOrders: TOrder[],
	nextOrders: TOrder[]
): KotPrintIntent[] {
	const prevById = new Map(prevOrders.map((order) => [order.id, order]));
	const intents: KotPrintIntent[] = [];

	for (const next of nextOrders) {
		// Explicit false disables auto KOT; missing/true keeps default on.
		if (next.autoKot === false) continue;

		const kitchenLines = getKitchenKotLines(next);
		if (kitchenLines.length === 0) continue;

		const prev = prevById.get(next.id);
		let mode: 'new' | 'update' | null = null;
		if (!prev) {
			mode = 'new';
		} else if (hasKitchenRelevantChange(prev, next)) {
			mode = 'update';
		}
		if (!mode) continue;

		const fingerprint = kotContentFingerprint(next);
		intents.push({
			order: next,
			mode,
			printJobId: `auto:${next.id}:${mode}:${fingerprint}`,
		});
	}

	return intents;
}
