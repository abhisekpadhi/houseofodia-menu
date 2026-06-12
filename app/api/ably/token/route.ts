import { getOrderOpsChannel } from '@/src/models/order_ops';
import Ably from 'ably';
import { NextRequest, NextResponse } from 'next/server';

const DEVICE_ID_PATTERN =
	/^device-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: NextRequest) {
	const deviceId = request.nextUrl.searchParams.get('deviceId');

	if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
		return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 });
	}

	const apiKey = process.env.ABLY_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: 'Ably is not configured (ABLY_API_KEY missing)' },
			{ status: 503 }
		);
	}

	const ably = new Ably.Rest({ key: apiKey });
	const channel = getOrderOpsChannel();
	const tokenRequest = await ably.auth.createTokenRequest({
		clientId: deviceId,
		capability: {
			[channel]: ['subscribe', 'publish', 'presence'],
		},
	});

	return NextResponse.json(tokenRequest);
}
