'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import {
	ConfirmModalActions,
	TouchActionButton,
} from '@/components/ui/touch-controls';
import {
	generateWaitlistId,
	getTodayDateKey,
	getWaitlistEntries,
	saveWaitlistEntries,
	shareWaitlistAsExcel,
	sortWaitlistEntries,
	type WaitlistEntry,
} from '@/src/utils/waitlist_utils';
import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import {
	CUSTOMER_PHONE_DIGITS,
	isValidCustomerPhone,
} from '@/src/utils/order_utils';
import { useCallback, useEffect, useMemo, useState } from 'react';

function PhoneIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden
		>
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
		</svg>
	);
}

function formatTodayLabel(dateKey: string): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	return date.toLocaleDateString('en-IN', {
		weekday: 'long',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

export function WaitlistPage() {
	const dateKey = getTodayDateKey();
	const [entries, setEntries] = useState<WaitlistEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [sharing, setSharing] = useState(false);
	const [name, setName] = useState('');
	const [phone, setPhone] = useState('');
	const [adding, setAdding] = useState(false);
	const [pendingCheckId, setPendingCheckId] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);

	const pendingCheckEntry = useMemo(
		() => entries.find((entry) => entry.id === pendingCheckId) ?? null,
		[entries, pendingCheckId]
	);

	const sortedEntries = useMemo(() => sortWaitlistEntries(entries), [entries]);
	const waitingCount = useMemo(
		() => entries.filter((entry) => !entry.checked).length,
		[entries]
	);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			setEntries(await getWaitlistEntries(dateKey));
		} finally {
			setLoading(false);
		}
	}, [dateKey]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const onOrderOpsUpdated = () => {
			void load();
		};
		window.addEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
		return () => window.removeEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
	}, [load]);

	const persist = async (next: WaitlistEntry[]) => {
		const sorted = sortWaitlistEntries(next);
		setEntries(sorted);
		await saveWaitlistEntries(sorted, dateKey);
	};

	const markSeated = async (id: string) => {
		const next = entries.map((entry) => {
			if (entry.id !== id) {
				return entry;
			}
			return {
				...entry,
				checked: true,
				checkedAt: Date.now(),
			};
		});
		await persist(next);
	};

	const unmarkSeated = async (id: string) => {
		const next = entries.map((entry) => {
			if (entry.id !== id) {
				return entry;
			}
			return {
				...entry,
				checked: false,
				checkedAt: undefined,
			};
		});
		await persist(next);
	};

	const handleEntryPress = (entry: WaitlistEntry) => {
		if (entry.checked) {
			void unmarkSeated(entry.id);
			return;
		}
		setPendingCheckId(entry.id);
	};

	const confirmMarkSeated = async () => {
		if (!pendingCheckId) {
			return;
		}
		setChecking(true);
		try {
			await markSeated(pendingCheckId);
			setPendingCheckId(null);
		} finally {
			setChecking(false);
		}
	};

	const handleAdd = async () => {
		const trimmedName = name.trim();
		const trimmedPhone = phone.trim();
		if (!trimmedName || !trimmedPhone) {
			alert('Enter name and phone number.');
			return;
		}
		if (!isValidCustomerPhone(trimmedPhone)) {
			alert('Enter a valid 10-digit phone number.');
			return;
		}

		setAdding(true);
		try {
			const next: WaitlistEntry[] = [
				...entries,
				{
					id: generateWaitlistId(),
					name: trimmedName,
					number: trimmedPhone,
					checked: false,
					createdAt: Date.now(),
				},
			];
			await persist(next);
			setName('');
			setPhone('');
		} finally {
			setAdding(false);
		}
	};

	const handleShare = async () => {
		setSharing(true);
		try {
			await shareWaitlistAsExcel(entries, dateKey);
		} catch (error) {
			console.error('Failed to share waitlist:', error);
			alert('Failed to share waiting list.');
		} finally {
			setSharing(false);
		}
	};

	return (
		<OpsPageShell
			title="Waiting list"
			trailing={
				<TouchActionButton
					onClick={() => void handleShare()}
					disabled={sharing || entries.length === 0}
					className="bg-gray-100 text-gray-800 border border-gray-300 min-h-[36px] px-3 text-xs"
				>
					{sharing ? 'Sharing…' : 'Share Excel'}
				</TouchActionButton>
			}
			headerExtra={
				<div className="pb-3 px-1">
					<p className="text-xs font-medium text-gray-600">Today</p>
					<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
					<p className="text-xs text-gray-500 mt-2">
						{waitingCount} waiting · {entries.length} total
					</p>
				</div>
			}
		>
			<div className="border border-gray-200 rounded-xl bg-white p-4 mb-4">
				<p className="text-xs font-semibold text-gray-500 mb-3">Add to list</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
					<div>
						<label
							htmlFor="waitlist-name"
							className="block text-xs text-gray-500 mb-1"
						>
							Name
						</label>
						<input
							id="waitlist-name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Guest name"
							className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label
							htmlFor="waitlist-phone"
							className="block text-xs text-gray-500 mb-1"
						>
							Phone
						</label>
						<input
							id="waitlist-phone"
							type="tel"
							inputMode="numeric"
							value={phone}
							onChange={(e) =>
								setPhone(
									e.target.value
										.replace(/\D/g, '')
										.slice(0, CUSTOMER_PHONE_DIGITS)
								)
							}
							placeholder="10-digit phone"
							autoComplete="tel"
							maxLength={CUSTOMER_PHONE_DIGITS}
							className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
						/>
					</div>
				</div>
				<button
					type="button"
					disabled={adding}
					onClick={() => void handleAdd()}
					className="w-full min-h-[44px] rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 active:bg-green-700 disabled:opacity-50 touch-manipulation"
				>
					{adding ? 'Adding…' : 'Add to waiting list'}
				</button>
			</div>

			{loading ? (
				<p className="text-center py-12 text-sm text-gray-500">Loading…</p>
			) : sortedEntries.length === 0 ? (
				<p className="text-center py-12 text-sm text-gray-500">
					No one on the waiting list yet.
				</p>
			) : (
				<ul className="space-y-2 pb-8">
					{sortedEntries.map((entry, index) => {
						const canCall = isValidCustomerPhone(entry.number);
						return (
							<li
								key={entry.id}
								className={`flex items-stretch gap-2 border rounded-lg overflow-hidden ${
									entry.checked
										? 'border-gray-200 bg-gray-50'
										: 'border-gray-200 bg-white'
								}`}
							>
								<button
									type="button"
									onClick={() => handleEntryPress(entry)}
									className={`min-w-0 flex-1 flex items-center gap-3 px-4 py-3 text-left touch-manipulation transition-colors ${
										entry.checked ? '' : 'active:bg-gray-50'
									}`}
									aria-pressed={entry.checked}
								>
									<span
										className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
											entry.checked
												? 'bg-green-600 border-green-600 text-white'
												: 'border-gray-300 text-transparent'
										}`}
									>
										✓
									</span>
									<span className="text-xs font-bold text-gray-400 w-5 shrink-0">
										{index + 1}
									</span>
									<span className="min-w-0 flex-1">
										<span
											className={`block text-sm font-semibold ${
												entry.checked
													? 'line-through text-gray-400'
													: 'text-gray-900'
											}`}
										>
											{entry.name}
										</span>
										<span
											className={`block text-xs mt-0.5 ${
												entry.checked
													? 'line-through text-gray-400'
													: 'text-gray-600'
											}`}
										>
											{entry.number}
										</span>
									</span>
								</button>
								{canCall ? (
									<a
										href={`tel:${entry.number}`}
										className="inline-flex shrink-0 items-center justify-center px-3 text-green-700 bg-green-50 hover:bg-green-100 active:bg-green-200 touch-manipulation border-l border-gray-200"
										aria-label={`Call ${entry.number}`}
									>
										<PhoneIcon className="w-4 h-4 shrink-0" />
									</a>
								) : null}
							</li>
						);
					})}
				</ul>
			)}

			{pendingCheckEntry ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => !checking && setPendingCheckId(null)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">Mark as seated?</h2>
							<p className="text-sm text-gray-600 mt-2">
								<span className="font-semibold text-gray-800">
									{pendingCheckEntry.name}
								</span>
								{pendingCheckEntry.number ? (
									<>
										{' '}
										· {pendingCheckEntry.number}
									</>
								) : null}{' '}
								will be moved to the bottom of the list.
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setPendingCheckId(null)}
							onConfirm={() => void confirmMarkSeated()}
							confirmLabel="Mark seated"
							confirming={checking}
							cancelDisabled={checking}
						/>
					</div>
				</div>
			) : null}
		</OpsPageShell>
	);
}
