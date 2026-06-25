'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';
import { maxOrderOpsVersion } from '@/src/models/order_ops';
import { formatStateVersionDisplay } from '@/src/utils/format_state_version';
import { useEffect, useState } from 'react';

type ModalMode = 'connect' | 'status' | 'conflict' | null;

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
	const [nameDraft, setNameDraft] = useState('');
	const [savingName, setSavingName] = useState(false);
	const [resolvingConflict, setResolvingConflict] = useState(false);
	const [keepLocalConfirm, setKeepLocalConfirm] = useState(false);

	useEffect(() => {
		if (sync.connected && modal === 'connect') {
			setModal(null);
			setConnecting(false);
		}
	}, [sync.connected, modal]);

	useEffect(() => {
		if (sync.syncConflict) {
			setModal('conflict');
			setKeepLocalConfirm(false);
		}
	}, [sync.syncConflict]);

	useEffect(() => {
		if (modal === 'status') {
			setNameDraft(sync.deviceName);
		}
	}, [modal, sync.deviceName]);

	const handleDotClick = () => {
		if (sync.syncConflict) {
			setModal('conflict');
			return;
		}
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

	const handleSaveName = async () => {
		setSavingName(true);
		try {
			await sync.updateDeviceName(nameDraft);
		} finally {
			setSavingName(false);
		}
	};

	const handleResolveConflict = async (
		resolution: 'newest' | 'peer' | 'local',
		peerClientId?: string
	) => {
		setResolvingConflict(true);
		try {
			await sync.resolveSyncConflict(resolution, peerClientId);
			setModal(null);
			setKeepLocalConfirm(false);
		} finally {
			setResolvingConflict(false);
		}
	};

	const dotColor = sync.connected
		? sync.syncConflict
			? 'bg-amber-500'
			: 'bg-green-500'
		: sync.connectionState === 'connecting'
			? 'bg-amber-400 animate-pulse'
			: 'bg-red-500';
	const ariaLabel = sync.syncConflict
		? 'Sync conflict — choose data source'
		: sync.connected
			? 'Sync connected — view status'
			: sync.connectionState === 'connecting'
				? 'Sync connecting'
				: 'Sync disconnected — retry connection';

	const recommendedPeer = sync.syncConflict?.peers.find(
		(peer) => peer.clientId === sync.syncConflict?.recommendedPeerClientId
	);

	return (
		<>
			<button
				type="button"
				onClick={handleDotClick}
				className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 touch-manipulation shrink-0"
				aria-label={ariaLabel}
				aria-busy={sync.syncing}
			>
				{sync.syncing ? (
					<SyncSpinner className="w-5 h-5" />
				) : (
					<span
						className={`w-3 h-3 rounded-full ${dotColor} ring-2 ring-white shadow-sm`}
					/>
				)}
			</button>
			{sync.syncing ? <span className="sr-only">Syncing</span> : null}

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
							<span
								className={`w-3 h-3 rounded-full shrink-0 ${sync.syncConflict ? 'bg-amber-500' : 'bg-green-500'}`}
							/>
							<h2 className="text-lg font-bold">Sync connected</h2>
						</div>

						<div className="mb-4">
							<label
								htmlFor="device-name"
								className="block text-xs font-medium text-gray-600 mb-1"
							>
								Device name
							</label>
							<div className="flex gap-2">
								<input
									id="device-name"
									type="text"
									value={nameDraft}
									onChange={(event) => setNameDraft(event.target.value)}
									placeholder="e.g. Kitchen iPad"
									className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
								/>
								<button
									type="button"
									onClick={() => void handleSaveName()}
									disabled={savingName}
									className="px-3 py-2 rounded-lg text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-50"
								>
									{savingName ? '…' : 'Save'}
								</button>
							</div>
							<p className="text-xs text-gray-500 mt-1">
								ID: {sync.deviceId || '—'}
							</p>
						</div>

						<div className="rounded-lg bg-gray-50 px-3 mb-4">
							<SyncStatusRow
								label="Status"
								value={connectionLabel(sync.connectionState)}
							/>
							<SyncStatusRow label="Channel" value={sync.channelName} />
							<SyncStatusRow label="Clients online" value={sync.memberCount} />
							<SyncStatusRow
								label="Last updated"
								value={formatStateVersionDisplay(sync.stateVersion)}
							/>
							<SyncStatusRow
								label="Business date"
								value={sync.businessDate ?? '—'}
							/>
						</div>

						{sync.syncConflict && (
							<button
								type="button"
								onClick={() => setModal('conflict')}
								className="w-full mb-3 py-2.5 rounded-lg text-sm font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200"
							>
								Resolve sync conflict
							</button>
						)}

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

			{modal === 'conflict' && sync.syncConflict && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => {
						if (!resolvingConflict) {
							setModal(null);
						}
					}}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 max-h-[85vh] overflow-y-auto"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className="text-lg font-bold mb-2">Sync conflict</h2>
						<p className="text-sm text-gray-600 mb-4">
							Another device has different data for today. Choose which copy to
							use before syncing continues.
						</p>

						<div className="rounded-lg bg-gray-50 px-3 mb-4 text-sm">
							<p className="py-2 border-b border-gray-100">
								<span className="text-gray-500">This device</span>
								<span className="float-right font-medium text-right max-w-[55%]">
									{sync.syncConflict.localDeviceName}
									<span className="block text-xs font-normal text-gray-500 mt-0.5">
										{formatStateVersionDisplay(
											maxOrderOpsVersion(sync.syncConflict.localVersions)
										)}
									</span>
								</span>
							</p>
							{sync.syncConflict.peers.map((peer) => (
								<p
									key={peer.clientId}
									className="py-2 border-b border-gray-100 last:border-0"
								>
									<span className="text-gray-500">Online</span>
									<span className="float-right font-medium text-right max-w-[55%]">
										{peer.deviceName}
										<span className="block text-xs font-normal text-gray-500 mt-0.5">
											{formatStateVersionDisplay(peer.stateVersion)}
										</span>
									</span>
								</p>
							))}
						</div>

						<div className="space-y-2">
							<button
								type="button"
								disabled={resolvingConflict}
								onClick={() => void handleResolveConflict('newest')}
								className="w-full py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-left px-4"
							>
								Use newest changes (recommended)
								{recommendedPeer ? (
									<span className="block text-xs font-normal text-green-100 mt-0.5">
										Sync from {recommendedPeer.deviceName}
									</span>
								) : null}
							</button>

							{sync.syncConflict.peers.map((peer) => (
								<button
									key={peer.clientId}
									type="button"
									disabled={resolvingConflict}
									onClick={() =>
										void handleResolveConflict('peer', peer.clientId)
									}
									className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 text-left px-4"
								>
									Sync from {peer.deviceName}
									<span className="block text-xs font-normal text-gray-500 mt-0.5">
										{formatStateVersionDisplay(peer.stateVersion)}
									</span>
								</button>
							))}

							{!keepLocalConfirm ? (
								<button
									type="button"
									disabled={resolvingConflict}
									onClick={() => setKeepLocalConfirm(true)}
									className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
								>
									Keep this device&apos;s data
								</button>
							) : (
								<div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
									<p className="text-xs text-red-800">
										This will replace orders and inventory on other devices
										with this device&apos;s copy.
									</p>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => setKeepLocalConfirm(false)}
											className="flex-1 py-2 rounded-lg text-sm font-semibold bg-white text-gray-700 border border-gray-200"
										>
											Cancel
										</button>
										<button
											type="button"
											disabled={resolvingConflict}
											onClick={() => void handleResolveConflict('local')}
											className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
										>
											Confirm
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
}
