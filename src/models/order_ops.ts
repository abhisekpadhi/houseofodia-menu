import { TOrder } from '@/src/models/common';

export const ORDER_OPS_CHANNEL_DEFAULT = 'order_ops';

/** Ably channel for order/inventory sync. Override with ABLY_CHANNEL or NEXT_PUBLIC_ABLY_CHANNEL. */
export function getOrderOpsChannel(): string {
	const fromEnv =
		process.env.NEXT_PUBLIC_ABLY_CHANNEL?.trim() ||
		process.env.ABLY_CHANNEL?.trim();
	return fromEnv || ORDER_OPS_CHANNEL_DEFAULT;
}

export const ORDER_OPS_META_KEY = 'order_ops_meta';
export const ORDER_OPS_DEVICE_ID_KEY = 'order_ops_device_id';

export const ORDER_OPS_EVENT = 'order-ops-updated';

export type OrderOpsMeta = {
	deviceId: string;
	stateVersion: number;
	businessDate: string;
	lastUpdatedAt: number;
};

export type OrderOpsSnapshot = {
	deviceId: string;
	stateVersion: number;
	businessDate: string;
	orders: TOrder[];
	inventory: Record<string, number>;
	sentAt: number;
};

export type SyncRequestMessage = {
	requesterId: string;
	targetId: string;
	requesterVersion: number;
};

export type SyncResponseMessage = OrderOpsSnapshot & {
	targetId: string;
	responderId: string;
};

export type StateDeltaMessage = OrderOpsSnapshot;

export type OrderOpsPresenceData = {
	deviceId: string;
	stateVersion: number;
	businessDate: string;
};
