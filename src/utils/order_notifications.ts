import type { TOrder } from '@/src/models/common';
import {
	formatOrderLabel,
	getItemUnitStates,
	isUnitStateCancelled,
} from '@/src/utils/order_utils';
import localforage from 'localforage';

export const ORDER_NOTIFICATIONS_KEY = 'orderNotifications';
export const ORDER_NOTIFICATIONS_EVENT = 'orderNotificationsUpdated';

const MAX_NOTIFICATIONS = 100;

/** How long a notification stays visible after being marked done. */
export const DONE_NOTIFICATION_TTL_MS = 5 * 60 * 1000;

export type OrderNotificationKind = 'updated' | 'cancelled';

export type OrderNotification = {
	id: string;
	kind: OrderNotificationKind;
	tableLabel: string;
	orderId: string;
	items: string[];
	createdAt: number;
	done: boolean;
	/** When the notification was marked done (used for auto-expiry). */
	doneAt?: number;
};

export type OrderNotificationDraft = Omit<
	OrderNotification,
	'id' | 'createdAt' | 'done'
>;

type OrderSignature = {
	kind: TOrder['kind'];
	label: string;
	/** dish name -> total units (including cancelled) */
	totals: Record<string, number>;
	/** dish name -> cancelled units */
	cancelled: Record<string, number>;
};

export type OrderSignatureMap = Record<string, OrderSignature>;

export function buildOrderSignatures(orders: TOrder[]): OrderSignatureMap {
	const map: OrderSignatureMap = {};
	for (const order of orders) {
		const totals: Record<string, number> = {};
		const cancelled: Record<string, number> = {};
		for (const item of order.items) {
			const states = getItemUnitStates(item);
			totals[item.name] = (totals[item.name] ?? 0) + states.length;
			const cancelledCount = states.filter(isUnitStateCancelled).length;
			if (cancelledCount > 0) {
				cancelled[item.name] = (cancelled[item.name] ?? 0) + cancelledCount;
			}
		}
		map[order.id] = {
			kind: order.kind,
			label: formatOrderLabel(order),
			totals,
			cancelled,
		};
	}
	return map;
}

function formatCountLabel(count: number, dishName: string): string {
	return count > 1 ? `${count}× ${dishName}` : dishName;
}

/**
 * Compares two order signature maps and returns notification drafts for table
 * orders whose items were updated (added / removed) or cancelled. New orders and
 * removed (billed / closed) orders are ignored.
 */
export function diffOrderSignatures(
	prev: OrderSignatureMap,
	next: OrderSignatureMap
): OrderNotificationDraft[] {
	const drafts: OrderNotificationDraft[] = [];

	for (const orderId of Object.keys(next)) {
		const before = prev[orderId];
		const after = next[orderId];
		if (!before || after.kind !== 'table') {
			continue;
		}

		const dishNames = Array.from(
			new Set([...Object.keys(before.totals), ...Object.keys(after.totals)])
		);

		const updatedItems: string[] = [];
		const cancelledItems: string[] = [];

		for (const dish of dishNames) {
			const prevTotal = before.totals[dish] ?? 0;
			const nextTotal = after.totals[dish] ?? 0;
			const prevCancelled = before.cancelled[dish] ?? 0;
			const nextCancelled = after.cancelled[dish] ?? 0;

			if (nextCancelled > prevCancelled) {
				cancelledItems.push(
					formatCountLabel(nextCancelled - prevCancelled, dish)
				);
			}

			if (nextTotal !== prevTotal) {
				const delta = nextTotal - prevTotal;
				const sign = delta > 0 ? '+' : '−';
				updatedItems.push(`${sign}${Math.abs(delta)} ${dish}`);
			}
		}

		if (cancelledItems.length > 0) {
			drafts.push({
				kind: 'cancelled',
				tableLabel: after.label,
				orderId,
				items: cancelledItems,
			});
		}
		if (updatedItems.length > 0) {
			drafts.push({
				kind: 'updated',
				tableLabel: after.label,
				orderId,
				items: updatedItems,
			});
		}
	}

	return drafts;
}

export async function getOrderNotifications(): Promise<OrderNotification[]> {
	const stored = await localforage.getItem<OrderNotification[]>(
		ORDER_NOTIFICATIONS_KEY
	);
	return Array.isArray(stored) ? stored : [];
}

function dispatchNotificationsUpdated(): void {
	if (typeof window === 'undefined') {
		return;
	}
	window.dispatchEvent(new CustomEvent(ORDER_NOTIFICATIONS_EVENT));
}

export async function addOrderNotifications(
	drafts: OrderNotificationDraft[]
): Promise<void> {
	if (drafts.length === 0) {
		return;
	}
	const existing = await getOrderNotifications();
	const now = Date.now();
	const created: OrderNotification[] = drafts.map((draft, index) => ({
		...draft,
		id: `notif-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
		createdAt: now,
		done: false,
	}));
	const next = [...created, ...existing].slice(0, MAX_NOTIFICATIONS);
	await localforage.setItem(ORDER_NOTIFICATIONS_KEY, next);
	dispatchNotificationsUpdated();
}

export async function setOrderNotificationDone(
	id: string,
	done: boolean
): Promise<void> {
	const existing = await getOrderNotifications();
	const next = existing.map((notification) =>
		notification.id === id
			? { ...notification, done, doneAt: done ? Date.now() : undefined }
			: notification
	);
	await localforage.setItem(ORDER_NOTIFICATIONS_KEY, next);
	dispatchNotificationsUpdated();
}

export async function clearDoneOrderNotifications(): Promise<void> {
	const existing = await getOrderNotifications();
	const next = existing.filter((notification) => !notification.done);
	await localforage.setItem(ORDER_NOTIFICATIONS_KEY, next);
	dispatchNotificationsUpdated();
}

/**
 * Removes done notifications whose display window has elapsed. Returns true when
 * anything was removed so callers can decide whether to refresh.
 */
export async function pruneExpiredOrderNotifications(
	now = Date.now()
): Promise<boolean> {
	const existing = await getOrderNotifications();
	const next = existing.filter(
		(notification) =>
			!notification.done ||
			now - (notification.doneAt ?? notification.createdAt) <
				DONE_NOTIFICATION_TTL_MS
	);
	if (next.length === existing.length) {
		return false;
	}
	await localforage.setItem(ORDER_NOTIFICATIONS_KEY, next);
	dispatchNotificationsUpdated();
	return true;
}

/**
 * Sorts notifications for display: active ones first (newest first), done ones
 * pushed to the bottom (most recently done first).
 */
export function sortOrderNotificationsForDisplay(
	notifications: OrderNotification[]
): OrderNotification[] {
	return [...notifications].sort((a, b) => {
		if (a.done !== b.done) {
			return a.done ? 1 : -1;
		}
		if (a.done) {
			return (b.doneAt ?? 0) - (a.doneAt ?? 0);
		}
		return b.createdAt - a.createdAt;
	});
}
