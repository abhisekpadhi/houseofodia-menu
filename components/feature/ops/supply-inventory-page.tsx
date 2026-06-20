'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import { LoadingSpinner } from '@/components/ui/touch-controls';
import {
	SUPPLY_INVENTORY_CONFIGS,
	type SupplyInventoryKind,
} from '@/src/constants/supply_inventory';
import {
	getSupplyInventoryForDate,
	getTodayDateKey,
	saveSupplyInventoryForDate,
} from '@/src/utils/supply_inventory_utils';
import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

type SupplyInventoryPageProps = {
	kind: SupplyInventoryKind;
};

export function SupplyInventoryPage({ kind }: SupplyInventoryPageProps) {
	const config = SUPPLY_INVENTORY_CONFIGS[kind];
	const dateKey = getTodayDateKey();

	const [quantities, setQuantities] = useState<Record<string, string>>({});
	const [savedQuantities, setSavedQuantities] = useState<
		Record<string, number>
	>({});
	const [editingItems, setEditingItems] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const saved = await getSupplyInventoryForDate(dateKey, kind);
			const nextQuantities: Record<string, string> = {};
			const nextSaved: Record<string, number> = {};
			for (const item of config.items) {
				const qty = saved[item.name] ?? 0;
				nextQuantities[item.name] = String(qty);
				nextSaved[item.name] = qty;
			}
			setQuantities(nextQuantities);
			setSavedQuantities(nextSaved);
			setEditingItems(new Set());
		} finally {
			setLoading(false);
		}
	}, [config.items, dateKey, kind]);

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
			return config.items;
		}
		return config.items.filter((item) =>
			item.name.toLowerCase().includes(term)
		);
	}, [config.items, searchTerm]);

	const hasUnsavedChanges = useMemo(() => {
		if (loading) {
			return false;
		}
		return config.items.some(
			(item) => parseQty(quantities[item.name]) !== (savedQuantities[item.name] ?? 0)
		);
	}, [config.items, loading, quantities, savedQuantities]);

	const handleQtyChange = (name: string, value: string) => {
		if (value !== '' && !/^\d+$/.test(value)) {
			return;
		}
		setQuantities((prev) => ({ ...prev, [name]: value }));
	};

	const toggleEdit = (name: string) => {
		setEditingItems((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
				setQuantities((current) => ({
					...current,
					[name]: String(parseQty(current[name])),
				}));
			} else {
				next.add(name);
			}
			return next;
		});
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const items: Record<string, number> = {};
			for (const item of config.items) {
				items[item.name] = parseQty(quantities[item.name]);
			}
			await saveSupplyInventoryForDate(dateKey, kind, items);
			setSavedQuantities(items);
			setEditingItems(new Set());
		} catch (error) {
			console.error('Failed to save supply inventory:', error);
			alert('Failed to save inventory. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<OpsPageShell
			title={config.title}
			headerExtra={
				<div className="pb-3 px-1">
					<p className="text-xs font-medium text-gray-600">Today</p>
					<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
				</div>
			}
			footer={
				<div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 sm:px-6 py-4 shadow-lg z-20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<button
						type="button"
						disabled={loading || saving || !hasUnsavedChanges}
						onClick={() => void handleSave()}
						aria-busy={saving}
						className="w-full min-h-[48px] inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-50"
					>
						{saving ? (
							<LoadingSpinner className="h-4 w-4 text-white" />
						) : (
							'Save inventory'
						)}
					</button>
				</div>
			}
		>
			<input
				type="text"
				value={searchTerm}
				onChange={(e) => setSearchTerm(e.target.value)}
				placeholder="Search items..."
				className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
			/>

			{loading ? (
				<div className="text-center py-12 text-sm text-gray-500">
					Loading inventory...
				</div>
			) : visibleItems.length === 0 ? (
				<div className="text-center py-12 text-sm text-gray-500">
					No items found.
				</div>
			) : (
				<ul className="space-y-2 pb-24">
					{visibleItems.map((item) => {
						const isEditing = editingItems.has(item.name);
						return (
							<li
								key={item.name}
								className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-white"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium truncate">{item.name}</p>
									<p className="text-xs text-gray-500 mt-0.5">{item.unit}</p>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<input
										type="text"
										inputMode="numeric"
										pattern="[0-9]*"
										readOnly={!isEditing}
										value={quantities[item.name] ?? '0'}
										onChange={(e) =>
											handleQtyChange(item.name, e.target.value)
										}
										className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center ${
											isEditing
												? 'border-gray-300 bg-white'
												: 'border-gray-200 bg-gray-50 text-gray-700 cursor-default'
										}`}
										aria-label={`Quantity for ${item.name}`}
									/>
									<button
										type="button"
										onClick={() => toggleEdit(item.name)}
										className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
											isEditing
												? 'bg-black text-white hover:bg-gray-800'
												: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
										}`}
									>
										{isEditing ? 'Done' : 'Edit'}
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</OpsPageShell>
	);
}
