import type { TOrder } from '@/src/models/common';
import { getOrderKotLines, WATER_DISH_NAME } from '@/src/utils/order_utils';

function kotLineKey(line: { name: string; isParcel: boolean }): string {
	return `${line.name}|${line.isParcel ? '1' : '0'}`;
}

/** Kitchen-facing KOT lines — excludes water bottles (not cooked). */
function getKitchenKotLines(order: TOrder) {
	return getOrderKotLines(order).filter((line) => line.name !== WATER_DISH_NAME);
}

function linesMap(
	lines: ReturnType<typeof getOrderKotLines>
): Map<string, number> {
	const map = new Map<string, number>();
	for (const line of lines) {
		const key = kotLineKey(line);
		map.set(key, (map.get(key) ?? 0) + line.qty);
	}
	return map;
}

/** True when kitchen KOT lines or notes differ (water changes ignored). */
export function hasKitchenRelevantChange(prev: TOrder, next: TOrder): boolean {
	const before = linesMap(getKitchenKotLines(prev));
	const after = linesMap(getKitchenKotLines(next));
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
