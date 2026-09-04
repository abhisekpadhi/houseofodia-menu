'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import {
	ConfirmModalActions,
	LoadingSpinner,
} from '@/components/ui/touch-controls';
import { useInFlightLock } from '@/src/utils/in_flight';
import { useState } from 'react';

type PublishResult = {
	published_at?: string;
	item_count?: number;
	category_count?: number;
	public_url?: string;
	error?: string;
};

export function WebOrdersPage() {
	const [busy, setBusy] = useState(false);
	const [pendingSync, setPendingSync] = useState(false);
	const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
	const [message, setMessage] = useState('');
	const [lastResult, setLastResult] = useState<PublishResult | null>(null);
	const lock = useInFlightLock();

	const syncMenu = async () => {
		await lock.runLocked(async () => {
			setBusy(true);
			setStatus('idle');
			setMessage('');
			try {
				const response = await fetch('/api/web-orders/menu/sync', {
					method: 'POST',
					cache: 'no-store',
				});
				const data = (await response.json()) as PublishResult;
				if (!response.ok) {
					setStatus('error');
					setMessage(data.error ?? 'Could not sync menu.');
					return;
				}
				setLastResult(data);
				setStatus('success');
				const count =
					typeof data.item_count === 'number' ? data.item_count : null;
				setMessage(
					count != null
						? `Menu synced — ${count} items published.`
						: 'Menu synced.'
				);
			} catch {
				setStatus('error');
				setMessage('Could not sync menu.');
			} finally {
				setBusy(false);
				setPendingSync(false);
			}
		});
	};

	return (
		<OpsPageShell title="Web orders">
			<div className="space-y-4">
				<section className="border border-gray-200 rounded-xl bg-white p-4">
					<h2 className="text-base font-bold text-gray-900">Pending orders</h2>
					<p className="mt-2 text-sm text-gray-600">
						No pending web orders yet. Accept / reject will appear here once
						order.tangify.in is live.
					</p>
				</section>

				<section className="border border-gray-200 rounded-xl bg-white p-4">
					<h2 className="text-base font-bold text-gray-900">
						Web ordering menu
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						Publishes the Google Sheet menu to{' '}
						<span className="font-mono text-xs">files.tangify.in/menu/v1.json</span>{' '}
						for the customer ordering app.
					</p>

					{lastResult?.published_at ? (
						<p className="mt-3 text-xs text-gray-500">
							Last sync: {lastResult.published_at}
							{typeof lastResult.item_count === 'number'
								? ` · ${lastResult.item_count} items`
								: ''}
							{typeof lastResult.category_count === 'number'
								? ` · ${lastResult.category_count} categories`
								: ''}
						</p>
					) : null}

					<button
						type="button"
						disabled={busy}
						onClick={() => setPendingSync(true)}
						className="mt-4 w-full min-h-[44px] inline-flex items-center justify-center rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 active:bg-green-700 disabled:opacity-50 touch-manipulation"
					>
						{busy ? (
							<LoadingSpinner className="h-4 w-4 text-white" />
						) : (
							'Sync menu for web ordering'
						)}
					</button>

					{status === 'success' ? (
						<p className="mt-4 text-sm font-semibold text-green-700">
							{message}
						</p>
					) : null}
					{status === 'error' ? (
						<p className="mt-4 text-sm font-semibold text-red-700">{message}</p>
					) : null}
				</section>
			</div>

			{pendingSync ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => !busy && setPendingSync(false)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">Sync menu for web ordering?</h2>
							<p className="text-sm text-gray-600 mt-2">
								Publish the current Google Sheet menu to order.tangify.in.
								Customers will see updated prices and items within about a
								minute.
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setPendingSync(false)}
							onConfirm={() => void syncMenu()}
							confirmLabel="Sync menu"
							confirming={busy}
							cancelDisabled={busy}
						/>
					</div>
				</div>
			) : null}
		</OpsPageShell>
	);
}
