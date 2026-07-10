export const SERVICE_REQUESTS_KEY = 'serviceRequests';

export type ServiceRequestKind = 'rice' | 'cutlery' | 'water';

export type ServiceRequestStatus = 'pending' | 'done';

export type ServiceRequest = {
	id: string;
	kind: ServiceRequestKind;
	tableNumber: number;
	qty: number;
	status: ServiceRequestStatus;
	requestedAt: number;
	requestedByDeviceId?: string;
	doneAt?: number;
	doneByDeviceId?: string;
};

export type ServiceRequestsStore = Record<string, ServiceRequest[]>;

export const SERVICE_REQUEST_KIND_LABELS: Record<ServiceRequestKind, string> = {
	rice: 'Extra rice',
	cutlery: 'Cutlery',
	water: 'Water',
};

export const SERVICE_REQUEST_KIND_EMOJI: Record<ServiceRequestKind, string> = {
	rice: '🪣',
	cutlery: '🍴',
	water: '💧',
};

/** @deprecated Use SERVICE_REQUEST_KIND_EMOJI */
export const SERVICE_REQUEST_KIND_SHORT = SERVICE_REQUEST_KIND_EMOJI;
