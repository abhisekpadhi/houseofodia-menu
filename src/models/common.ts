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
}

export type TBillNoResp = { bill_no: number}
export type TBillNoUpdateResp = {success: boolean}
