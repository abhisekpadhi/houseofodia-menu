'use client';

import {
	ORDER_NOTIFICATIONS_EVENT,
	clearDoneOrderNotifications,
	getOrderNotifications,
	pruneExpiredOrderNotifications,
	setOrderNotificationDone,
	sortOrderNotificationsForDisplay,
	type OrderNotification,
} from '@/src/utils/order_notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';

function BellIcon({ className }: { className?: string }) {
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
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	);
}

function formatNotificationTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('en-IN', {
		hour: 'numeric',
		minute: '2-digit',
	});
}

export function OrderNotificationsBell({
	className = '',
}: {
	className?: string;
}) {
	const [notifications, setNotifications] = useState<OrderNotification[]>([]);
	const [open, setOpen] = useState(false);

	const load = useCallback(async () => {
		const stored = await getOrderNotifications();
		setNotifications(stored);
	}, []);

	useEffect(() => {
		void (async () => {
			await pruneExpiredOrderNotifications();
			await load();
		})();
		const onUpdated = () => {
			void load();
		};
		window.addEventListener(ORDER_NOTIFICATIONS_EVENT, onUpdated);

		const interval = window.setInterval(() => {
			void pruneExpiredOrderNotifications();
		}, 30_000);

		return () => {
			window.removeEventListener(ORDER_NOTIFICATIONS_EVENT, onUpdated);
			window.clearInterval(interval);
		};
	}, [load]);

	const sortedNotifications = useMemo(
		() => sortOrderNotificationsForDisplay(notifications),
		[notifications]
	);

	const unreadCount = notifications.filter((item) => !item.done).length;

	const handleToggleDone = async (id: string, done: boolean) => {
		await setOrderNotificationDone(id, done);
	};

	const handleClearDone = async () => {
		await clearDoneOrderNotifications();
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={`relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 ${className}`}
				aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} new)` : ''}`}
			>
				<BellIcon className="w-5 h-5" />
				{unreadCount > 0 ? (
					<span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
						{unreadCount > 99 ? '99+' : unreadCount}
					</span>
				) : null}
			</button>

			{open ? (
				<div
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-6"
					onClick={() => setOpen(false)}
				>
					<div
						className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[80vh] flex flex-col overflow-hidden"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-center justify-between gap-2 border-b px-5 py-4">
							<h2 className="text-lg font-bold">Notifications</h2>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-gray-500 hover:text-black text-xl leading-none"
								aria-label="Close"
							>
								×
							</button>
						</div>

						<div className="flex-1 overflow-y-auto divide-y">
							{sortedNotifications.length === 0 ? (
								<div className="text-center py-12 text-sm text-gray-500 px-5">
									No notifications yet.
								</div>
							) : (
								sortedNotifications.map((notification) => (
									<label
										key={notification.id}
										className={`flex items-start gap-3 px-5 py-3 cursor-pointer touch-manipulation ${
											notification.done ? 'bg-gray-50' : ''
										}`}
									>
										<input
											type="checkbox"
											checked={notification.done}
											onChange={(event) =>
												void handleToggleDone(
													notification.id,
													event.target.checked
												)
											}
											className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 accent-green-600"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 flex-wrap">
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
														notification.kind === 'cancelled'
															? 'bg-red-100 text-red-700'
															: 'bg-amber-100 text-amber-800'
													}`}
												>
													{notification.kind}
												</span>
												<span className="text-sm font-bold text-gray-900">
													{notification.tableLabel}
												</span>
												<span className="text-xs text-gray-400">
													{formatNotificationTime(notification.createdAt)}
												</span>
											</div>
											<p
												className={`text-sm mt-1 leading-snug ${
													notification.done
														? 'text-gray-400 line-through'
														: 'text-gray-700'
												}`}
											>
												{notification.items.join(', ')}
											</p>
										</div>
									</label>
								))
							)}
						</div>

						{notifications.some((item) => item.done) ? (
							<div className="border-t px-5 py-3">
								<button
									type="button"
									onClick={() => void handleClearDone()}
									className="w-full min-h-[44px] inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 touch-manipulation active:bg-gray-100"
								>
									Clear done
								</button>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</>
	);
}
