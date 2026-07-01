import type { ItemCancelReason, TOrder, TOrderItem } from '@/src/models/common';
import type {
	TangifyBill,
	TangifyLiveOrdersResponse,
	TangifyOrder,
	TangifySession,
	TangifySessionWithOrders,
} from '@/src/types/tangify_billing';
import { CANCEL_REASON_UI_TO_API, orderKindToChannel } from '@/src/types/tangify_billing';
import { tangifyFetch } from '@/src/utils/tangify_client';
import {
	findOpenSessionForTables,
	mapLiveOrdersToTOrders,
	mapTOrderToCreateItems,
} from '@/src/utils/tangify_order_mapper';

const VENUE_ID = process.env.NEXT_PUBLIC_TANGIFY_VENUE_ID ?? 'default';

export async function fetchLiveOrders(): Promise<TOrder[]> {
	const data = await tangifyFetch<TangifyLiveOrdersResponse>(
		`/v1/billing/live-orders?venue_id=${encodeURIComponent(VENUE_ID)}`
	);
	return mapLiveOrdersToTOrders(data);
}

export async function fetchLiveOrdersRaw(): Promise<TangifyLiveOrdersResponse> {
	return tangifyFetch<TangifyLiveOrdersResponse>(
		`/v1/billing/live-orders?venue_id=${encodeURIComponent(VENUE_ID)}`
	);
}

export async function createSessionAndFirstOrder(params: {
	tableIds: string[];
	channel: string;
	items: TOrderItem[];
	pax?: number;
	groupNotes?: string;
	serviceFlags?: TangifySession['service_flags'];
	customerName?: string;
	customerPhone?: string;
	notes?: string;
}): Promise<TangifySessionWithOrders> {
	return tangifyFetch<TangifySessionWithOrders>('/v1/billing/sessions', {
		method: 'POST',
		body: JSON.stringify({
			table_ids: params.tableIds,
			channel: params.channel,
			items: mapTOrderToCreateItems(params.items),
			...(params.pax != null ? { pax: params.pax } : {}),
			...(params.groupNotes ? { group_notes: params.groupNotes } : {}),
			...(params.serviceFlags ? { service_flags: params.serviceFlags } : {}),
			...(params.customerName ? { customer_name: params.customerName } : {}),
			...(params.customerPhone ? { customer_phone: params.customerPhone } : {}),
			...(params.notes ? { notes: params.notes } : {}),
		}),
	});
}

export async function addOrderToSession(params: {
	sessionId: string;
	channel: string;
	items: TOrderItem[];
	customerName?: string;
	customerPhone?: string;
	notes?: string;
}): Promise<TangifyOrder> {
	return tangifyFetch<TangifyOrder>('/v1/billing/orders', {
		method: 'POST',
		body: JSON.stringify({
			session_id: params.sessionId,
			channel: params.channel,
			items: mapTOrderToCreateItems(params.items),
			...(params.customerName ? { customer_name: params.customerName } : {}),
			...(params.customerPhone ? { customer_phone: params.customerPhone } : {}),
			...(params.notes ? { notes: params.notes } : {}),
		}),
	});
}

export async function patchSession(params: {
	sessionId: string;
	pax?: number;
	groupNotes?: string;
	serviceFlags?: TangifySession['service_flags'];
	tableIds?: string[];
}): Promise<TangifySession> {
	return tangifyFetch<TangifySession>('/v1/billing/sessions', {
		method: 'PATCH',
		body: JSON.stringify({
			session_id: params.sessionId,
			...(params.pax != null ? { pax: params.pax } : {}),
			...(params.groupNotes != null ? { group_notes: params.groupNotes } : {}),
			...(params.serviceFlags ? { service_flags: params.serviceFlags } : {}),
			...(params.tableIds ? { table_ids: params.tableIds } : {}),
		}),
	});
}

export async function patchOrder(params: {
	orderId: string;
	items?: TOrderItem[];
	notes?: string;
	markDone?: boolean;
}): Promise<TangifyOrder> {
	return tangifyFetch<TangifyOrder>('/v1/billing/orders', {
		method: 'PATCH',
		body: JSON.stringify({
			order_id: params.orderId,
			...(params.items ? { items: mapTOrderToCreateItems(params.items) } : {}),
			...(params.notes != null ? { notes: params.notes } : {}),
			...(params.markDone ? { mark_done: true } : {}),
		}),
	});
}

