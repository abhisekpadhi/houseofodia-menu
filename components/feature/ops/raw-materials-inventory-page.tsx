'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import { LoadingSpinner } from '@/components/ui/touch-controls';
import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import {
	EMPTY_RAW_MATERIAL_QTY,
	getSupplyInventoryForDate,
	getTodayDateKey,
	hasSupplyInventoryForDate,
	normalizeRawMaterialQty,
	saveSupplyInventoryForDate,
	type RawMaterialQty,
	type RawMaterialUnit,
} from '@/src/utils/supply_inventory_utils';
import type { SupplyInventoryKind } from '@/src/constants/supply_inventory';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RawMaterialItem = {
	category: string;
	name: string;
};

type QtyDraft = Record<RawMaterialUnit, string>;

type InventoryTabId = 'raw material' | 'dish';

type InventoryTab = {
	id: InventoryTabId;
	label: string;
	sheetName: InventoryTabId;
	kind: SupplyInventoryKind;
	fileSlug: string;
};

const INVENTORY_TABS: InventoryTab[] = [
	{
		id: 'raw material',
		label: 'Raw material',
		sheetName: 'raw material',
		kind: 'raw-materials',
		fileSlug: 'raw-material',
	},
	{
		id: 'dish',
		label: 'Dish',
		sheetName: 'dish',
		kind: 'dish',
		fileSlug: 'dish',
	},
];

const UNITS: RawMaterialUnit[] = ['kg', 'gm', 'pcs'];

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

function qtyToDraft(qty: RawMaterialQty): QtyDraft {
	return {
		kg: qty.kg > 0 ? String(qty.kg) : '',
		gm: qty.gm > 0 ? String(qty.gm) : '',
		pcs: qty.pcs > 0 ? String(qty.pcs) : '',
	};
}

function draftToQty(draft: QtyDraft | undefined): RawMaterialQty {
	return {
		kg: parseQty(draft?.kg),
		gm: parseQty(draft?.gm),
		pcs: parseQty(draft?.pcs),
	};
}

function qtyEquals(a: RawMaterialQty, b: RawMaterialQty): boolean {
	return a.kg === b.kg && a.gm === b.gm && a.pcs === b.pcs;
}

/** Report format: "2kg", "2kg500g", "10pcs", "500g", "1kg3pcs", etc. Empty if all zero. */
function formatRawMaterialQty(qty: RawMaterialQty): string {
	const parts: string[] = [];
	if (qty.kg > 0) {
		parts.push(`${qty.kg}kg`);
	}
	if (qty.gm > 0) {
		parts.push(`${qty.gm}g`);
	}
	if (qty.pcs > 0) {
		parts.push(`${qty.pcs}pcs`);
	}
	return parts.join('');
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
	quantities: Record<string, RawMaterialQty>,
	dateKey: string
): string {
	const rows = [
		['Date', 'Category', 'Item', 'Qty'].map(escapeCsvCell).join(','),
		...items.map((item) => {
			const qty = quantities[item.name] ?? EMPTY_RAW_MATERIAL_QTY;
			return [
				dateKey,
				item.category,
				item.name,
				formatRawMaterialQty(qty),
			]
				.map(escapeCsvCell)
				.join(',');
		}),
	];
	return `\uFEFF${rows.join('\n')}`;
}

