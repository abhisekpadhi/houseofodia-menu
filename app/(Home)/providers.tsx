'use client';

import { OpsDrawerProvider } from '@/components/feature/layout/ops-drawer';

export function HomeProviders({ children }: { children: React.ReactNode }) {
	return <OpsDrawerProvider>{children}</OpsDrawerProvider>;
}
