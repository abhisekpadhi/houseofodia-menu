'use client';

import { useOrderOpsSync } from '@/context/order-ops-sync';
import { hasDeviceDisplayName } from '@/src/utils/order_ops_meta';
import { useEffect, useState } from 'react';

export function DeviceNameRequiredModal() {
	const sync = useOrderOpsSync();
	const [needsName, setNeedsName] = useState(false);
	const [draft, setDraft] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setNeedsName(!hasDeviceDisplayName());
	}, [sync.deviceName]);

	if (!needsName) {
		return null;
	}

	const trimmed = draft.trim();
	const canSave = trimmed.length > 0 && !saving;

	const handleSave = async () => {
		if (!trimmed) {
			setError('Device name is required.');
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await sync.updateDeviceName(trimmed);
			setNeedsName(!hasDeviceDisplayName());
			setDraft('');
		} catch {
			setError('Could not save device name. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="device-name-required-title"
			onClick={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5">
				<h2
					id="device-name-required-title"
					className="text-lg font-bold text-gray-900"
				>
					Name this device
				</h2>
				<p className="mt-2 text-sm text-gray-600">
					A device name is required so other devices can identify this one on
					the sync channel.
				</p>
				<label
					htmlFor="required-device-name"
					className="block text-xs font-medium text-gray-600 mt-4 mb-1"
				>
					Device name
				</label>
				<input
					id="required-device-name"
					type="text"
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value);
						if (error) {
							setError(null);
						}
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && canSave) {
							event.preventDefault();
							void handleSave();
						}
					}}
					placeholder="e.g. Kitchen iPad"
					autoFocus
					autoComplete="off"
					className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base"
				/>
				{error ? (
					<p className="mt-2 text-sm text-red-600">{error}</p>
				) : null}
				<button
					type="button"
					disabled={!canSave}
					onClick={() => void handleSave()}
					className="mt-4 w-full min-h-[48px] rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-50"
				>
					{saving ? 'Saving…' : 'Save device name'}
				</button>
			</div>
		</div>
	);
}
