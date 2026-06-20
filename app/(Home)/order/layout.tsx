'use client';

import { OrderOpsSyncProvider } from '@/context/order-ops-sync';
import { OrderSyncNotificationListener } from '@/components/feature/order/order-sync-notification';

export default function OrderLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<OrderOpsSyncProvider>
			<OrderSyncNotificationListener />
			{children}
		</OrderOpsSyncProvider>
	);
}
