'use client';

import { toast } from '@/components/ui/use-toast';
import { consumeBillSyncRedirectNotice } from '@/src/utils/bill_sync_redirect_notice';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** One-shot toast after /bill redirects to /order during sync catch-up. */
export function BillSyncRedirectToast() {
	const pathname = usePathname();
	const shownRef = useRef(false);

	useEffect(() => {
		if (shownRef.current || pathname !== '/order') {
			return;
		}
		if (!consumeBillSyncRedirectNotice()) {
			return;
		}
		shownRef.current = true;
		toast({
			title: 'Billing paused while syncing',
			description:
				'We moved you back to Orders so the bill stays accurate. Tap Bill again when updating finishes.',
			duration: 8000,
		});
	}, [pathname]);

	return null;
}
