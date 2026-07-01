import type { NextRequest } from 'next/server';

const DEFAULT_TIMEOUT_MS = 60_000;

function getUpstreamBaseUrl(): string {
	const base =
		process.env.TANGIFY_API_BASE_URL?.replace(/\/$/, '') ||
		process.env.NEXT_PUBLIC_TANGIFY_API_BASE_URL?.replace(/\/$/, '');
	if (!base) {
		throw new Error('TANGIFY_API_BASE_URL is not configured');
	}
	return base;
}

function getStaffJwt(): string | undefined {
	return process.env.TANGIFY_STAFF_JWT?.trim() || undefined;
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
	const upstreamPath = pathSegments.join('/');
	const upstreamUrl = `${getUpstreamBaseUrl()}/api/${upstreamPath}${request.nextUrl.search}`;

	const headers = new Headers();
	const contentType = request.headers.get('content-type');
	if (contentType) {
		headers.set('Content-Type', contentType);
	}
	const jwt = getStaffJwt();
	if (jwt) {
		headers.set('Authorization', `Bearer ${jwt}`);
	}

	const init: RequestInit = {
		method: request.method,
		headers,
		signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
	};
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = await request.text();
	}

	const upstream = await fetch(upstreamUrl, init);
	const body = await upstream.text();
	return new Response(body, {
		status: upstream.status,
		headers: {
			'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
		},
	});
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await context.params;
		return proxyRequest(request, path);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Proxy error';
		return Response.json({ error: message }, { status: 500 });
	}
}

export async function POST(
	request: NextRequest,
	context: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await context.params;
		return proxyRequest(request, path);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Proxy error';
		return Response.json({ error: message }, { status: 500 });
	}
}

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await context.params;
		return proxyRequest(request, path);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Proxy error';
		return Response.json({ error: message }, { status: 500 });
	}
}

export async function PUT(
	request: NextRequest,
	context: { params: Promise<{ path: string[] }> }
) {
	try {
		const { path } = await context.params;
		return proxyRequest(request, path);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Proxy error';
		return Response.json({ error: message }, { status: 500 });
	}
}
