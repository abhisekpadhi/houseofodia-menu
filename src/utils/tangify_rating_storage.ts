export const TANGIFY_RATING_STORAGE_KEY = 'tangify_rating_review';

export const GOOGLE_MAPS_REVIEW_URL =
	'https://search.google.com/local/writereview?placeid=ChIJYdrzSx0VrjsRNYtkdrfeFwY';

export const MANAGEMENT_WHATSAPP_URL =
	'https://wa.me/917760601643?text=' +
	encodeURIComponent("Hi, I've some feedback regarding Tangify");

export type TangifyRatingRecord = {
	rating: number;
	review: string;
	updatedAt: number;
};

type StoredTangifyRatingRecord = TangifyRatingRecord & {
	reviews?: string[];
	selectedReview?: string;
};

export function loadTangifyRating(): TangifyRatingRecord | null {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const raw = localStorage.getItem(TANGIFY_RATING_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as StoredTangifyRatingRecord;

		if (
			typeof parsed.rating !== 'number' ||
			parsed.rating < 1 ||
			parsed.rating > 5
		) {
			return null;
		}

		if (parsed.rating < 4) {
			return {
				rating: parsed.rating,
				review: '',
				updatedAt: parsed.updatedAt ?? Date.now(),
			};
		}

		let review = '';
		if (typeof parsed.review === 'string' && parsed.review.trim()) {
			review = parsed.review.trim();
		} else if (typeof parsed.selectedReview === 'string' && parsed.selectedReview.trim()) {
			review = parsed.selectedReview.trim();
		} else if (Array.isArray(parsed.reviews)) {
			review =
				parsed.reviews.find(
					(item): item is string => typeof item === 'string' && item.trim() !== ''
				)?.trim() ?? '';
		}

		if (!review) {
			return null;
		}

		return {
			rating: parsed.rating,
			review,
			updatedAt: parsed.updatedAt ?? Date.now(),
		};
	} catch {
		return null;
	}
}

export function saveTangifyRating(record: TangifyRatingRecord): void {
	localStorage.setItem(TANGIFY_RATING_STORAGE_KEY, JSON.stringify(record));
}

export async function copyReviewAndOpenGoogleMaps(review: string): Promise<void> {
	if (review.trim()) {
		try {
			await navigator.clipboard.writeText(review.trim());
		} catch (error) {
			console.error('Failed to copy review to clipboard:', error);
		}
	}
	window.location.href = GOOGLE_MAPS_REVIEW_URL;
}

export function shouldGenerateReviews(rating: number): boolean {
	return rating >= 4;
}

export function isLowRating(rating: number): boolean {
	return rating >= 1 && rating <= 3;
}
