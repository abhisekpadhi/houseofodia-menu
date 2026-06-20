'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import {
	getMenuSopItemsByCategory,
	type MenuSopItem,
} from '@/src/constants/menu_sop_items';
import { encodeDishSlug } from '@/src/utils/menu_sop_utils';
import Link from 'next/link';
import { useMemo, useState } from 'react';

function hasSop(item: MenuSopItem): boolean {
	return item.sop.trim().length > 0;
}

export function MenuSopListPage() {
	const [searchTerm, setSearchTerm] = useState('');
	const groups = useMemo(() => getMenuSopItemsByCategory(), []);

	const visibleGroups = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) {
			return groups;
		}

		return groups
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) =>
						item.name.toLowerCase().includes(term) ||
						item.category.toLowerCase().includes(term)
				),
			}))
			.filter((group) => group.items.length > 0);
	}, [groups, searchTerm]);

	return (
		<OpsPageShell title="Menu SOP">
			<p className="text-xs text-gray-500 mb-4">
				{groups.reduce((sum, group) => sum + group.items.length, 0)} menu
				items
			</p>
			<input
				type="text"
				value={searchTerm}
				onChange={(e) => setSearchTerm(e.target.value)}
				placeholder="Search dishes..."
				className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
			/>
			<div className="space-y-6 pb-8">
				{visibleGroups.length === 0 ? (
					<p className="text-center py-12 text-sm text-gray-500">
						No dishes found.
					</p>
				) : (
					visibleGroups.map((group) => (
						<section key={group.category}>
							<h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
								{group.category}
							</h2>
							<ul className="space-y-2">
								{group.items.map((item) => (
									<li key={item.name}>
										<Link
											href={`/order/menu-sop/${encodeDishSlug(item.name)}`}
											className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 touch-manipulation"
										>
											<div className="min-w-0 flex items-center gap-2">
												<img
													src={item.is_veg ? '/veg.svg' : '/non_veg.svg'}
													alt={item.is_veg ? 'veg' : 'non veg'}
													className="w-4 h-4 shrink-0"
												/>
												<span className="text-sm font-medium text-gray-900 truncate">
													{item.name}
												</span>
											</div>
											<span
												className={`text-[10px] font-bold uppercase shrink-0 ${
													hasSop(item)
														? 'text-green-700'
														: 'text-gray-400'
												}`}
											>
												{hasSop(item) ? 'SOP' : 'No SOP'}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</section>
					))
				)}
			</div>
		</OpsPageShell>
	);
}
