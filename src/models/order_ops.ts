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

export const ORDER_OPS_DOMAINS = [
	'orders',
	'inventory',
	'waitlist',
	'dayChecklists',
	'supplyInventory',
] as const;

export type OrderOpsDomain = (typeof ORDER_OPS_DOMAINS)[number];

export type OrderOpsVersions = Record<OrderOpsDomain, number>;

export const ZERO_ORDER_OPS_VERSIONS: OrderOpsVersions = {
	orders: 0,
	inventory: 0,
	waitlist: 0,
	dayChecklists: 0,
	supplyInventory: 0,
};

export function maxOrderOpsVersion(versions: OrderOpsVersions): number {
	return Math.max(...ORDER_OPS_DOMAINS.map((domain) => versions[domain]));
}

export function versionsFromLegacyStateVersion(stateVersion: number): OrderOpsVersions {
	const version = stateVersion > 0 ? stateVersion : 0;
	return {
		orders: version,
		inventory: version,
		waitlist: version,
		dayChecklists: version,
		supplyInventory: version,
	};
}

export function resolveSnapshotVersions(snapshot: {
	versions?: OrderOpsVersions;
	stateVersion?: number;
}): OrderOpsVersions {
	if (snapshot.versions) {
		return snapshot.versions;
	}
	return versionsFromLegacyStateVersion(snapshot.stateVersion ?? 0);
}

export function isAnyDomainBehind(
	local: OrderOpsVersions,
	remote: OrderOpsVersions
): boolean {
	return ORDER_OPS_DOMAINS.some((domain) => remote[domain] > local[domain]);
}

export function mergeOrderOpsVersions(
	local: OrderOpsVersions,
	remote: OrderOpsVersions
): OrderOpsVersions {
	return {
		orders: Math.max(local.orders, remote.orders),
		inventory: Math.max(local.inventory, remote.inventory),
		waitlist: Math.max(local.waitlist, remote.waitlist),
		dayChecklists: Math.max(local.dayChecklists, remote.dayChecklists),
		supplyInventory: Math.max(local.supplyInventory, remote.supplyInventory),
	};
}

export type OrderOpsNewOrdersDetail = {
	orderIds: string[];
	count: number;
};

export type OrderOpsMeta = {
	deviceId: string;
	versions: OrderOpsVersions;
	businessDate: string;
	lastUpdatedAt: number;
	/** True after a local write or applying remote state for today */
	initializedForToday?: boolean;
	/** @deprecated Migrated to versions on read */
	stateVersion?: number;
};

export type OrderOpsSnapshot = {
	deviceId: string;
	versions: OrderOpsVersions;
	/** Max domain version — legacy peers compare this field */
	stateVersion: number;
	businessDate: string;
	orders: TOrder[];
	inventory: Record<string, number>;
	/** Archived orders for today, including billed tables */
	orderHistory: TOrder[];
	dayChecklists?: {
		open: Record<string, boolean>;
		close: Record<string, boolean>;
	};
	supplyInventory?: {
		utensils: Record<string, number>;
		tableware: Record<string, number>;
		'raw-materials': Record<string, number>;
	};
	waitlist?: Array<{
		id: string;
		name: string;
		number: string;
		pax?: number;
		checked: boolean;
		createdAt: number;
		checkedAt?: number;
	}>;
	sentAt: number;
};

export type SyncRequestMessage = {
	requesterId: string;
	targetId: string;
	requesterVersions: OrderOpsVersions;
	/** Max domain version — legacy peers */
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
	versions: OrderOpsVersions;
	/** Max domain version — legacy peers */
	stateVersion: number;
	businessDate: string;
	initializedForToday: boolean;
};

export type SyncConflictPeer = {
	clientId: string;
	deviceName: string;
	versions: OrderOpsVersions;
	/** Max domain version — display / legacy */
	stateVersion: number;
	initializedForToday: boolean;
};

export type SyncConflict = {
	businessDate: string;
	localVersions: OrderOpsVersions;
	localInitialized: boolean;
	localDeviceName: string;
	recommendedPeerClientId: string;
	peers: SyncConflictPeer[];
};

export type SyncConflictResolution = 'newest' | 'peer' | 'local';
