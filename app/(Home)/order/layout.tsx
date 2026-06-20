'use client';

import { OrderOpsSyncProvider } from '@/context/order-ops-sync';
import { OrderSyncNotificationListener } from '@/components/feature/order/order-sync-notification';
import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';

export default function OrderLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<OrderOpsSyncProvider>
			<OpsDrawerProvider>
				<OrderSyncNotificationListener />
				{children}
			</OpsDrawerProvider>
		</OrderOpsSyncProvider>
	);
}