async function shareRawMaterialsCsv(
	items: RawMaterialItem[],
	quantities: Record<string, RawMaterialQty>,
	dateKey: string,
	fileSlug: string,
	titleLabel: string
): Promise<void> {
	const csv = buildRawMaterialsCsv(items, quantities, dateKey);
	const filename = `${fileSlug}-${dateKey}.csv`;
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
			title: `${titleLabel} ${dateKey}`,
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
	const [activeTabId, setActiveTabId] =
		useState<InventoryTabId>('raw material');
	const activeTab =
		INVENTORY_TABS.find((tab) => tab.id === activeTabId) ?? INVENTORY_TABS[0];
	const [items, setItems] = useState<RawMaterialItem[]>([]);
	const [quantities, setQuantities] = useState<Record<string, QtyDraft>>({});
	const [savedQuantities, setSavedQuantities] = useState<
		Record<string, RawMaterialQty>
	>({});
	const [hasSavedToday, setHasSavedToday] = useState(false);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [keyboardInset, setKeyboardInset] = useState(0);
	const hasUnsavedChangesRef = useRef(false);

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
					params: { sheet: activeTab.sheetName },
					headers: {
						'Cache-Control': 'no-cache',
						Pragma: 'no-cache',
					},
				}),
				getSupplyInventoryForDate(dateKey, activeTab.kind),
				hasSupplyInventoryForDate(dateKey, activeTab.kind),
			]);

			const nextItems = sheetResponse.data.filter((item) => item.name.trim());
			const nextQuantities: Record<string, QtyDraft> = {};
			const nextSaved: Record<string, RawMaterialQty> = {};
			for (const item of nextItems) {
				const qty = normalizeRawMaterialQty(saved[item.name]);
				nextQuantities[item.name] = qtyToDraft(qty);
				nextSaved[item.name] = qty;
			}

			setItems(nextItems);
			setQuantities(nextQuantities);
			setSavedQuantities(nextSaved);
			setHasSavedToday(alreadySaved);
		} catch (error) {
			console.error(`Failed to load ${activeTab.label} inventory:`, error);
			setLoadError(
				`Could not load ${activeTab.label.toLowerCase()} from the sheet. Please try again.`
			);
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, [activeTab.kind, activeTab.label, activeTab.sheetName, dateKey]);

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
		return items.some((item) => {
			const current = draftToQty(quantities[item.name]);
			const saved = savedQuantities[item.name] ?? EMPTY_RAW_MATERIAL_QTY;
			return !qtyEquals(current, saved);
		});
	}, [items, loading, quantities, savedQuantities]);

	useEffect(() => {
		hasUnsavedChangesRef.current = hasUnsavedChanges;
	}, [hasUnsavedChanges]);

	const handleTabChange = (tabId: InventoryTabId) => {
		if (tabId === activeTabId) {
			return;
		}
		if (hasUnsavedChangesRef.current) {
			const confirmed = window.confirm(
				'You have unsaved changes. Switch tab and discard them?'
			);
			if (!confirmed) {
				return;
			}
		}
		setSearchTerm('');
		setActiveTabId(tabId);
	};

	const handleQtyChange = (
		name: string,
		unit: RawMaterialUnit,
		value: string
	) => {
		if (value !== '' && !/^\d+$/.test(value)) {
			return;
		}
		setQuantities((prev) => ({
			...prev,
			[name]: {
				...(prev[name] ?? qtyToDraft(EMPTY_RAW_MATERIAL_QTY)),
				[unit]: value,
			},
		}));
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const nextSaved: Record<string, RawMaterialQty> = {};
			const nextDrafts: Record<string, QtyDraft> = {};
			for (const item of items) {
				const qty = draftToQty(quantities[item.name]);
				nextSaved[item.name] = qty;
				nextDrafts[item.name] = qtyToDraft(qty);
			}
			await saveSupplyInventoryForDate(dateKey, activeTab.kind, nextSaved);
			setSavedQuantities(nextSaved);
			setQuantities(nextDrafts);
			setHasSavedToday(true);
		} catch (error) {
			console.error(`Failed to save ${activeTab.label} inventory:`, error);
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
			const current: Record<string, RawMaterialQty> = {};
			for (const item of items) {
				current[item.name] = draftToQty(quantities[item.name]);
			}
			await shareRawMaterialsCsv(
				items,
				current,
				dateKey,
				activeTab.fileSlug,
				activeTab.label
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
			console.error(`Failed to share ${activeTab.label} CSV:`, error);
			alert('Could not share inventory. Please try again.');
		} finally {
			setSharing(false);
		}
	};

	const tabClass = (active: boolean) =>
		`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors touch-manipulation disabled:opacity-50 ${
			active
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700 active:bg-gray-200'
		}`;

	return (
		<OpsPageShell
			title="Raw material inventory"
			headerExtra={
				<div className="pb-3 px-1 space-y-3">
					<div>
						<p className="text-xs font-medium text-gray-600">Today</p>
						<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
					</div>
					<div className="flex gap-2">
						{INVENTORY_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								disabled={loading || saving}
								onClick={() => handleTabChange(tab.id)}
								className={tabClass(tab.id === activeTabId)}
							>
								{tab.label}
							</button>
						))}
					</div>
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
						Loading {activeTab.label.toLowerCase()}…
					</p>
					<p className="text-xs text-gray-500 max-w-xs">
						Fetching the latest list from the “{activeTab.sheetName}” sheet.
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
								{group.items.map((item) => {
									const draft =
										quantities[item.name] ??
										qtyToDraft(EMPTY_RAW_MATERIAL_QTY);
									return (
										<li
											key={`${item.category}:${item.name}`}
											className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 bg-white"
										>
											<p className="text-sm font-medium leading-snug break-words min-w-0">
												{item.name}
											</p>
											<div className="grid grid-cols-3 gap-1.5 shrink-0">
												{UNITS.map((unit) => (
													<label
														key={unit}
														className="flex flex-col gap-0.5 w-[3.75rem] sm:w-16"
													>
														<span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center">
															{unit}
														</span>
														<input
															type="text"
															inputMode="numeric"
															pattern="[0-9]*"
															enterKeyHint="done"
															value={draft[unit]}
															onChange={(e) =>
																handleQtyChange(
																	item.name,
																	unit,
																	e.target.value
																)
															}
															onFocus={(e) =>
																scrollQtyIntoView(e.currentTarget)
															}
															className="w-full min-h-[40px] border border-gray-300 rounded-lg px-1 py-1.5 text-base text-center bg-white touch-manipulation"
															aria-label={`${unit} for ${item.name}`}
														/>
													</label>
												))}
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					))}
				</div>
			)}
		</OpsPageShell>
	);
}
