'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';
import { isKotPrinterOnline } from '@/src/utils/print_servers';
import { LoadingSpinner } from '@/components/ui/touch-controls';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInFlightLock } from '@/src/utils/in_flight';

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
		connectionState,
		writeGate,
		kotPrintFailure,
		memberDeviceNames,
		connect,
	} = useOrderOpsSync();
	const topBannerRef = useRef<HTMLDivElement>(null);
	const [browserOnline, setBrowserOnline] = useState(() =>
		typeof navigator === 'undefined' ? true : navigator.onLine
	);
	const [checkingStatus, setCheckingStatus] = useState(false);
	const checkLock = useInFlightLock();

	useEffect(() => {
		const updateOnline = () => setBrowserOnline(navigator.onLine);
		updateOnline();
		window.addEventListener('online', updateOnline);
		window.addEventListener('offline', updateOnline);
		return () => {
			window.removeEventListener('online', updateOnline);
			window.removeEventListener('offline', updateOnline);
		};
	}, []);

	const isOffline = !browserOnline || connectionState !== 'connected';
	const checking =
		checkingStatus || connectionState === 'connecting';

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

	const handleCheckStatus = async () => {
		if (!checkLock.tryLock()) {
			return;
		}
		setCheckingStatus(true);
		setBrowserOnline(navigator.onLine);
		try {
			if (navigator.onLine && connectionState !== 'connected') {
				await connect();
			}
		} catch {
			// Connection error stays on the overlay until websocket is up.
		} finally {
			setCheckingStatus(false);
			checkLock.unlock();
		}
	};

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

			{!isOffline && catchUpUi === 'fullscreen' ? (
				<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-6">
					<div className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-xl">
						<div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-black animate-spin" />
						<p className="text-lg font-bold text-gray-900">
							Catching up... please be patient.
						</p>
					</div>
				</div>
			) : null}

			{isOffline ? (
				<div
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-6"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="ops-offline-title"
				>
					<div className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-xl">
						<h2
							id="ops-offline-title"
							className="text-lg font-bold text-gray-900"
						>
							You are offline, get online to continue
						</h2>
						<button
							type="button"
							onClick={() => void handleCheckStatus()}
							disabled={checking}
							className="mt-6 w-full min-h-[48px] inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-60"
						>
							{checking ? (
								<LoadingSpinner className="h-4 w-4 text-white" />
							) : (
								'Check status'
							)}
						</button>
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