export async function patchLineItemUnit(params: {
	orderId: string;
	lineItemId: string;
	unitIndex: number;
	action: 'fulfill' | 'unfulfill' | 'cancel' | 'toggle_parcel';
	cancelReason?: ItemCancelReason;
}): Promise<TangifyOrder> {
	return tangifyFetch<TangifyOrder>('/v1/kitchen/line-items/unit', {
		method: 'PATCH',
		body: JSON.stringify({
			order_id: params.orderId,
			line_item_id: params.lineItemId,
			unit_index: params.unitIndex,
			action: params.action,
			...(params.cancelReason
				? { cancel_reason: CANCEL_REASON_UI_TO_API[params.cancelReason] }
				: {}),
		}),
	});
}

export async function startBill(sessionId: string): Promise<TangifyBill> {
	return tangifyFetch<TangifyBill>('/v1/billing/bills/start', {
		method: 'POST',
		body: JSON.stringify({ session_id: sessionId }),
	});
}

export async function closeSession(
	sessionId: string,
	billId: string
): Promise<void> {
	await tangifyFetch<{ status: string }>('/v1/billing/sessions/close', {
		method: 'POST',
		body: JSON.stringify({ session_id: sessionId, bill_id: billId }),
	});
}

export async function placeOrderOnBackend(order: TOrder): Promise<void> {
	const channel = orderKindToChannel(order.kind);
	const items = order.items;
	const live = await fetchLiveOrdersRaw();

	if (order.kind === 'table' && order.tableNumbers.length > 0) {
		const existing = findOpenSessionForTables(live, order.tableNumbers);
		if (existing) {
			await addOrderToSession({
				sessionId: existing.session.id,
				channel,
				items,
				customerName: order.customerName,
				customerPhone: order.customerPhone,
				notes: order.notes,
			});
			return;
		}
		try {
			await createSessionAndFirstOrder({
				tableIds: order.tableNumbers.map(String),
				channel,
				items,
				pax: order.pax,
				groupNotes: order.groupNotes,
				serviceFlags: {
					...(order.welcomeDrinkServed ? { welcome_drink_served: true } : {}),
					...(order.complementaryServed ? { complementary_served: true } : {}),
					...(order.kidMenuEnabled ? { kid_menu_enabled: true } : {}),
					...(order.kidMenuServed ? { kid_menu_served: true } : {}),
				},
				customerName: order.customerName,
				customerPhone: order.customerPhone,
				notes: order.notes,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : '';
			if (message.includes('already has an open session')) {
				const retryLive = await fetchLiveOrdersRaw();
				const retrySession = findOpenSessionForTables(
					retryLive,
					order.tableNumbers
				);
				if (retrySession) {
					await addOrderToSession({
						sessionId: retrySession.session.id,
						channel,
						items,
						customerName: order.customerName,
						customerPhone: order.customerPhone,
						notes: order.notes,
					});
					return;
				}
			}
			throw error;
		}
		return;
	}

	// Takeaway / delivery: try match by phone on an open session
	const phone = order.customerPhone?.trim();
	if (phone) {
		for (const bundle of live.sessions ?? []) {
			const sess = bundle.session;
			if (sess.status !== 'live' && sess.status !== 'billing') {
				continue;
			}
			const match = bundle.orders.some(
				(o) => o.customer_phone?.trim() === phone && o.channel === channel
			);
			if (match) {
				await addOrderToSession({
					sessionId: sess.id,
					channel,
					items,
					customerName: order.customerName,
					customerPhone: order.customerPhone,
					notes: order.notes,
				});
				return;
			}
		}
	}

	await createSessionAndFirstOrder({
		tableIds: order.tableNumbers.map(String),
		channel,
		items,
		pax: order.pax,
		groupNotes: order.groupNotes,
		customerName: order.customerName,
		customerPhone: order.customerPhone,
		notes: order.notes,
		serviceFlags: order.kidMenuEnabled ? { kid_menu_enabled: true } : undefined,
	});
}
