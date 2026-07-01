const DEFAULT_TIMEOUT_MS = 60_000;

export function isOrdersBackendEnabled(): boolean {
	return process.env.NEXT_PUBLIC_TANGIFY_ORDERS_BACKEND === 'true';
}

export function getTangifyProxyBaseUrl(): string {
	return '/api/tangify';
}

type TangifyErrorBody = { error?: string };

export async function tangifyFetch<T>(
	path: string,
	init?: RequestInit
): Promise<T> {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	const url = `${getTangifyProxyBaseUrl()}${normalized}`;
	const response = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {}),
		},
		signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
	});

	let payload: T | TangifyErrorBody | null = null;
	try {
		payload = (await response.json()) as T | TangifyErrorBody;
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			payload &&
			typeof payload === 'object' &&
			'error' in payload &&
			typeof payload.error === 'string'
				? payload.error
				: `Tangify API error (${response.status})`;
		throw new Error(message);
	}

	return payload as T;
}
