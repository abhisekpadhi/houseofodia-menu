import type { TBill } from '@/src/models/common';

export type BillMembership =
	| 'none'
	| 'monthly'
	| 'yearly'
	| 'custom'
	| 'points';

export type CustomDiscountUnit = 'rs' | 'percent';

export type CustomDiscountInput = {
	value: number;
	unit: CustomDiscountUnit;
};

export const POINT_RUPEE_VALUE = 3;

export const roundCurrency = (amount: number) =>
	Math.round(amount * 100) / 100;

export function customDiscountFromBill(
	bill: Pick<
		TBill,
		'customDiscountValue' | 'customDiscountUnit' | 'membership'
	>
): CustomDiscountInput | null {
	if (bill.membership !== 'custom') {
		return null;
	}
	return {
		value: bill.customDiscountValue ?? 0,
		unit: bill.customDiscountUnit === 'percent' ? 'percent' : 'rs',
	};
}

export function calculateDiscountAmount(
	subtotal: number,
	membership: BillMembership,
	custom?: CustomDiscountInput | null,
	maxRupeeDiscount?: number,
	pointsToRedeem = 0
): number {
	if (membership === 'points') {
		return roundCurrency(Math.max(0, pointsToRedeem) * POINT_RUPEE_VALUE);
	}
	if (membership === 'monthly') {
		return roundCurrency(subtotal * 0.1);
	}
	if (membership === 'yearly') {
		return roundCurrency(subtotal * 0.2);
	}
	if (membership === 'custom' && custom) {
		const value = Math.max(0, custom.value);
		if (custom.unit === 'percent') {
			const percent = Math.min(100, value);
			return roundCurrency((subtotal * percent) / 100);
		}
		const rupeeCap = Math.min(
			subtotal,
			maxRupeeDiscount != null && Number.isFinite(maxRupeeDiscount)
				? Math.max(0, maxRupeeDiscount)
				: subtotal
		);
		return roundCurrency(Math.min(rupeeCap, value));
	}
	return 0;
}

export type BillAmounts = {
	discount: number;
	/** Always 0 for now — field retained for future service charge. */
	staffWelfare: number;
	taxableAmount: number;
	cgst: number;
	sgst: number;
	roundOff: number;
	payable: number;
};

/**
 * Tax is always on (subtotal − discount). Service charge is forced to 0 for now.
 */
export function calculateBillAmounts(
	subtotal: number,
	membership: BillMembership,
	_staffWelfare = 0,
	custom?: CustomDiscountInput | null,
	pointsToRedeem = 0
): BillAmounts {
	const staffWelfare = 0;
	const undiscountedPayable = (() => {
		const taxableAmount = subtotal;
		const cgst = roundCurrency(taxableAmount * 0.025);
		const sgst = roundCurrency(taxableAmount * 0.025);
		const preRoundPayable = roundCurrency(taxableAmount + cgst + sgst);
		return Math.ceil(preRoundPayable);
	})();
	const discount = calculateDiscountAmount(
		subtotal,
		membership,
		custom,
		undiscountedPayable,
		pointsToRedeem
	);
	const taxableAmount = Math.max(0, roundCurrency(subtotal - discount));
	const cgst = roundCurrency(taxableAmount * 0.025);
	const sgst = roundCurrency(taxableAmount * 0.025);
	const preRoundPayable = roundCurrency(taxableAmount + cgst + sgst);
	const payable = Math.ceil(preRoundPayable);
	const roundOff = roundCurrency(payable - preRoundPayable);

	return {
		discount,
		staffWelfare,
		taxableAmount,
		cgst,
		sgst,
		roundOff,
		payable,
	};
}

export function billAmountsFromBill(bill: TBill): BillAmounts {
	const membership = bill.membership ?? 'none';
	return calculateBillAmounts(
		bill.subtotal,
		membership,
		0,
		customDiscountFromBill(bill),
		membership === 'points' ? bill.pointsToRedeem ?? 0 : 0
	);
}

export function applyBillAmountsToBill(bill: TBill, amounts: BillAmounts): TBill {
	return {
		...bill,
		cgst: amounts.cgst,
		sgst: amounts.sgst,
		roundOff: amounts.roundOff,
		payable: amounts.payable,
		staffWelfare: 0,
	};
}
