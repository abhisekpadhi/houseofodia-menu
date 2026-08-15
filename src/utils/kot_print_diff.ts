import type { TOrder } from '@/src/models/common';
import { getOrderKotLines } from '@/src/utils/order_utils';

function kotLineKey(line: { name: string; isParcel: boolean }): string {
	return `${line.name}|${line.isParcel ? '1' : '0'}`;
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

/** True when KOT lines or notes differ in a kitchen-visible way. */
export function hasKitchenRelevantChange(prev: TOrder, next: TOrder): boolean {
	const before = linesMap(getOrderKotLines(prev));
	const after = linesMap(getOrderKotLines(next));
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
	const lines = getOrderKotLines(order)
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
 * Skips orders with nothing kitchen-printable (no lines and no notes).
 */
export function collectKotPrintIntents(
	prevOrders: TOrder[],
	nextOrders: TOrder[]
): KotPrintIntent[] {
	const prevById = new Map(prevOrders.map((order) => [order.id, order]));
	const intents: KotPrintIntent[] = [];

	for (const next of nextOrders) {
		const prev = prevById.get(next.id);
		let mode: 'new' | 'update' | null = null;
		if (!prev) {
			mode = 'new';
		} else if (hasKitchenRelevantChange(prev, next)) {
			mode = 'update';
		}
		if (!mode) continue;

		const lines = getOrderKotLines(next);
		const notes = next.notes?.trim() || '';
		if (lines.length === 0 && !notes) continue;

		const fingerprint = kotContentFingerprint(next);
		intents.push({
			order: next,
			mode,
			printJobId: `auto:${next.id}:${mode}:${fingerprint}`,
		});
	}

	return intents;
}
