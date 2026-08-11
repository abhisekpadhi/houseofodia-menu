import { BillingContext, TBill } from '@/src/models/common';

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

export async function saveBillToBackend(
	bill: TBill,
	context: BillingContext
): Promise<BackendBill> {
	const discountAmount = (() => {
		if (bill.membership === 'monthly') {
			return toPaise(bill.subtotal * 0.1);
		}
		if (bill.membership === 'yearly') {
			return toPaise(bill.subtotal * 0.2);
		}
		if (bill.membership === 'custom') {
			const value = Math.max(0, bill.customDiscountValue ?? 0);
			if (bill.customDiscountUnit === 'percent') {
				const percent = Math.min(100, value);
				return toPaise(bill.subtotal * (percent / 100));
			}
			const undiscountedTaxable = bill.subtotal;
			const undiscountedCgst = Math.round(undiscountedTaxable * 0.025 * 100) / 100;
			const undiscountedSgst = Math.round(undiscountedTaxable * 0.025 * 100) / 100;
			const undiscountedPayable = Math.ceil(
				Math.round(
					(undiscountedTaxable +
						undiscountedCgst +
						undiscountedSgst +
						(bill.staffWelfare ?? 0)) *
						100
				) / 100
			);
			const rupeeCap = Math.min(bill.subtotal, undiscountedPayable);
			return toPaise(Math.min(rupeeCap, value));
		}
		return 0;
	})();

	const discountDescription =
		bill.membership === 'custom'
			? bill.customDiscountReason?.trim() || 'Custom discount'
			: bill.membership === 'monthly' || bill.membership === 'yearly'
				? `${bill.membership} membership`
				: '';

	const response = await fetch('/api/bills', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...(bill.backendBillId
				? { id: bill.backendBillId }
				: { state_key: bill.stateKey }),
			session_id: bill.sessionId,
			...(bill.customerPhone
				? { customer_id: bill.customerPhone.trim() }
				: {}),
			table_ids: context.tableNumbers.map((table) => `T${table}`),
			line_items: bill.cart.items.map((item) => ({
				name: item.name,
				quantity: item.qty,
				price: toPaise(item.price),
			})),
			discounts:
				discountAmount > 0
					? [
							{
								id: `discount-${bill.membership ?? 'none'}`,
								type:
									bill.membership === 'custom' ? 'custom' : 'membership',
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
					amount_in_paise: toPaise(bill.cgst),
				},
				{
					id: 'sgst',
					name: 'SGST',
					rate_in_bps: 250,
					amount_in_paise: toPaise(bill.sgst),
				},
				...((bill.roundOff ?? 0) > 0
					? [
							{
								id: 'round_off',
								name: 'Round off',
								rate_in_bps: 0,
								amount_in_paise: toPaise(bill.roundOff ?? 0),
							},
						]
					: []),
			],
			payment_method:
				bill.method === 'CARD' ? 'card' : 'cash_or_upi',
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
