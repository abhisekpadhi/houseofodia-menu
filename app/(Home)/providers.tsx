'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';
import { OrderSyncNotificationListener } from '@/components/feature/order/order-sync-notification';
import { OrderOpsSyncProvider } from '@/context/order-ops-sync';

export function HomeProviders({ children }: { children: React.ReactNode }) {
	return (
		<OrderOpsSyncProvider>
			<OrderSyncNotificationListener />
			<OpsDrawerProvider>{children}</OpsDrawerProvider>
		</OrderOpsSyncProvider>
	);
}
