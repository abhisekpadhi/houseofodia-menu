'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import { getMenuSopItem } from '@/src/constants/menu_sop_items';
import {
	decodeDishSlug,
	getMenuItemSop,
} from '@/src/utils/menu_sop_utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export function MenuSopDetailPage() {
	const params = useParams<{ dish: string }>();
	const dishName = decodeDishSlug(params.dish ?? '');
	const item = getMenuSopItem(dishName);
	const sop = getMenuItemSop(dishName, item?.sop);

	if (!item) {
		return (
			<OpsPageShell title="Menu SOP">
				<p className="text-sm text-gray-600 mb-4">Dish not found.</p>
				<Link
					href="/order/menu-sop"
					className="text-sm font-semibold text-gray-700 hover:text-black"
				>
					← Back to menu list
				</Link>
			</OpsPageShell>
		);
	}

	return (
		<OpsPageShell title={item.name}>
			<div className="pb-8">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
					{item.category}
				</p>
				<div className="flex items-center gap-2 mb-4">
					<img
						src={item.is_veg ? '/veg.svg' : '/non_veg.svg'}
						alt={item.is_veg ? 'veg' : 'non veg'}
						className="w-4 h-4"
					/>
					<span className="text-sm text-gray-600">₹{item.price}</span>
				</div>
				{item.description?.trim() ? (
					<p className="text-sm text-gray-600 mb-4">{item.description.trim()}</p>
				) : null}

				<h2 className="text-sm font-bold text-gray-900 mb-3">
					Standard operating procedure
				</h2>
				{sop.steps.length > 0 ? (
					<ol className="space-y-3">
						{sop.steps.map((step, index) => (
							<li
								key={`${index}-${step}`}
								className="flex gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-white"
							>
								<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">
									{index + 1}
								</span>
								<span className="text-sm text-gray-800 leading-relaxed">
									{step}
								</span>
							</li>
						))}
					</ol>
				) : (
					<p className="text-sm text-gray-500 italic">{sop.notes}</p>
				)}
			</div>
		</OpsPageShell>
	);
}
