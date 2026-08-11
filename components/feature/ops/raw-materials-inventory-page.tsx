'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import { LoadingSpinner } from '@/components/ui/touch-controls';
import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import {
	getSupplyInventoryForDate,
	getTodayDateKey,
	hasSupplyInventoryForDate,
	saveSupplyInventoryForDate,
} from '@/src/utils/supply_inventory_utils';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';

type RawMaterialItem = {
	category: string;
	name: string;
};

function ShareIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden
		>
			<path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
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

function parseQty(value: string | undefined): number {
	const raw = value?.trim() ?? '';
	if (raw === '') {
		return 0;
	}
	const parsed = parseInt(raw, 10);
	return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function escapeCsvCell(value: string | number): string {
	const text = String(value);
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function buildRawMaterialsCsv(
	items: RawMaterialItem[],
	quantities: Record<string, number>,
	dateKey: string
): string {
	const rows = [
		['Date', 'Category', 'Item', 'Qty'].map(escapeCsvCell).join(','),
		...items.map((item) =>
			[
				dateKey,
				item.category,
				item.name,
				quantities[item.name] ?? 0,
			]
				.map(escapeCsvCell)
				.join(',')
		),
	];
	return `\uFEFF${rows.join('\n')}`;
}

async function shareRawMaterialsCsv(
	items: RawMaterialItem[],
	quantities: Record<string, number>,
	dateKey: string
): Promise<void> {
	const csv = buildRawMaterialsCsv(items, quantities, dateKey);
	const filename = `raw-materials-${dateKey}.csv`;
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const file = new File([blob], filename, { type: 'text/csv' });

	if (
		typeof navigator !== 'undefined' &&
		'share' in navigator &&
		(typeof navigator.canShare !== 'function' ||
			navigator.canShare({ files: [file] }))
	) {
		await navigator.share({
			files: [file],
			title: `Raw materials ${dateKey}`,
		});
		return;
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function RawMaterialsInventoryPage() {
	const dateKey = getTodayDateKey();
	const [items, setItems] = useState<RawMaterialItem[]>([]);
	const [quantities, setQuantities] = useState<Record<string, string>>({});
	const [savedQuantities, setSavedQuantities] = useState<
		Record<string, number>
	>({});
	const [hasSavedToday, setHasSavedToday] = useState(false);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [keyboardInset, setKeyboardInset] = useState(0);

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) {
			return;
		}

		const updateKeyboardInset = () => {
			const inset = Math.max(
				0,
				window.innerHeight - viewport.height - viewport.offsetTop
			);
			setKeyboardInset(inset > 80 ? inset : 0);
		};

		updateKeyboardInset();
		viewport.addEventListener('resize', updateKeyboardInset);
		viewport.addEventListener('scroll', updateKeyboardInset);
		return () => {
			viewport.removeEventListener('resize', updateKeyboardInset);
			viewport.removeEventListener('scroll', updateKeyboardInset);
		};
	}, []);

	const scrollQtyIntoView = (target: HTMLElement) => {
		window.setTimeout(() => {
			target.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
				inline: 'nearest',
			});
		}, 50);
	};

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const [sheetResponse, saved, alreadySaved] = await Promise.all([
				axios.get<RawMaterialItem[]>('/api/raw-materials', {
					headers: {
						'Cache-Control': 'no-cache',
						Pragma: 'no-cache',
					},
				}),
				getSupplyInventoryForDate(dateKey, 'raw-materials'),
				hasSupplyInventoryForDate(dateKey, 'raw-materials'),
			]);

			const nextItems = sheetResponse.data.filter((item) => item.name.trim());
			const nextQuantities: Record<string, string> = {};
			const nextSaved: Record<string, number> = {};
			for (const item of nextItems) {
				const qty = saved[item.name] ?? 0;
				nextQuantities[item.name] = String(qty);
				nextSaved[item.name] = qty;
			}

			setItems(nextItems);
			setQuantities(nextQuantities);
			setSavedQuantities(nextSaved);
			setHasSavedToday(alreadySaved);
		} catch (error) {
			console.error('Failed to load raw materials inventory:', error);
			setLoadError(
				'Could not load raw materials from the sheet. Please try again.'
			);
			setItems([]);
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

	const visibleItems = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) {
			return items;
		}
		return items.filter(
			(item) =>
				item.name.toLowerCase().includes(term) ||
				item.category.toLowerCase().includes(term)
		);
	}, [items, searchTerm]);

	const groupedItems = useMemo(() => {
		const groups: { category: string; items: RawMaterialItem[] }[] = [];
		const indexByCategory = new Map<string, number>();
		for (const item of visibleItems) {
			const existing = indexByCategory.get(item.category);
			if (existing === undefined) {
				indexByCategory.set(item.category, groups.length);
				groups.push({ category: item.category, items: [item] });
			} else {
				groups[existing].items.push(item);
			}
		}
		return groups;
	}, [visibleItems]);

	const hasUnsavedChanges = useMemo(() => {
		if (loading || items.length === 0) {
			return false;
		}
		return items.some(
			(item) =>
				parseQty(quantities[item.name]) !== (savedQuantities[item.name] ?? 0)
		);
	}, [items, loading, quantities, savedQuantities]);

	const handleQtyChange = (name: string, value: string) => {
		if (value !== '' && !/^\d+$/.test(value)) {
			return;
		}
		setQuantities((prev) => ({ ...prev, [name]: value }));
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const nextSaved: Record<string, number> = {};
			for (const item of items) {
				nextSaved[item.name] = parseQty(quantities[item.name]);
			}
			await saveSupplyInventoryForDate(dateKey, 'raw-materials', nextSaved);
			setSavedQuantities(nextSaved);
			setHasSavedToday(true);
			setQuantities(
				Object.fromEntries(
					Object.entries(nextSaved).map(([name, qty]) => [name, String(qty)])
				)
			);
		} catch (error) {
			console.error('Failed to save raw materials inventory:', error);
			alert('Failed to save inventory. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const handleShare = async () => {
		if (sharing || !hasSavedToday) {
			return;
		}
		setSharing(true);
		try {
			const current: Record<string, number> = {};
			for (const item of items) {
				current[item.name] = parseQty(quantities[item.name]);
			}
			await shareRawMaterialsCsv(items, current, dateKey);
		} catch (error) {
			if (
				error instanceof DOMException &&
				error.name === 'AbortError'
			) {
				return;
			}
			console.error('Failed to share raw materials CSV:', error);
			alert('Could not share inventory. Please try again.');
		} finally {
			setSharing(false);
		}
	};

	return (
		<OpsPageShell
			title="Raw material inventory"
			headerExtra={
				<div className="pb-3 px-1">
					<p className="text-xs font-medium text-gray-600">Today</p>
					<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
				</div>
			}
			footer={
				<div
					className="fixed left-0 right-0 bg-white border-t px-4 sm:px-6 py-3 shadow-lg z-20 transition-[bottom] duration-150"
					style={{
						bottom: keyboardInset,
						paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
					}}
				>
					<div className="flex gap-3">
						<button
							type="button"
							disabled={loading || saving || !hasUnsavedChanges}
							onClick={() => void handleSave()}
							aria-busy={saving}
							className="min-h-[48px] flex-1 inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-50"
						>
							{saving ? (
								<LoadingSpinner className="h-4 w-4 text-white" />
							) : (
								'Save inventory'
							)}
						</button>
						{hasSavedToday ? (
							<button
								type="button"
								disabled={loading || saving || sharing}
								onClick={() => void handleShare()}
								aria-busy={sharing}
								className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm font-bold touch-manipulation active:bg-gray-50 disabled:opacity-50"
							>
								{sharing ? (
									<LoadingSpinner className="h-4 w-4 text-gray-700" />
								) : (
									<>
										<ShareIcon className="h-3.5 w-3.5" />
										Share
									</>
								)}
							</button>
						) : null}
					</div>
				</div>
			}
		>
			<input
				type="search"
				enterKeyHint="search"
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				value={searchTerm}
				onChange={(e) => setSearchTerm(e.target.value)}
				placeholder="Search items or category..."
				disabled={loading}
				className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base mb-4 disabled:opacity-50"
			/>

			{loading ? (
				<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
					<LoadingSpinner className="h-8 w-8 text-black" />
					<p className="text-sm font-semibold text-gray-900">
						Loading raw materials…
					</p>
					<p className="text-xs text-gray-500 max-w-xs">
						Fetching the latest list from the inventory sheet.
					</p>
				</div>
			) : loadError ? (
				<div className="text-center py-12 space-y-4">
					<p className="text-sm text-red-600">{loadError}</p>
					<button
						type="button"
						onClick={() => void load()}
						className="min-h-[44px] px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold touch-manipulation"
					>
						Retry
					</button>
				</div>
			) : groupedItems.length === 0 ? (
				<div className="text-center py-12 text-sm text-gray-500">
					No items found.
				</div>
			) : (
				<div
					className="space-y-6"
					style={{
						paddingBottom: `calc(7.5rem + env(safe-area-inset-bottom) + ${keyboardInset}px)`,
					}}
				>
					{groupedItems.map((group) => (
						<section key={group.category}>
							<h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 px-0.5">
								{group.category}
							</h2>
							<ul className="space-y-2">
								{group.items.map((item) => (
									<li
										key={`${item.category}:${item.name}`}
										className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5 bg-white"
									>
										<p className="text-sm font-medium min-w-0 flex-1 leading-snug break-words pr-1">
											{item.name}
										</p>
										<input
											type="text"
											inputMode="numeric"
											pattern="[0-9]*"
											enterKeyHint="done"
											value={quantities[item.name] ?? '0'}
											onChange={(e) =>
												handleQtyChange(item.name, e.target.value)
											}
											onFocus={(e) => scrollQtyIntoView(e.currentTarget)}
											className="w-[4.5rem] min-h-[44px] border border-gray-300 rounded-lg px-2 py-2 text-base text-center bg-white shrink-0 touch-manipulation"
											aria-label={`Quantity for ${item.name}`}
										/>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</OpsPageShell>
	);
}
