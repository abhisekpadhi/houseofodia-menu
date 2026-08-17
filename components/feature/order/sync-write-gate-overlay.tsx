'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';
import { isKotPrinterOnline } from '@/src/utils/print_servers';
import { useLayoutEffect, useRef } from 'react';

function offlineServicesBanner(
	hubOnline: boolean,
	kotPrinterOnline: boolean
): string | null {
	if (hubOnline && kotPrinterOnline) {
		return null;
	}
	if (!hubOnline && !kotPrinterOnline) {
		return 'Sync hub and KOT printer offline — auto KOT paused; print KOT manually';
	}
	if (!hubOnline) {
		return 'Sync hub offline — auto KOT paused; print KOT manually';
	}
	return 'KOT printer offline — auto KOT paused; print KOT manually';
}

/** Soft banner + fullscreen catch-up / hub-offline notices. */
export function SyncWriteGateOverlay() {
	const {
		catchUpUi,
		syncHubOnline,
		connected,
		writeGate,
		kotPrintFailure,
		memberDeviceNames,
	} = useOrderOpsSync();
	const topBannerRef = useRef<HTMLDivElement>(null);

	const kotPrinterOnline = isKotPrinterOnline(memberDeviceNames);
	const offlineBanner =
		connected && writeGate === 'ready'
			? offlineServicesBanner(syncHubOnline, kotPrinterOnline)
			: null;
	const showCatchUpBanner = catchUpUi === 'banner';
	const showTopBanner = showCatchUpBanner || Boolean(offlineBanner);

	useLayoutEffect(() => {
		const root = document.documentElement;
		const applyHeight = (height: number) => {
			root.style.setProperty('--ops-top-banner-height', `${Math.max(0, height)}px`);
		};

		if (!showTopBanner) {
			applyHeight(0);
			return;
		}

		const el = topBannerRef.current;
		if (!el) {
			applyHeight(0);
			return;
		}

		const update = () => applyHeight(el.getBoundingClientRect().height);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => {
			observer.disconnect();
			applyHeight(0);
		};
	}, [showTopBanner, showCatchUpBanner, offlineBanner]);

	return (
		<>
			{showCatchUpBanner ? (
				<div
					ref={topBannerRef}
					className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-amber-950 text-center text-sm font-semibold px-3 pb-2 shadow pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
				>
					Updating… please wait
				</div>
			) : offlineBanner ? (
				<div
					ref={topBannerRef}
					className="fixed top-0 inset-x-0 z-[55] bg-orange-600 text-white text-center text-sm font-semibold px-3 pb-2 shadow pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
				>
					{offlineBanner}
				</div>
			) : null}

			{catchUpUi === 'fullscreen' ? (
				<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-6">
					<div className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-xl">
						<div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-black animate-spin" />
						<p className="text-lg font-bold text-gray-900">
							Catching up... please be patient.
						</p>
					</div>
				</div>
			) : null}

			{kotPrintFailure ? (
				<div className="fixed bottom-0 inset-x-0 z-[65] bg-red-600 text-white text-center text-sm font-semibold py-3 px-3 shadow pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
					{kotPrintFailure}
				</div>
			) : null}
		</>
	);
}
