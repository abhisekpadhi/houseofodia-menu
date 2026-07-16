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
	const membershipRate =
		bill.membership === 'monthly' ? 0.1 : bill.membership === 'yearly' ? 0.2 : 0;
	const membershipDiscount = toPaise(bill.subtotal * membershipRate);

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
				membershipDiscount > 0
					? [
							{
								id: `membership-${bill.membership}`,
								type: 'membership',
								amount: membershipDiscount,
								description: `${bill.membership} membership`,
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
