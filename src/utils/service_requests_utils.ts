import {
	SERVICE_REQUESTS_KEY,
	ServiceRequest,
	ServiceRequestKind,
	ServiceRequestsStore,
} from '@/src/models/service_requests';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import localforage from 'localforage';

export function generateServiceRequestId(): string {
	return `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getServiceRequestsStore(): Promise<ServiceRequestsStore> {
	const raw = await localforage.getItem<ServiceRequestsStore>(SERVICE_REQUESTS_KEY);
	return raw ?? {};
}

export async function getServiceRequests(
	dateKey = getTodayDateKey()
): Promise<ServiceRequest[]> {
	const store = await getServiceRequestsStore();
	return store[dateKey] ?? [];
}

async function saveServiceRequestsForDate(
	entries: ServiceRequest[],
	dateKey = getTodayDateKey()
): Promise<void> {
	const store = await getServiceRequestsStore();
	store[dateKey] = entries;
	await localforage.setItem(SERVICE_REQUESTS_KEY, store);
	const { notifyOrderOpsChange, isSyncNotifySuppressed } = await import(
		'@/src/utils/order_ops_sync'
	);
	if (!isSyncNotifySuppressed()) {
		await notifyOrderOpsChange('serviceRequests');
	}
}

export async function getServiceRequestsSnapshotForDate(
	dateKey: string
): Promise<ServiceRequest[]> {
	return getServiceRequests(dateKey);
}

export async function applyServiceRequestsSnapshot(
	dateKey: string,
	entries: ServiceRequest[]
): Promise<void> {
	const store = await getServiceRequestsStore();
	store[dateKey] = entries.map((entry) => ({ ...entry }));
	await localforage.setItem(SERVICE_REQUESTS_KEY, store);
}

export function getPendingRequests(
	requests: ServiceRequest[],
	kind?: ServiceRequestKind
): ServiceRequest[] {
	return requests.filter(
		(request) =>
			request.status === 'pending' && (kind == null || request.kind === kind)
	);
}

export function getPendingQtyByTable(
	requests: ServiceRequest[],
	kind: ServiceRequestKind
): Map<number, number> {
	const totals = new Map<number, number>();
	for (const request of getPendingRequests(requests, kind)) {
		totals.set(
			request.tableNumber,
			(totals.get(request.tableNumber) ?? 0) + request.qty
		);
	}
	return totals;
}

export function getPendingCountForKind(
	requests: ServiceRequest[],
	kind: ServiceRequestKind
): number {
	return getPendingRequests(requests, kind).reduce(
		(sum, request) => sum + request.qty,
		0
	);
}

export function getPendingCountsForTables(
	requests: ServiceRequest[],
	tableNumbers: number[]
): Record<ServiceRequestKind, number> {
	const tableSet = new Set(tableNumbers);
	const counts: Record<ServiceRequestKind, number> = {
		rice: 0,
		cutlery: 0,
		water: 0,
	};
	for (const request of getPendingRequests(requests)) {
		if (!tableSet.has(request.tableNumber)) {
			continue;
		}
		counts[request.kind] += request.qty;
	}
	return counts;
}

export async function createServiceRequest(input: {
	kind: ServiceRequestKind;
	tableNumber: number;
	qty: number;
	deviceId?: string;
}): Promise<ServiceRequest[]> {
	if (input.qty <= 0) {
		return getServiceRequests();
	}
	const dateKey = getTodayDateKey();
	const existing = await getServiceRequests(dateKey);
	const next: ServiceRequest = {
		id: generateServiceRequestId(),
		kind: input.kind,
		tableNumber: input.tableNumber,
		qty: input.qty,
		status: 'pending',
		requestedAt: Date.now(),
		requestedByDeviceId: input.deviceId,
	};
	const updated = [...existing, next];
	await saveServiceRequestsForDate(updated, dateKey);
	return updated;
}

export async function markTableKindDone(input: {
	kind: ServiceRequestKind;
	tableNumber: number;
	deviceId?: string;
}): Promise<ServiceRequest[]> {
	const dateKey = getTodayDateKey();
	const existing = await getServiceRequests(dateKey);
	const now = Date.now();
	const updated = existing.map((request) => {
		if (
			request.status !== 'pending' ||
			request.kind !== input.kind ||
			request.tableNumber !== input.tableNumber
		) {
			return request;
		}
		return {
			...request,
			status: 'done' as const,
			doneAt: now,
			doneByDeviceId: input.deviceId,
		};
	});
	await saveServiceRequestsForDate(updated, dateKey);
	return updated;
}
