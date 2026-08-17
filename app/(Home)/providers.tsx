'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';
import { DeviceNameRequiredModal } from '@/components/feature/order/device-name-required-modal';
import { SyncWriteGateOverlay } from '@/components/feature/order/sync-write-gate-overlay';
import { OrderOpsSyncProvider } from '@/context/order-ops-sync';
import { usePathname } from 'next/navigation';

function isPublicPage(pathname: string) {
	return pathname === '/' || pathname === '/rate' || pathname.startsWith('/rate/');
}

export function HomeProviders({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	if (isPublicPage(pathname)) {
		return children;
	}

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
