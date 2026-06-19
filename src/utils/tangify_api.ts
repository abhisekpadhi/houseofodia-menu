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
