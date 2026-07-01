export type TMenuApiItem = {
	status: string;
	category: string;
	name: string;
	/** Staff-facing label from menu sheet; billing still uses `name`. */
	internal_name?: string;
	description: string;
	price: string;
	is_veg: boolean;
	/** Optional prep SOP — newline or pipe separated in Google Sheet */
	sop?: string;
};

export type TMenu = {
	[category: string]: Omit<TMenuApiItem, 'category'>[];
};

export type TStorage = {menu: TMenu, created_at: number}

export type TDish = {name: string, price: number, qty: number}

export type ItemCancelReason =
	| 'customer_cancel'
	| 'waiter_cancel'
	| 'kitchen_out_of_stock'
	| 'kitchen_unable_to_prepare'
	| 'wrong_order'
	| 'duplicate_order'
	| 'quality_issue'
	| 'manager_void';

export type OrderItemUnitState =
	| 'pending'
	| 'fulfilled'
	| { status: 'cancelled'; reason: ItemCancelReason; cancelledAt?: number };

export type TOrderItem = TDish & {
	/** Backend line item id (line_*); set when loaded from tangify API */
	lineItemId?: string;
	/** @deprecated Derived from unitStates during normalization */
	fulfilledQty?: number;
	unitStates?: OrderItemUnitState[];
	/** Per-unit parcel / takeaway packing flag (parallel to unitStates) */
	parcelUnits?: boolean[];
};

export type TCart = {items: TDish[]}

export type TBill = {
	billNumber: string;
	date: string;
	time: string;
	cart: TCart;
	subtotal: number;
	cgst: number;
	sgst: number;
	payable: number;
	method: string;
	/** Rounded-up 10% service charge on discounted subtotal; 0 if not applied */
	staffWelfare?: number;
}

export type TBillNoResp = { bill_no: number}
export type TBillNoUpdateResp = {success: boolean}

export const TABLE_COUNT = 11;

export type OrderKind = 'table' | 'takeaway' | 'delivery';

export type TOrder = {
	id: string;
	createdAt: number;
	kind: OrderKind;
	tableNumbers: number[];
	items: TOrderItem[];
	/** Group-level guest contact for takeaway / delivery (copied to orders in the group) */
	customerName?: string;
	/** Group-level guest phone for takeaway / delivery (also used as group key) */
	customerPhone?: string;
	/** Guest count for the table / order group */
	pax?: number;
	/** Optional instructions for kitchen / service */
	notes?: string;
	/** Set when all items are kitchen-fulfilled */
	readyAt?: number;
	/** Set when service marks the order done (irreversible) */
	markedDoneAt?: number;
	/** Table-level welcome drink — copied to all orders in the table group when set */
	welcomeDrinkServed?: boolean;
	/** Table-level complementary — copied to all orders in the table group when set */
	complementaryServed?: boolean;
	/** Table has kids — show kid menu action on the orders card when set */
	kidMenuEnabled?: boolean;
	/** Table-level kid menu — copied to all orders in the table group when set */
	kidMenuServed?: boolean;
	/** Group-level notes — shown on the orders card only; copied to orders in the group */
	groupNotes?: string;
	/** Set when table was billed and order removed from the active list */
	billedAt?: number;
	/** tangify session id (sess_*) when using backend */
	sessionId?: string;
	/** tangify bill id when session is in billing */
	billId?: string;
};

export type TOrdersStore = {
	orders: TOrder[];
};

export type BillingContext = {
	source: 'orders';
	groupKey: string;
	kind: OrderKind;
	tableNumbers: number[];
	label: string;
	sessionId?: string;
	billId?: string;
};

export const BILLING_CONTEXT_KEY = 'billingContext';

export type OrderGroup = {
	key: string;
	label: string;
	kind: OrderKind;
	tableNumbers?: number[];
	orders: TOrder[];
	oldestOrderAt: number;
};

export type DishUnit = {
	orderId: string;
	itemIndex: number;
	unitIndex: number;
	lineItemId?: string;
	dishName: string;
	orderLabel: string;
	createdAt: number;
	fulfilled: boolean;
	cancelled: boolean;
	cancelReason?: ItemCancelReason;
};

export type ItemGroup = {
	name: string;
	totalQty: number;
	remainingQty: number;
	units: DishUnit[];
};

/** date key YYYY-MM-DD → dish name → remaining qty for that day */
export type TInventoryStore = Record<string, Record<string, number>>;

export const INVENTORY_KEY = 'inventory';
