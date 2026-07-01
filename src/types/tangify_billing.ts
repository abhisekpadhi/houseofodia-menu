import type { ItemCancelReason, OrderKind, OrderItemUnitState } from '@/src/models/common';

export type TangifyUnitState = {
	status: string;
	cancel_reason?: string;
	cancelled_at?: number;
};

export type TangifyLineItem = {
	id: string;
	name: string;
	menu_item_id?: string;
	category?: string;
	internal_name?: string;
	quantity: number;
	price: number;
	unit_states?: TangifyUnitState[];
	parcel_units?: boolean[];
	status?: string;
	removed?: boolean;
};

export type TangifyOrder = {
	id: string;
	session_id: string;
	venue_id?: string;
	channel: string;
	bill_id?: string;
	customer_id?: string;
	customer_name?: string;
	customer_phone?: string;
	notes?: string;
	items: TangifyLineItem[];
	total_price: number;
	kitchen_status: string;
	ordered_at: number;
	ready_at?: number;
	marked_done_at?: number;
	completed_at?: number;
	updated_at?: number;
};

export type TangifySessionServiceFlags = {
	welcome_drink_served?: boolean;
	complementary_served?: boolean;
	kid_menu_enabled?: boolean;
	kid_menu_served?: boolean;
};

export type TangifySession = {
	id: string;
	table_ids: string[];
	status: string;
	bill_id?: string;
	pax?: number;
	group_notes?: string;
	service_flags?: TangifySessionServiceFlags;
	opened_at: number;
	closed_at?: number;
	updated_at?: number;
	venue_id?: string;
};

export type TangifySessionWithOrders = {
	session: TangifySession;
	orders: TangifyOrder[];
};

export type TangifyLiveOrdersResponse = {
	sessions: TangifySessionWithOrders[];
};

export type TangifyBill = {
	id: string;
	session_id: string;
	invoice_number?: string;
	payment_method?: string;
	payment_status?: string;
	subtotal_in_paise?: number;
	total_amount_in_paise?: number;
	staff_welfare_in_paise?: number;
};

export type TangifyInvoiceNumberResponse = {
	invoice_number: string;
	bill_id: string;
	year?: number;
	sequence?: number;
};

export const CANCEL_REASON_API_TO_UI: Record<string, ItemCancelReason> = {
	customer_cancel: 'customer_cancel',
	waiter_cancel: 'waiter_cancel',
	kitchen_out_of_stock: 'kitchen_out_of_stock',
	kitchen_unable_to_prepare: 'kitchen_unable_to_prepare',
	wrong_order: 'wrong_order',
	duplicate_order: 'duplicate_order',
	quality_issue: 'quality_issue',
	manager_void: 'manager_void',
};

export const CANCEL_REASON_UI_TO_API: Record<ItemCancelReason, string> = {
	customer_cancel: 'customer_cancel',
	waiter_cancel: 'waiter_cancel',
	kitchen_out_of_stock: 'kitchen_out_of_stock',
	kitchen_unable_to_prepare: 'kitchen_unable_to_prepare',
	wrong_order: 'wrong_order',
	duplicate_order: 'duplicate_order',
	quality_issue: 'quality_issue',
	manager_void: 'manager_void',
};

export function channelToOrderKind(channel: string): OrderKind {
	switch (channel) {
		case 'takeaway':
			return 'takeaway';
		case 'neighbour_delivery':
		case 'whatsapp_quickdelivery':
		case 'whatsapp_normaldelivery':
			return 'delivery';
		default:
			return 'table';
	}
}

export function orderKindToChannel(kind: OrderKind): string {
	switch (kind) {
		case 'takeaway':
			return 'takeaway';
		case 'delivery':
			return 'neighbour_delivery';
		default:
			return 'dining_table';
	}
}

export function unitStateToUI(u: TangifyUnitState): OrderItemUnitState {
	if (u.status === 'fulfilled') {
		return 'fulfilled';
	}
	if (u.status === 'cancelled') {
		const reason =
			(u.cancel_reason && CANCEL_REASON_API_TO_UI[u.cancel_reason]) ||
			'manager_void';
		return {
			status: 'cancelled',
			reason,
			...(u.cancelled_at ? { cancelledAt: u.cancelled_at } : {}),
		};
	}
	return 'pending';
}

export function paiseToRupees(paise: number): number {
	return Math.round(paise / 100);
}

export function rupeesToPaise(rupees: number): number {
	return Math.round(rupees * 100);
}
