'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';
import { DeviceNameRequiredModal } from '@/components/feature/order/device-name-required-modal';
import { OrderOpsSyncProvider } from '@/context/order-ops-sync';

export function HomeProviders({ children }: { children: React.ReactNode }) {
	return (
		<OrderOpsSyncProvider>
			<OpsDrawerProvider>
				{children}
				<DeviceNameRequiredModal />
			</OpsDrawerProvider>
		</OrderOpsSyncProvider>
	);
}
