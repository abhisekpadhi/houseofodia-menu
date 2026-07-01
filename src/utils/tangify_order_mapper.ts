import type { TOrder, TOrderItem } from '@/src/models/common';
import {
	channelToOrderKind,
	paiseToRupees,
	rupeesToPaise,
	TangifyLiveOrdersResponse,
	TangifyLineItem,
	TangifyOrder,
	TangifySession,
	TangifySessionWithOrders,
	unitStateToUI,
} from '@/src/types/tangify_billing';

function mapLineItemToUI(item: TangifyLineItem): TOrderItem {
	const unitStates =
		item.unit_states && item.unit_states.length > 0
			? item.unit_states.map(unitStateToUI)
			: undefined;
	return {
		name: item.name,
		price: paiseToRupees(item.price),
		qty: item.quantity,
		lineItemId: item.id,
		...(unitStates ? { unitStates } : {}),
		...(item.parcel_units ? { parcelUnits: item.parcel_units } : {}),
	};
}

function mapLineItemToAPI(item: TOrderItem): TangifyLineItem {
	return {
		id: item.lineItemId ?? '',
		name: item.name,
		quantity: item.qty,
		price: rupeesToPaise(item.price),
		unit_states: (item.unitStates ?? []).map((state) => {
			if (typeof state === 'object' && state.status === 'cancelled') {
				return {
					status: 'cancelled',
					cancel_reason: state.reason,
					...(state.cancelledAt ? { cancelled_at: state.cancelledAt } : {}),
				};
			}
			if (state === 'fulfilled') {
				return { status: 'fulfilled' };
			}
			return { status: 'pending' };
		}),
		parcel_units: item.parcelUnits,
	};
}

function mapOrderToUI(order: TangifyOrder, session: TangifySession): TOrder {
	const kind = channelToOrderKind(order.channel);
	const tableNumbers =
		kind === 'table'
			? session.table_ids
					.map((t) => parseInt(t, 10))
					.filter((n) => !Number.isNaN(n))
			: [];

	const flags = session.service_flags;
	return {
		id: order.id,
		createdAt: order.ordered_at,
		kind,
		tableNumbers,
		items: order.items.map(mapLineItemToUI),
		...(order.customer_name ? { customerName: order.customer_name } : {}),
		...(order.customer_phone ? { customerPhone: order.customer_phone } : {}),
		...(order.notes ? { notes: order.notes } : {}),
		...(session.pax ? { pax: session.pax } : {}),
		...(session.group_notes ? { groupNotes: session.group_notes } : {}),
		...(order.ready_at ? { readyAt: order.ready_at } : {}),
		...(order.marked_done_at ? { markedDoneAt: order.marked_done_at } : {}),
		...(flags?.welcome_drink_served ? { welcomeDrinkServed: true } : {}),
		...(flags?.complementary_served ? { complementaryServed: true } : {}),
		...(flags?.kid_menu_enabled ? { kidMenuEnabled: true } : {}),
		...(flags?.kid_menu_served ? { kidMenuServed: true } : {}),
		sessionId: session.id,
		...(order.bill_id || session.bill_id
			? { billId: order.bill_id || session.bill_id }
			: {}),
	};
}

export function mapLiveOrdersToTOrders(
	response: TangifyLiveOrdersResponse
): TOrder[] {
	const orders: TOrder[] = [];
	for (const bundle of response.sessions ?? []) {
		for (const order of bundle.orders ?? []) {
			orders.push(mapOrderToUI(order, bundle.session));
		}
	}
	return orders.sort((a, b) => a.createdAt - b.createdAt);
}

export function mapTOrderToCreateItems(items: TOrderItem[]): TangifyLineItem[] {
	return items.map(mapLineItemToAPI);
}

export function getSessionIdFromOrders(orders: TOrder[]): string | undefined {
	return orders.find((o) => o.sessionId)?.sessionId;
}

export function findNextPendingUnitForDish(
	orders: TOrder[],
	dishName: string
): { orderId: string; lineItemId: string; unitIndex: number } | null {
	const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
	for (const order of sorted) {
		for (const item of order.items) {
			if (item.name !== dishName || !item.lineItemId) {
				continue;
			}
			const states = item.unitStates ?? [];
			for (let unitIndex = 0; unitIndex < states.length; unitIndex++) {
				if (states[unitIndex] === 'pending') {
					return {
						orderId: order.id,
						lineItemId: item.lineItemId,
						unitIndex,
					};
				}
			}
		}
	}
	return null;
}

export function findLastFulfilledUnitForDish(
	orders: TOrder[],
	dishName: string
): { orderId: string; lineItemId: string; unitIndex: number } | null {
	const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
	for (const order of sorted) {
		for (let itemIndex = order.items.length - 1; itemIndex >= 0; itemIndex--) {
			const item = order.items[itemIndex];
			if (item.name !== dishName || !item.lineItemId) {
				continue;
			}
			const states = item.unitStates ?? [];
			for (let unitIndex = states.length - 1; unitIndex >= 0; unitIndex--) {
				if (states[unitIndex] === 'fulfilled') {
					return {
						orderId: order.id,
						lineItemId: item.lineItemId,
						unitIndex,
					};
				}
			}
		}
	}
	return null;
}

export function findOpenSessionForTables(
	response: TangifyLiveOrdersResponse,
	tableNumbers: number[]
): TangifySessionWithOrders | undefined {
	const want = new Set(tableNumbers.map(String));
	for (const bundle of response.sessions ?? []) {
		const sess = bundle.session;
		if (sess.status !== 'live' && sess.status !== 'billing') {
			continue;
		}
		if (sess.table_ids.some((t) => want.has(t))) {
			return bundle;
		}
	}
	return undefined;
}
