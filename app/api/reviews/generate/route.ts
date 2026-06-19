import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type GenerateReviewRequest = {
	rating: number;
};

type GenerateReviewResponse = {
	review: string;
};

export async function POST(request: NextRequest) {
	let body: GenerateReviewRequest;
	try {
		body = (await request.json()) as GenerateReviewRequest;
	} catch {
		return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (
		typeof body.rating !== 'number' ||
		!Number.isInteger(body.rating) ||
		body.rating < 1 ||
		body.rating > 5
	) {
		return NextResponse.json(
			{ error: 'rating must be an integer between 1 and 5' },
			{ status: 400 }
		);
	}

	const baseUrl = process.env.TANGIFY_API_BASE_URL?.replace(/\/$/, '');
	if (!baseUrl) {
		return NextResponse.json(
			{ error: 'Review service is not configured (TANGIFY_API_BASE_URL missing)' },
			{ status: 503 }
		);
	}

	try {
		const response = await axios.post<GenerateReviewResponse>(
			`${baseUrl}/api/v1/reviews/generate`,
			{ rating: body.rating },
			{
				headers: { 'Content-Type': 'application/json' },
				timeout: 30_000,
			}
		);
		return NextResponse.json(response.data);
	} catch (error) {
		if (axios.isAxiosError(error)) {
			const status = error.response?.status ?? 502;
			const message =
				(typeof error.response?.data === 'object' &&
				error.response?.data &&
				'error' in error.response.data &&
				typeof error.response.data.error === 'string'
					? error.response.data.error
					: null) ?? 'Failed to generate review';
			return NextResponse.json({ error: message }, { status });
		}
		return NextResponse.json(
			{ error: 'Failed to generate review' },
			{ status: 502 }
		);
	}
}
