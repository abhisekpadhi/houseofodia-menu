export type TMenuApiItem = {
	status: string;
	category: string;
	name: string;
	description: string;
	price: string;
	is_veg: boolean;
};

export type TMenu = {
	[category: string]: Omit<TMenuApiItem, 'category'>[];
};

export type TStorage = {menu: TMenu, created_at: number}

export type TDish = {name: string, price: number, qty: number}

export type TOrderItem = TDish & {
	fulfilledQty?: number;
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

export const TABLE_COUNT = 10;

export type OrderKind = 'table' | 'takeaway' | 'delivery';

export type TOrder = {
	id: string;
	createdAt: number;
	kind: OrderKind;
	tableNumbers: number[];
	items: TOrderItem[];
	/** Set when all items are fulfilled; order is purged after READY_ORDER_PURGE_MS */
	readyAt?: number;
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
	dishName: string;
	orderLabel: string;
	createdAt: number;
	fulfilled: boolean;
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
