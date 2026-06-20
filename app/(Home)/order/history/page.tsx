'use client';

import { OrderOpsSyncIndicator } from '@/components/feature/order/order-ops-sync-indicator';
import {
	LoadingSpinner,
	TouchActionButton,
} from '@/components/ui/touch-controls';
import { TABLE_COUNT, TOrder } from '@/src/models/common';
import { ORDER_OPS_EVENT } from '@/src/models/order_ops';
import { getTodayDateKey } from '@/src/utils/inventory_utils';
import {
	filterOrderHistory,
	getOrderHistoryStatus,
	getOrderHistoryTableLabel,
	getTodayOrderHistory,
	OrderHistorySort,
	OrderHistoryTableFilter,
	shareOrderHistoryAsExcel,
	sortOrderHistory,
} from '@/src/utils/order_history';
import { formatCustomerContact, formatOrderTime, orderTotal } from '@/src/utils/order_utils';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SORT_OPTIONS: { value: OrderHistorySort; label: string }[] = [
	{ value: 'time-asc', label: 'Time · earliest first' },
	{ value: 'time-desc', label: 'Time · latest first' },
	{ value: 'table-asc', label: 'Table' },
	{ value: 'amount-desc', label: 'Amount · highest first' },
];

function statusBadgeClass(status: string): string {
	switch (status) {
		case 'Billed':
			return 'bg-gray-200 text-gray-700';
		case 'Done':
			return 'bg-green-100 text-green-800';
		case 'Ready':
			return 'bg-amber-100 text-amber-800';
		default:
			return 'bg-blue-100 text-blue-800';
	}
}

export default function OrderHistoryPage() {
	const [loading, setLoading] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [historyOrders, setHistoryOrders] = useState<TOrder[]>([]);
	const [sort, setSort] = useState<OrderHistorySort>('time-asc');
	const [tableFilter, setTableFilter] =
		useState<OrderHistoryTableFilter>('all');

	const loadHistory = useCallback(async () => {
		setLoading(true);
		try {
			const orders = await getTodayOrderHistory();
			setHistoryOrders(orders);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadHistory();
	}, [loadHistory]);

	useEffect(() => {
		const onSyncUpdate = () => {
			void loadHistory();
		};
		window.addEventListener(ORDER_OPS_EVENT, onSyncUpdate);
		return () => window.removeEventListener(ORDER_OPS_EVENT, onSyncUpdate);
	}, [loadHistory]);

	const filteredOrders = useMemo(() => {
		const filtered = filterOrderHistory(historyOrders, tableFilter);
		return sortOrderHistory(filtered, sort);
	}, [historyOrders, sort, tableFilter]);

	const dateLabel = getTodayDateKey();

	const handleExport = async () => {
		if (filteredOrders.length === 0) {
			return;
		}

		setExporting(true);
		try {
			await shareOrderHistoryAsExcel(filteredOrders, dateLabel);
		} catch (error) {
			if ((error as Error)?.name !== 'AbortError') {
				console.error('Failed to share order history:', error);
				alert('Could not share the order history file.');
			}
		} finally {
			setExporting(false);
		}
	};

	return (
		<div className="ops-app-screen">
			<div className="ops-sticky-header bg-white border-b px-6 pb-4">
				<div className="flex items-center justify-between gap-3 mb-4">
					<Link
						href="/order"
						className="text-sm font-semibold text-gray-600 hover:text-black touch-manipulation"
					>
						← Back
					</Link>
					<h1 className="text-xl font-bold">Today&apos;s order history</h1>
					<OrderOpsSyncIndicator />
				</div>
				<p className="text-sm text-gray-500">{dateLabel}</p>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
					<label className="block">
						<span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
							Sort
						</span>
						<select
							value={sort}
							onChange={(event) =>
								setSort(event.target.value as OrderHistorySort)
							}
							className="mt-1 w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm touch-manipulation"
						>
							{SORT_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>

					<label className="block">
						<span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
							Table filter
						</span>
						<select
							value={String(tableFilter)}
							onChange={(event) => {
								const value = event.target.value;
								if (
									value === 'all' ||
									value === 'takeaway' ||
									value === 'delivery'
								) {
									setTableFilter(value);
									return;
								}
								setTableFilter(parseInt(value, 10));
							}}
							className="mt-1 w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm touch-manipulation"
						>
							<option value="all">All orders</option>
							{Array.from({ length: TABLE_COUNT }, (_, index) => index + 1).map(
								(tableNumber) => (
									<option key={tableNumber} value={tableNumber}>
										Table {tableNumber}
									</option>
								)
							)}
							<option value="takeaway">Takeaway</option>
							<option value="delivery">Delivery</option>
						</select>
					</label>
				</div>

				<div className="flex items-center justify-between gap-3 mt-4">
					<p className="text-sm text-gray-600">
						{filteredOrders.length} order
						{filteredOrders.length === 1 ? '' : 's'}
					</p>
					<TouchActionButton
						onClick={() => void handleExport()}
						loading={exporting}
						disabled={filteredOrders.length === 0 || exporting}
						className="bg-white border border-gray-300 text-gray-700 active:bg-gray-100 min-w-[120px]"
					>
						Share Excel
					</TouchActionButton>
				</div>
			</div>

			<div className="p-6">
				{loading ? (
					<div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400 text-sm">
						<LoadingSpinner className="h-6 w-6 text-gray-500" />
						<span>Loading history...</span>
					</div>
				) : filteredOrders.length === 0 ? (
					<div className="text-center py-12 text-gray-500 text-sm">
						No orders found for this filter.
					</div>
				) : (
					<ul className="space-y-3">
						{filteredOrders.map((order) => {
							const status = getOrderHistoryStatus(order);
							const total = orderTotal(order.items);
							const customerContact = formatCustomerContact(order);

							return (
								<li
									key={order.id}
									className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="font-semibold text-gray-900">
												{getOrderHistoryTableLabel(order)}
											</p>
											<p className="text-xs text-gray-500 mt-0.5">
												{formatOrderTime(order.createdAt)}
											</p>
											{customerContact ? (
												<p className="text-xs font-medium text-gray-700 mt-1">
													{customerContact}
												</p>
											) : null}
										</div>
										<div className="flex flex-col items-end gap-1 shrink-0">
											<span
												className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}
											>
												{status}
											</span>
											<span className="text-sm font-semibold text-gray-800">
												₹{total}
											</span>
										</div>
									</div>

									{order.notes?.trim() ? (
										<p className="text-xs text-gray-500 mt-2 italic">
											Note: {order.notes.trim()}
										</p>
									) : null}

									<ul className="mt-2 space-y-1">
										{order.items.map((item, index) => (
											<li
												key={`${order.id}-${item.name}-${index}`}
												className="flex items-center justify-between gap-2 text-sm text-gray-700"
											>
												<span className="truncate">
													{item.qty}× {item.name}
												</span>
												<span className="shrink-0 text-gray-500">
													₹{item.price * item.qty}
												</span>
											</li>
										))}
									</ul>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
