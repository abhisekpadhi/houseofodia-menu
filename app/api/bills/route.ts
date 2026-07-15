import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
	const baseUrl = process.env.NEXT_PUBLIC_TANGIFY_API_BASE_URL?.replace(/\/$/, '');
	const token = process.env.TANGIFY_BILLING_TOKEN?.trim();
	const billingEnvironment =
		process.env.TANGIFY_BILLING_ENV?.trim().toLowerCase() ||
		(process.env.NODE_ENV === 'development' ? 'dev' : 'production');

	if (!baseUrl || !token) {
		return NextResponse.json(
			{ error: 'Billing backend is not configured' },
			{ status: 500 }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		const response = await fetch(
			`${baseUrl}/api/v1/billing/bills/with-line-items`,
			{
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'X-Tangify-Environment': billingEnvironment,
				},
				body: JSON.stringify(body),
				cache: 'no-store',
				signal: AbortSignal.timeout(30_000),
			}
		);
		const payload = await response.json().catch(() => ({
			error: 'Billing backend returned an invalid response',
		}));
		return NextResponse.json(payload, { status: response.status });
	} catch {
		return NextResponse.json(
			{ error: 'Unable to reach billing backend' },
			{ status: 502 }
		);
	}
}

