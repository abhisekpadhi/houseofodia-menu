import { BillingContext, TBill } from '@/src/models/common';
import {
	applyBillAmountsToBill,
	billAmountsFromBill,
} from '@/src/utils/bill_totals';

const DEFAULT_TIMEOUT_MS = 300_000;

export function getTangifyApiBaseUrl(): string {
	const baseUrl = process.env.NEXT_PUBLIC_TANGIFY_API_BASE_URL?.replace(/\/$/, '');
	if (!baseUrl) {
		throw new Error('NEXT_PUBLIC_TANGIFY_API_BASE_URL is not configured');
	}
	return baseUrl;
}

export type GenerateReviewResponse = {
	review: string;
};

export async function generateTangifyReview(rating: number): Promise<string> {
	const response = await fetch(
		`${getTangifyApiBaseUrl()}/api/v1/reviews/generate`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rating }),
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
		}
	);

	let payload: GenerateReviewResponse | { error?: string } | null = null;
	try {
		payload = (await response.json()) as GenerateReviewResponse | { error?: string };
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			payload && 'error' in payload && typeof payload.error === 'string'
				? payload.error
				: 'Failed to generate review';
		throw new Error(message);
	}

	const review = (payload as GenerateReviewResponse | null)?.review?.trim();
	if (!review) {
		throw new Error('No review returned');
	}

	return review;
}

export const TANGIFY_REVIEW_REQUEST_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

type BackendBill = {
	id: string;
	state_key: string;
	session_id: string;
	table_ids: string[];
	payment_method: string;
	payment_status: string;
	total_tax_in_paise: number;
	total_discount_in_paise: number;
	total_amount_in_paise: number;
	created_at: number;
	updated_at: number;
};

const toPaise = (rupees: number) => Math.round(rupees * 100);

export function toBillingCustomerId(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 10) {
		return `91${digits}`;
	}
	if (digits.length === 12 && digits.startsWith('91')) {
		return digits;
	}
	if (digits.length === 11 && digits.startsWith('0')) {
		return `91${digits.slice(1)}`;
	}
	return digits;
}

export type LoyaltyWallet = {
	phone: string;
	user_id: string;
	points_balance: number;
};

export async function fetchLoyaltyWallet(phone: string): Promise<LoyaltyWallet> {
	const customerId = toBillingCustomerId(phone);
	const response = await fetch(
		`/api/loyalty/wallet?phone=${encodeURIComponent(customerId)}`,
		{
			method: 'GET',
			cache: 'no-store',
			signal: AbortSignal.timeout(30_000),
		}
	);
	const payload = (await response.json().catch(() => null)) as
		| LoyaltyWallet
		| { error?: string }
		| null;
	if (!response.ok) {
		throw new Error(
			(payload && 'error' in payload && payload.error) ||
				'Failed to load loyalty wallet'
		);
	}
	if (!payload || !('points_balance' in payload)) {
		throw new Error('Loyalty wallet response was invalid');
	}
	return payload;
}

export async function saveBillToBackend(
	bill: TBill,
	context: BillingContext,
	options?: { settled?: boolean; loyaltyPhone?: string }
): Promise<BackendBill> {
	const amounts = billAmountsFromBill(bill);
	const billWithTotals = applyBillAmountsToBill(bill, amounts);
	const pointsToRedeem = Math.max(0, Math.floor(billWithTotals.pointsToRedeem ?? 0));
	const discountAmount = toPaise(amounts.discount);

	const discountDescription =
		billWithTotals.membership === 'points'
			? `${pointsToRedeem} points`
			: billWithTotals.membership === 'custom'
				? billWithTotals.customDiscountReason?.trim() || 'Custom discount'
				: billWithTotals.membership === 'monthly' ||
					  billWithTotals.membership === 'yearly'
					? `${billWithTotals.membership} membership`
					: '';

	const discountType =
		billWithTotals.membership === 'points'
			? 'points'
			: billWithTotals.membership === 'custom'
				? 'custom'
				: 'membership';

	const customerId = billWithTotals.customerPhone
		? toBillingCustomerId(billWithTotals.customerPhone.trim())
		: '';
	const loyaltyPhone = (
		billWithTotals.pointsPhone?.trim() ||
		options?.loyaltyPhone?.trim() ||
		''
	);
	const loyaltyCustomerId = loyaltyPhone
		? toBillingCustomerId(loyaltyPhone)
		: '';

	const response = await fetch('/api/bills', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...(billWithTotals.backendBillId
				? { id: billWithTotals.backendBillId }
				: { state_key: billWithTotals.stateKey }),
			session_id: billWithTotals.sessionId,
			...(customerId ? { customer_id: customerId } : {}),
			...(loyaltyCustomerId ? { loyalty_customer_id: loyaltyCustomerId } : {}),
			...(options?.settled ? { settled: true } : {}),
			table_ids: context.tableNumbers.map((table) => `T${table}`),
			line_items: billWithTotals.cart.items.map((item) => ({
				name: item.name,
				quantity: item.qty,
				price: toPaise(item.price),
			})),
			discounts:
				discountAmount > 0
					? [
							{
								id: `discount-${billWithTotals.membership ?? 'none'}`,
								type: discountType,
								amount: discountAmount,
								description: discountDescription,
							},
						]
					: [],
			taxes: [
				{
					id: 'cgst',
					name: 'CGST',
					rate_in_bps: 250,
					amount_in_paise: toPaise(amounts.cgst),
				},
				{
					id: 'sgst',
					name: 'SGST',
					rate_in_bps: 250,
					amount_in_paise: toPaise(amounts.sgst),
				},
				...(amounts.roundOff > 0
					? [
							{
								id: 'round_off',
								name: 'Round off',
								rate_in_bps: 0,
								amount_in_paise: toPaise(amounts.roundOff),
							},
						]
					: []),
			],
			payment_method:
				billWithTotals.method === 'CARD' ? 'card' : 'cash_or_upi',
			payment_status: 'pending',
		}),
		signal: AbortSignal.timeout(30_000),
	});

	const payload = (await response.json().catch(() => null)) as
		| BackendBill
		| { error?: string }
		| null;
	if (!response.ok) {
		throw new Error(
			(payload && 'error' in payload && payload.error) ||
				'Failed to store bill'
		);
	}
	if (!payload || !('id' in payload) || !payload.id) {
		throw new Error('Billing backend did not return a bill number');
	}
	return payload;
}
