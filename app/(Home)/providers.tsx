'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';
import { DeviceNameRequiredModal } from '@/components/feature/order/device-name-required-modal';
import { SyncWriteGateOverlay } from '@/components/feature/order/sync-write-gate-overlay';
import { OrderOpsSyncProvider } from '@/context/order-ops-sync';

export function HomeProviders({ children }: { children: React.ReactNode }) {
	return (
		<OrderOpsSyncProvider>
			<OpsDrawerProvider>
				{children}
				<DeviceNameRequiredModal />
				<SyncWriteGateOverlay />
			</OpsDrawerProvider>
		</OrderOpsSyncProvider>
	);
}
