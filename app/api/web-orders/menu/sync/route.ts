import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
	await auth.protect();
	const baseUrl = process.env.NEXT_PUBLIC_TANGIFY_API_BASE_URL?.replace(/\/$/, '');
	const token = process.env.TANGIFY_BILLING_TOKEN?.trim();

	if (!baseUrl || !token) {
		return NextResponse.json(
			{ error: 'Billing backend is not configured' },
			{ status: 500 }
		);
	}

	try {
		const response = await fetch(`${baseUrl}/api/v1/web/menu/publish`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			cache: 'no-store',
			signal: AbortSignal.timeout(60_000),
		});
		const payload = await response.json().catch(() => ({
			error: 'Menu publish returned an invalid response',
		}));
		return NextResponse.json(payload, { status: response.status });
	} catch {
		return NextResponse.json(
			{ error: 'Unable to reach menu publish backend' },
			{ status: 502 }
		);
	}
}
