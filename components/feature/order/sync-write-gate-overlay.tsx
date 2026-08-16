'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';

/** Soft banner + fullscreen catch-up / hub-offline notices. */
export function SyncWriteGateOverlay() {
	const { catchUpUi, syncHubOnline, connected, writeGate, kotPrintFailure } =
		useOrderOpsSync();

	const showHubOffline =
		connected && writeGate === 'ready' && !syncHubOnline;

	return (
		<>
			{catchUpUi === 'banner' ? (
				<div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-amber-950 text-center text-sm font-semibold py-2 px-3 shadow">
					Updating… please wait
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

			{showHubOffline ? (
				<div className="fixed top-0 inset-x-0 z-[55] bg-orange-600 text-white text-center text-sm font-semibold py-2 px-3 shadow">
					Sync hub offline — auto KOT paused; print KOT manually
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
