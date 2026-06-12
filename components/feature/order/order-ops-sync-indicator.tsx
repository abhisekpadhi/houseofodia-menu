'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';
import { useEffect, useState } from 'react';

type ModalMode = 'connect' | 'status' | null;

function SyncStatusRow({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
			<span className="text-sm text-gray-500 shrink-0">{label}</span>
			<span className="text-sm font-medium text-right break-all">{value}</span>
		</div>
	);
}

function connectionLabel(
	state: ReturnType<typeof useOrderOpsSync>['connectionState']
): string {
	switch (state) {
		case 'connected':
			return 'Connected';
		case 'connecting':
			return 'Connecting…';
		case 'failed':
			return 'Failed';
		default:
			return 'Disconnected';
	}
}

function SyncSpinner({ className }: { className?: string }) {
	return (
		<span
			className={`inline-block rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin ${className ?? 'w-4 h-4'}`}
			aria-hidden
		/>
	);
}

export function OrderOpsSyncIndicator() {
	const sync = useOrderOpsSync();
	const [modal, setModal] = useState<ModalMode>(null);
	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		if (sync.connected && modal === 'connect') {
			setModal(null);
			setConnecting(false);
		}
	}, [sync.connected, modal]);

	const handleDotClick = () => {
		if (sync.connected) {
			setModal('status');
			return;
		}
		setModal('connect');
	};

	const handleConnect = async () => {
		setConnecting(true);
		try {
			await sync.connect();
		} catch {
			// Error state is surfaced via sync.error
		} finally {
			setConnecting(false);
		}
	};

	const dotColor = sync.connected
		? 'bg-green-500'
		: sync.connectionState === 'connecting'
			? 'bg-amber-400 animate-pulse'
			: 'bg-red-500';
	const ariaLabel = sync.connected
		? 'Sync connected — view status'
		: sync.connectionState === 'connecting'
			? 'Sync connecting'
			: 'Sync disconnected — retry connection';

	return (
		<>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={handleDotClick}
					className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
					aria-label={ariaLabel}
				>
					<span
						className={`w-3 h-3 rounded-full ${dotColor} ring-2 ring-white shadow-sm`}
					/>
				</button>
				{sync.syncing ? (
					<span className="sr-only">Syncing</span>
				) : null}
				{sync.syncing ? <SyncSpinner /> : null}
			</div>

			{modal === 'connect' && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => {
						if (!connecting) {
							setModal(null);
						}
					}}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className="text-lg font-bold mb-2">Sync not connected</h2>
						<p className="text-sm text-gray-600 mb-4">
							Connect to the <span className="font-medium">{sync.channelName}</span>{' '}
							channel to sync orders and inventory across devices on this network.
						</p>

						{sync.error && (
							<p className="text-sm text-red-600 mb-4 rounded-lg bg-red-50 px-3 py-2">
								{sync.error}
							</p>
						)}

						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setModal(null)}
								disabled={connecting}
								className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => void handleConnect()}
								disabled={connecting || sync.connectionState === 'connecting'}
								className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
							>
								{connecting || sync.connectionState === 'connecting'
									? 'Connecting…'
									: 'Connect channel'}
							</button>
						</div>
					</div>
				</div>
			)}

			{modal === 'status' && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => setModal(null)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-center gap-3 mb-4">
							<span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
							<h2 className="text-lg font-bold">Sync connected</h2>
						</div>

						<div className="rounded-lg bg-gray-50 px-3 mb-4">
							<SyncStatusRow
								label="Status"
								value={connectionLabel(sync.connectionState)}
							/>
							<SyncStatusRow label="Channel" value={sync.channelName} />
							<SyncStatusRow label="Device" value={sync.deviceId || '—'} />
							<SyncStatusRow label="Clients online" value={sync.memberCount} />
							<SyncStatusRow
								label="State version"
								value={sync.stateVersion ?? '—'}
							/>
							<SyncStatusRow
								label="Business date"
								value={sync.businessDate ?? '—'}
							/>
						</div>

						<p className="text-xs text-gray-500 mb-4">
							Changes to orders and today&apos;s inventory sync automatically when
							more than one client is connected.
						</p>

						<button
							type="button"
							onClick={() => setModal(null)}
							className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
						>
							Close
						</button>
					</div>
				</div>
			)}
		</>
	);
}
