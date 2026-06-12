'use client';

import { OrderOpsSyncProvider } from '@/context/order-ops-sync';

export default function OrderLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <OrderOpsSyncProvider>{children}</OrderOpsSyncProvider>;
}
