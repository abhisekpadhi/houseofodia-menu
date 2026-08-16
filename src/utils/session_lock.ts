import { OrderGroup, TOrder } from '@/src/models/common';
import { getOrderGroupKey, groupOrdersByTable } from '@/src/utils/order_utils';

export type SessionLock = {
	deviceId: string;
	deviceName: string;
	updatedAt: number;
};

/** Latest lock fields mirrored on any order in the group. */
export function getGroupSessionLock(group: OrderGroup): SessionLock | null {
	let best: SessionLock | null = null;
	for (const order of group.orders) {
		const deviceId = order.lockHolderDeviceId?.trim();
		if (!deviceId) continue;
		const updatedAt = order.lockUpdatedAt ?? 0;
		if (!best || updatedAt >= best.updatedAt) {
			best = {
				deviceId,
				deviceName: order.lockHolderName?.trim() || 'Another device',
				updatedAt,
			};
		}
	}
	return best;
}

export function isSessionLockedByOther(
	group: OrderGroup,
	deviceId: string
): boolean {
	const lock = getGroupSessionLock(group);
	if (!lock) return false;
	return lock.deviceId !== deviceId;
}

export function canEditSession(group: OrderGroup, deviceId: string): boolean {
	return !isSessionLockedByOther(group, deviceId);
}

export function findOrderGroupForOrder(
	orders: TOrder[],
	orderId: string
): OrderGroup | null {
	return (
		groupOrdersByTable(orders).find((group) =>
			group.orders.some((order) => order.id === orderId)
		) ?? null
	);
}

export function findOrderGroupByKey(
	orders: TOrder[],
	groupKey: string
): OrderGroup | null {
	return groupOrdersByTable(orders).find((group) => group.key === groupKey) ?? null;
}

export function claimGroupSessionLock(
	orders: TOrder[],
	group: OrderGroup,
	deviceId: string,
	deviceName: string,
	now = Date.now()
): TOrder[] {
	const orderIds = new Set(group.orders.map((order) => order.id));
	const name = deviceName.trim() || 'This device';
	return orders.map((order) => {
		if (!orderIds.has(order.id)) {
			return order;
		}
		return {
			...order,
			lockHolderDeviceId: deviceId,
			lockHolderName: name,
			lockUpdatedAt: now,
		};
	});
}

/** Claim lock on every order sharing this order's session group. */
export function claimSessionLockForOrder(
	orders: TOrder[],
	orderId: string,
	deviceId: string,
	deviceName: string,
	now = Date.now()
): TOrder[] {
	const group = findOrderGroupForOrder(orders, orderId);
	if (!group) {
		const name = deviceName.trim() || 'This device';
		return orders.map((order) =>
			order.id === orderId
				? {
						...order,
						lockHolderDeviceId: deviceId,
						lockHolderName: name,
						lockUpdatedAt: now,
					}
				: order
		);
	}
	return claimGroupSessionLock(orders, group, deviceId, deviceName, now);
}

export function sessionLockFieldsFromGroup(
	group: OrderGroup | null
): Pick<TOrder, 'lockHolderDeviceId' | 'lockHolderName' | 'lockUpdatedAt'> {
	if (!group) return {};
	const lock = getGroupSessionLock(group);
	if (!lock) return {};
	return {
		lockHolderDeviceId: lock.deviceId,
		lockHolderName: lock.deviceName,
		lockUpdatedAt: lock.updatedAt,
	};
}

export function sessionLockFieldsFromOrders(
	orders: TOrder[],
	groupKey: string
): Pick<TOrder, 'lockHolderDeviceId' | 'lockHolderName' | 'lockUpdatedAt'> {
	const match = orders.find((order) => getOrderGroupKey(order) === groupKey);
	if (!match?.lockHolderDeviceId) return {};
	return {
		lockHolderDeviceId: match.lockHolderDeviceId,
		...(match.lockHolderName ? { lockHolderName: match.lockHolderName } : {}),
		...(match.lockUpdatedAt != null ? { lockUpdatedAt: match.lockUpdatedAt } : {}),
	};
}
