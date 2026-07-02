'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import { LoadingSpinner } from '@/components/ui/touch-controls';
import {
	getAllDayChecklistItemIds,
	getDayChecklistSections,
	type DayChecklistKind,
} from '@/src/constants/day_checklists';
import {
	getDayChecklistForDate,
	getTodayDateKey,
	saveDayChecklistForDate,
	type DayChecklistState,
} from '@/src/utils/day_checklist_utils';
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

type DayChecklistPageProps = {
	kind: DayChecklistKind;
	title: string;
};

export function DayChecklistPage({ kind, title }: DayChecklistPageProps) {
	const dateKey = getTodayDateKey();
	const sections = useMemo(() => getDayChecklistSections(kind), [kind]);
	const allItemIds = useMemo(() => getAllDayChecklistItemIds(kind), [kind]);

	const [checked, setChecked] = useState<DayChecklistState>({});
	const [savedChecked, setSavedChecked] = useState<DayChecklistState>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const saved = await getDayChecklistForDate(dateKey, kind);
			setChecked(saved);
			setSavedChecked(saved);
		} finally {
			setLoading(false);
		}
	}, [dateKey, kind]);

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

	const completedCount = allItemIds.filter((id) => checked[id]).length;
	const hasUnsavedChanges = allItemIds.some(
		(id) => checked[id] !== savedChecked[id]
	);

	const toggleItem = (id: string) => {
		setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			await saveDayChecklistForDate(dateKey, kind, checked);
			setSavedChecked(checked);
		} catch (error) {
			console.error('Failed to save checklist:', error);
			alert('Failed to save checklist. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<OpsPageShell
			title={title}
			headerExtra={
				<div className="pb-3 px-1">
					<p className="text-xs font-medium text-gray-600">Today</p>
					<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
					<p className="text-xs text-gray-500 mt-2">
						{completedCount} of {allItemIds.length} items checked
					</p>
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
							`Save ${title.toLowerCase()}`
						)}
					</button>
				</div>
			}
		>
			{loading ? (
				<div className="text-center py-12 text-sm text-gray-500">
					Loading checklist...
				</div>
			) : (
				<div className="space-y-6 pb-24">
					{sections.map((section) => (
						<section key={section.area}>
							<h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
								{section.title}
							</h2>
							<ul className="space-y-2">
								{section.items.map((item) => {
									const isChecked = checked[item.id] === true;
									return (
										<li key={item.id}>
											<button
												type="button"
												onClick={() => toggleItem(item.id)}
												className={`w-full flex items-start gap-3 border rounded-lg px-4 py-3 text-left touch-manipulation transition-colors ${
													isChecked
														? 'border-green-300 bg-green-50'
														: 'border-gray-200 bg-white active:bg-gray-50'
												}`}
												aria-pressed={isChecked}
											>
												<span
													className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
														isChecked
															? 'bg-green-600 border-green-600 text-white'
															: 'border-gray-300 text-transparent'
													}`}
												>
													✓
												</span>
												<span className="text-sm font-medium text-gray-800">
													{item.label}
												</span>
											</button>
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
