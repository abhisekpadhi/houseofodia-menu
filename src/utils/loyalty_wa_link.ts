import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import { TBill } from '@/src/models/common';
import { applyBillingSessions, getBillingSessions } from '@/src/utils/billing_state';
import localforage from 'localforage';
import { BILLING_CONTEXT_KEY } from '@/src/models/common';

export type LoyaltyWaLinkMessage = {
	sessionId: string;
	phone: string;
	pointsBalance: number;
};

export type WaLinkCache = {
	phone: string;
	balance: number;
	receivedAt: number;
};

const WHATSAPP_BUSINESS_NUMBER = '917855074030';

function waLinkCacheKey(sessionId: string): string {
	return `loyalty_wa_link:${sessionId}`;
}

export async function saveWaLinkCache(
	sessionId: string,
	phone: string,
	balance: number
): Promise<void> {
	await localforage.setItem(waLinkCacheKey(sessionId), {
		phone: phone.trim(),
		balance: Math.max(0, Math.floor(balance)),
		receivedAt: Date.now(),
	} satisfies WaLinkCache);
}

export async function getWaLinkCache(
	sessionId: string
): Promise<WaLinkCache | null> {
	const raw = await localforage.getItem<WaLinkCache>(waLinkCacheKey(sessionId));
	if (!raw?.phone?.trim()) {
		return null;
	}
	return {
		phone: raw.phone.trim(),
		balance: Math.max(0, Math.floor(raw.balance ?? 0)),
		receivedAt: raw.receivedAt ?? 0,
	};
}

export function buildLoyaltyWaPrefill(sessionId: string): string {
	return `I want to redeem points for tangify order. order: ${sessionId}`;
}

export function buildLoyaltyWaUrl(sessionId: string): string {
	const text = encodeURIComponent(buildLoyaltyWaPrefill(sessionId));
	return `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${text}`;
}

export function buildLoyaltyQrImageUrl(sessionId: string, size: number): string {
	const waUrl = buildLoyaltyWaUrl(sessionId);
	return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(waUrl)}`;
}

function applyPointsLinkToBill(
	bill: TBill,
	phone: string,
	pointsBalance: number
): TBill {
	const next: TBill = {
		...bill,
		pointsPhone: phone,
		pointsBalance: Math.max(0, Math.floor(pointsBalance)),
		updatedAt: Date.now(),
	};
	if (!next.customerPhone?.trim()) {
		next.customerPhone = phone;
	}
	return next;
}

export async function applyLoyaltyWaLink(
	message: LoyaltyWaLinkMessage
): Promise<boolean> {
	const sessionId = message.sessionId?.trim();
	const phone = message.phone?.trim();
	if (!sessionId || !phone) {
		return false;
	}

	const linkedBillPatch = (bill: TBill) =>
		applyPointsLinkToBill(bill, phone, message.pointsBalance);

	const context = await localforage.getItem<{ sessionId: string }>(
		BILLING_CONTEXT_KEY
	);
	const activeBill =
		context?.sessionId === sessionId
			? await localforage.getItem<TBill>('bill')
			: null;

	let changed = false;
	const sessions = await getBillingSessions();
	const nextSessions = sessions.map((session) => {
		if (session.sessionId !== sessionId) {
			return session;
		}
		changed = true;
		const baseBill =
			session.bill ??
			(activeBill && activeBill.sessionId === sessionId
				? activeBill
				: undefined);
		if (!baseBill) {
			return { ...session, updatedAt: Date.now() };
		}
		const bill = linkedBillPatch(baseBill);
		return {
			...session,
			bill,
			updatedAt: bill.updatedAt,
		};
	});

	if (
		activeBill &&
		activeBill.sessionId === sessionId &&
		(activeBill.pointsPhone !== phone ||
			Math.floor(activeBill.pointsBalance ?? 0) !==
				Math.max(0, Math.floor(message.pointsBalance)))
	) {
		await localforage.setItem('bill', linkedBillPatch(activeBill));
		changed = true;
	}

	if (!changed) {
		return false;
	}

	await saveWaLinkCache(
		sessionId,
		phone,
		message.pointsBalance
	);
	await applyBillingSessions(nextSessions);

	if (typeof window !== 'undefined') {
		window.dispatchEvent(new Event(ORDER_OPS_EVENT));
	}
	return true;
}
