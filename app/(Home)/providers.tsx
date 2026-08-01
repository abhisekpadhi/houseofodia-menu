'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';
import { OrderOpsSyncProvider } from '@/context/order-ops-sync';

export function HomeProviders({ children }: { children: React.ReactNode }) {
	return (
		<OrderOpsSyncProvider>
			<OpsDrawerProvider>{children}</OpsDrawerProvider>
		</OrderOpsSyncProvider>
	);
}
