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
export const ORDER_OPS_DEVICE_NAME_KEY = 'order_ops_device_name';

export const ORDER_OPS_EVENT = 'order-ops-updated';
export const ORDER_OPS_NEW_ORDERS_EVENT = 'order-ops-new-orders';

export type OrderOpsNewOrdersDetail = {
	orderIds: string[];
	count: number;
};

export type OrderOpsMeta = {
	deviceId: string;
	/** Monotonic epoch-ms version for today's business date */
	stateVersion: number;
	businessDate: string;
	lastUpdatedAt: number;
	/** True after a local write or applying remote state for today */
	initializedForToday?: boolean;
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
	requesterBusinessDate: string;
};

export type SyncResponseMessage = OrderOpsSnapshot & {
	targetId: string;
	responderId: string;
};

export type StateDeltaMessage = OrderOpsSnapshot;

export type OrderOpsPresenceData = {
	deviceId: string;
	deviceName: string;
	stateVersion: number;
	businessDate: string;
	initializedForToday: boolean;
};

export type SyncConflictPeer = {
	clientId: string;
	deviceName: string;
	stateVersion: number;
	initializedForToday: boolean;
};

export type SyncConflict = {
	businessDate: string;
	localVersion: number;
	localInitialized: boolean;
	localDeviceName: string;
	recommendedPeerClientId: string;
	peers: SyncConflictPeer[];
};

export type SyncConflictResolution = 'newest' | 'peer' | 'local';
