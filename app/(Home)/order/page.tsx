"use client";

import { ItemGroup, OrderGroup, TCart, TMenuApiItem, TOrder, TOrdersStore, BillingContext, BILLING_CONTEXT_KEY } from "@/src/models/common";
import {
	formatOrderLabel,
	formatOrderTime,
	fulfillNextUnitForDish,
	getGroupLateByMs,
	getOrderItemUnits,
	getReadyOrders,
	groupItemsByKitchenGroup,
	groupOrdersByTable,
	formatLateDuration,
	isGroupFullyMarkedDone,
	isGroupLate,
	isOrderEditable,
	isOrderMarkedDone,
	isOrderReady,
	isTableComplementaryServed,
	isTableWelcomeDrinkServed,
	maintainOrders,
	markOrderDone,
	markTableComplementaryServed,
	markTableWelcomeDrinkServed,
	orderGroupToCart,
	ordersStoreChanged,
	isUnitLastFulfilled,
	isUnitNextToFulfill,
	unfulfillLastUnitForDish,
	updateOrders,
} from "@/src/utils/order_utils";
import { buildDishCategoryMap } from "@/src/utils/menu_utils";
import { EditOrderModal } from "@/components/feature/order/edit-order-modal";
import { OrderOpsSyncIndicator } from "@/components/feature/order/order-ops-sync-indicator";
import {
	ConfirmModalActions,
	LoadingSpinner,
	TouchActionButton,
	TouchCheckbox,
	TouchIconButton,
} from "@/components/ui/touch-controls";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import axios from "axios";
import localforage from "localforage";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

const ORDERS_KEY = "orders";

type TabId = "tables" | "items";

function CategoryIcon({ className }: { className?: string }) {
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
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
		</svg>
	);
}

function InventoryIcon({ className }: { className?: string }) {
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
			<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
			<path d="m3.3 7 8.7 5 8.7-5" />
			<path d="M12 22V12" />
		</svg>
	);
}

function PlusIcon({ className }: { className?: string }) {
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
			<path d="M5 12h14" />
			<path d="M12 5v14" />
		</svg>
	);
}

function CheckIcon({
	checked,
	className,
}: {
	checked: boolean;
	className?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden
		>
			{checked ? (
				<>
					<path d="M20 6 9 17l-5-5" />
				</>
			) : (
				<rect x="4" y="4" width="16" height="16" rx="2" />
			)}
		</svg>
	);
}

function QtyBadge({ qty }: { qty: number }) {
	return (
		<span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-black text-white text-[10px] font-bold leading-none shrink-0">
			{qty}
		</span>
	);
}

function PencilIcon({ className }: { className?: string }) {
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
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function OrderRow({
	order,
	now,
	onEdit,
	onKotPrint,
	onRequestMarkDone,
}: {
	order: TOrder;
	now: number;
	onEdit: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
	onRequestMarkDone: (order: TOrder) => void;
}) {
	const markedDone = isOrderMarkedDone(order);
	const editable = isOrderEditable(order, now);
	const kitchenReady = isOrderReady(order);
	const canMarkDone = kitchenReady && !markedDone;

	return (
		<div
			className={`relative border rounded-lg px-3 py-2 bg-gray-50 ${
				markedDone ? "border-green-200 bg-green-50/40" : "border-gray-100"
			} ${editable ? "pr-12" : ""}`}
		>
			{editable && (
				<TouchIconButton
					onClick={() => onEdit(order)}
					ariaLabel={`Edit order from ${formatOrderTime(order.createdAt)}`}
					className="absolute top-1 right-1 bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
				>
					<PencilIcon className="w-4 h-4" />
				</TouchIconButton>
			)}
			<TouchCheckbox
				checked={markedDone}
				disabled={!canMarkDone}
				label={
					markedDone
						? "Done"
						: kitchenReady
							? "Mark done"
							: "Mark done (items pending)"
				}
				hint={
					!markedDone && !kitchenReady
						? "Mark all items ready on the By item tab first"
						: undefined
				}
				onPress={() => {
					if (canMarkDone) {
						onRequestMarkDone(order);
					}
				}}
			/>
			<div className="mb-2 flex items-center gap-2 flex-wrap">
				<TouchActionButton
					onClick={() => onKotPrint(order)}
					className="bg-yellow-100 border border-yellow-400 text-yellow-900 active:bg-yellow-200 min-w-[56px] shrink-0"
				>
					KOT
				</TouchActionButton>
				<span className="text-xs font-semibold text-gray-700">
					{formatOrderTime(order.createdAt)}
				</span>
			</div>
			{order.notes?.trim() ? (
				<p className="text-xs text-gray-500 mb-1.5 italic">
					Note: {order.notes.trim()}
				</p>
			) : null}
			<ul className="space-y-1">
				{order.items.map((item, itemIndex) => {
					const unitChecks = getOrderItemUnits(order, itemIndex);
					return (
						<li
							key={`${order.id}-${item.name}-${itemIndex}`}
							className="text-sm text-gray-700"
						>
							<div className="flex items-center gap-2 flex-wrap">
								<QtyBadge qty={item.qty} />
								<span className="font-medium leading-snug">{item.name}</span>
								<span className="inline-flex items-center gap-1 ml-1">
									{unitChecks.map((fulfilled, unitIndex) => (
										<CheckIcon
											key={unitIndex}
											checked={fulfilled}
											className={`w-4 h-4 shrink-0 ${
												fulfilled ? "text-green-600" : "text-gray-300"
											}`}
										/>
									))}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function TableOrderCard({
	group,
	now,
	isActionPending,
	onBill,
	onEditOrder,
	onKotPrint,
	onRequestMarkDone,
	onRequestWelcomeDrink,
	onRequestComplementary,
}: {
	group: OrderGroup;
	now: number;
	isActionPending: (key: string) => boolean;
	onBill: (group: OrderGroup) => void;
	onEditOrder: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
	onRequestMarkDone: (order: TOrder) => void;
	onRequestWelcomeDrink: (group: OrderGroup) => void;
	onRequestComplementary: (group: OrderGroup) => void;
}) {
	const addOrderHref =
		group.kind === "table" && group.tableNumbers?.length
			? `/order/new?tables=${group.tableNumbers.join(",")}`
			: `/order/new?type=${group.kind}`;

	const isLate = group.kind === "table" && isGroupLate(group, now);
	const allDone = group.kind === "table" && isGroupFullyMarkedDone(group);
	const lateByMs = isLate ? getGroupLateByMs(group, now) : 0;
	const hasItems = group.orders.some((order) => order.items.length > 0);
	const billingPending = isActionPending(`bill:${group.key}`);
	const drinkPending = isActionPending(`drink:${group.key}`);
	const compPending = isActionPending(`comp:${group.key}`);
	const drinkServed = isTableWelcomeDrinkServed(group);
	const compServed = isTableComplementaryServed(group);
	const showTableService = group.kind === "table";

	return (
		<div
			className={`rounded-xl shadow-md overflow-hidden ${
				isLate
					? "border-2 border-red-500 bg-red-50"
					: allDone
						? "border-2 border-green-500 bg-green-50"
						: "border bg-white text-card-foreground"
			}`}
		>
			{isLate ? (
				<div className="flex justify-center border-b border-red-200 bg-red-50 px-3 py-2">
					<span
						className="inline-flex items-center rounded-full bg-red-600 px-3 py-0.5 text-xs font-bold text-white shadow-sm whitespace-nowrap"
						aria-label={`Late by ${formatLateDuration(lateByMs)}`}
					>
						Late {formatLateDuration(lateByMs)}
					</span>
				</div>
			) : null}
			<div className="flex flex-col space-y-1.5 p-6 pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 min-w-0">
						<TouchActionButton
							onClick={() => onBill(group)}
							loading={billingPending}
							disabled={!hasItems || billingPending}
							className="bg-green-500 border border-green-600 text-white active:bg-green-600 shrink-0 min-w-[72px] disabled:opacity-40"
						>
							₹ Bill
						</TouchActionButton>
						<h3 className="text-lg font-semibold truncate">{group.label}</h3>
					</div>
					<Link
						href={addOrderHref}
						className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 touch-manipulation px-3 shrink-0"
						aria-label={`Add order to ${group.label}`}
					>
						<PlusIcon className="w-4 h-4 shrink-0" />
						<span className="text-xs font-semibold">New order</span>
					</Link>
				</div>
				{showTableService ? (
					<div className="flex items-center gap-2 flex-wrap pt-1">
						<TouchActionButton
							onClick={() => onRequestWelcomeDrink(group)}
							loading={drinkPending}
							disabled={drinkServed || drinkPending}
							className={
								drinkServed
									? "bg-green-600 border border-green-600 text-white min-w-[88px]"
									: "bg-white border border-gray-300 text-gray-700 active:bg-gray-100 min-w-[88px]"
							}
						>
							Drink
						</TouchActionButton>
						<TouchActionButton
							onClick={() => onRequestComplementary(group)}
							loading={compPending}
							disabled={compServed || compPending}
							className={
								compServed
									? "bg-green-600 border border-green-600 text-white min-w-[88px]"
									: "bg-white border border-gray-300 text-gray-700 active:bg-gray-100 min-w-[88px]"
							}
						>
							Complementary
						</TouchActionButton>
					</div>
				) : null}
				<p className="text-xs text-gray-500">
					{group.orders.length} order{group.orders.length === 1 ? "" : "s"}
				</p>
			</div>
			<div className="p-6 pt-0 space-y-2">
				{group.orders.map((order) => (
					<OrderRow
						key={order.id}
						order={order}
						now={now}
						onEdit={onEditOrder}
						onKotPrint={onKotPrint}
						onRequestMarkDone={onRequestMarkDone}
					/>
				))}
			</div>
		</div>
	);
}

function ConfirmOrderActionModal({
	title,
	message,
	confirmLabel,
	confirming,
	onConfirm,
	onCancel,
}: {
	title: string;
	message: string;
	confirmLabel: string;
	confirming?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={() => {
				if (!confirming) {
					onCancel();
				}
			}}
		>
			<div
				className="w-full max-w-sm rounded-xl bg-white shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<h2 className="text-lg font-bold">{title}</h2>
					<p className="text-sm text-gray-600 mt-2">{message}</p>
				</div>
				<ConfirmModalActions
					onCancel={onCancel}
					onConfirm={onConfirm}
					confirmLabel={confirmLabel}
					confirming={confirming}
					cancelDisabled={confirming}
				/>
			</div>
		</div>
	);
}

function ConfirmItemModal({
	dishName,
	unit,
	isUncheck,
	confirming,
	onConfirm,
	onCancel,
}: {
	dishName: string;
	unit: ItemGroup["units"][number];
	isUncheck: boolean;
	confirming?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={() => {
				if (!confirming) {
					onCancel();
				}
			}}
		>
			<div
				className="w-full max-w-sm rounded-xl bg-white shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<h2 className="text-lg font-bold">
						{isUncheck ? "Mark as pending?" : "Mark as ready?"}
					</h2>
					<p className="text-sm text-gray-600 mt-2">
						{isUncheck ? "Undo ready for" : "Confirm ready for"}{" "}
						<QtyBadge qty={1} />
						<span className="font-semibold">{dishName}</span>
						<br />
						<span className="text-gray-500">
							{formatOrderTime(unit.createdAt)}
						</span>
					</p>
				</div>
				<ConfirmModalActions
					onCancel={onCancel}
					onConfirm={onConfirm}
					confirmLabel="Confirm"
					confirming={confirming}
					cancelDisabled={confirming}
				/>
			</div>
		</div>
	);
}

function ItemGroupCard({
	group,
	orders,
	onToggleUnit,
}: {
	group: ItemGroup;
	orders: TOrder[];
	onToggleUnit: (dishName: string, wasFulfilled: boolean) => Promise<void>;
}) {
	const [pendingAction, setPendingAction] = useState<{
		unitIndex: number;
		wasFulfilled: boolean;
	} | null>(null);
	const [confirmingToggle, setConfirmingToggle] = useState(false);

	const pendingUnit =
		pendingAction != null ? group.units[pendingAction.unitIndex] : null;

	return (
		<div className="rounded-xl border bg-white shadow-md">
			<div className="p-6 pb-3">
				<h3 className="text-lg font-semibold">{group.name}</h3>
				<p className="text-xs text-gray-500 mt-1">
					{group.remainingQty} of {group.totalQty} pending
				</p>
			</div>
			<ul className="px-4 pb-6 space-y-1">
				{group.units.map((unit, index) => {
					const canCheck = isUnitNextToFulfill(orders, unit);
					const canUncheck = isUnitLastFulfilled(orders, unit);
					const interactive = canCheck || canUncheck;
					const rowPending =
						confirmingToggle &&
						pendingUnit != null &&
						pendingUnit.orderId === unit.orderId &&
						pendingUnit.itemIndex === unit.itemIndex &&
						pendingUnit.unitIndex === unit.unitIndex;

					return (
						<li
							key={`${unit.orderId}-${unit.itemIndex}-${unit.unitIndex}`}
							className="flex items-center gap-2 text-sm min-h-[52px] px-2 rounded-lg"
						>
							<button
								type="button"
								disabled={!interactive && !rowPending}
								onClick={() => {
									if (canCheck) {
										setPendingAction({ unitIndex: index, wasFulfilled: false });
									} else if (canUncheck) {
										setPendingAction({ unitIndex: index, wasFulfilled: true });
									}
								}}
								className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg touch-manipulation ${
									interactive || rowPending
										? "active:bg-gray-100"
										: "opacity-50"
								}`}
								aria-label={
									unit.fulfilled
										? `Mark ${unit.dishName} as pending`
										: `Mark ${unit.dishName} as ready`
								}
								aria-busy={rowPending}
							>
								{rowPending ? (
									<LoadingSpinner className="h-6 w-6 text-gray-700" />
								) : (
									<CheckIcon
										checked={unit.fulfilled}
										className={`h-7 w-7 ${
											unit.fulfilled ? "text-green-600" : "text-gray-300"
										}`}
									/>
								)}
							</button>
							<div className="min-w-0 flex-1 py-2">
								<p className="text-base font-medium truncate leading-snug">
									{unit.dishName}
								</p>
								<p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
									<span>{formatOrderTime(unit.createdAt)}</span>
									<QtyBadge qty={1} />
								</p>
							</div>
						</li>
					);
				})}
			</ul>

			{pendingAction && pendingUnit && (
				<ConfirmItemModal
					dishName={pendingUnit.dishName}
					unit={pendingUnit}
					isUncheck={pendingAction.wasFulfilled}
					confirming={confirmingToggle}
					onCancel={() => {
						if (!confirmingToggle) {
							setPendingAction(null);
						}
					}}
					onConfirm={() => {
						void (async () => {
							setConfirmingToggle(true);
							try {
								await onToggleUnit(
									pendingUnit.dishName,
									pendingAction.wasFulfilled
								);
								setPendingAction(null);
							} finally {
								setConfirmingToggle(false);
							}
						})();
					}}
				/>
			)}
		</div>
	);
}

function ReadyOrdersModal({
	orders,
	onClose,
}: {
	orders: TOrder[];
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-xl bg-white shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b px-5 py-4">
					<h2 className="text-lg font-bold">Ready orders</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-gray-500 hover:text-black text-xl leading-none"
						aria-label="Close"
					>
						×
					</button>
				</div>
				<ul className="max-h-80 overflow-y-auto divide-y">
					{orders.map((order) => (
						<li key={order.id} className="px-5 py-3">
							<p className="font-semibold">{formatOrderLabel(order)}</p>
							<p className="text-xs text-gray-500 mt-0.5">
								{formatOrderTime(order.createdAt)}
							</p>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export default function OrderPage() {
	const router = useRouter();
	const pathname = usePathname();
	const [inventoryNavPending, startInventoryNav] = useTransition();
	const [orders, setOrders] = useState<TOrder[]>([]);
	const [groups, setGroups] = useState<OrderGroup[]>([]);
	const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<TabId>("tables");
	const [readyModalOpen, setReadyModalOpen] = useState(false);
	const [editingOrder, setEditingOrder] = useState<TOrder | null>(null);
	const [pendingMarkDone, setPendingMarkDone] = useState<TOrder | null>(null);
	const [pendingWelcomeDrink, setPendingWelcomeDrink] =
		useState<OrderGroup | null>(null);
	const [pendingComplementary, setPendingComplementary] =
		useState<OrderGroup | null>(null);
	const [pendingActions, setPendingActions] = useState<Record<string, boolean>>(
		{}
	);
	const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [dishCategoryMap, setDishCategoryMap] = useState<Record<string, string>>(
		{}
	);
	const dishCategoryMapRef = useRef(dishCategoryMap);
	dishCategoryMapRef.current = dishCategoryMap;
	const hasLoadedOnceRef = useRef(false);

	const readyOrders = useMemo(() => getReadyOrders(orders), [orders]);

	const isActionPending = useCallback(
		(key: string) =>
			Boolean(pendingActions[key]) || confirmingAction === key,
		[pendingActions, confirmingAction]
	);

	const runPendingAction = useCallback(
		async (key: string, action: () => Promise<void>) => {
			setPendingActions((current) => ({ ...current, [key]: true }));
			try {
				await action();
			} finally {
				setPendingActions((current) => {
					const next = { ...current };
					delete next[key];
					return next;
				});
			}
		},
		[]
	);

	const runConfirmingAction = useCallback(
		async (key: string, action: () => Promise<void>) => {
			setConfirmingAction(key);
			try {
				await action();
			} finally {
				setConfirmingAction(null);
			}
		},
		[]
	);

	useEffect(() => {
		router.prefetch("/order/inventory");
	}, [router]);

	const applyOrderState = useCallback(
		(nextOrders: TOrder[], categoryMap?: Record<string, string>) => {
			const map = categoryMap ?? dishCategoryMapRef.current;
			setOrders(nextOrders);
			setGroups(groupOrdersByTable(nextOrders));
			setItemGroups(groupItemsByKitchenGroup(nextOrders, map));
			if (categoryMap) {
				setDishCategoryMap(categoryMap);
			}
		},
		[]
	);

	const loadOrders = useCallback((options?: { background?: boolean }) => {
		if (!options?.background && !hasLoadedOnceRef.current) {
			setLoading(true);
		}

		Promise.all([
			localforage.getItem<TOrdersStore>(ORDERS_KEY),
			axios.get<TMenuApiItem[]>("/api/menu", {
				headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
			}),
		])
			.then(async ([store, menuResponse]) => {
				const rawOrders = store?.orders ?? [];
				const categoryMap = buildDishCategoryMap(menuResponse.data);
				const maintained = maintainOrders(rawOrders, Date.now());
				applyOrderState(maintained, categoryMap);
				if (ordersStoreChanged(rawOrders, maintained)) {
					await updateOrders(maintained);
				}
			})
			.catch((error) => {
				console.error("Failed to load orders:", error);
				if (!hasLoadedOnceRef.current) {
					setOrders([]);
					setGroups([]);
					setItemGroups([]);
				}
			})
			.finally(() => {
				setLoading(false);
				hasLoadedOnceRef.current = true;
			});
	}, [applyOrderState]);

	useEffect(() => {
		if (pathname !== "/order") {
			return;
		}

		loadOrders();

		const onFocus = () => {
			loadOrders({ background: true });
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [pathname, loadOrders]);

	useEffect(() => {
		const onOrderOpsUpdated = () => {
			loadOrders({ background: true });
		};
		window.addEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
		return () => window.removeEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
	}, [loadOrders]);

	useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now());
		}, 15_000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (loading || orders.length === 0) {
			return;
		}

		const maintained = maintainOrders(orders, now);
		if (!ordersStoreChanged(orders, maintained)) {
			return;
		}

		void (async () => {
			const saved = await updateOrders(maintained, now);
			applyOrderState(saved);
		})();
	}, [now, loading, orders, applyOrderState]);

	useEffect(() => {
		if (readyOrders.length === 0) {
			setReadyModalOpen(false);
		}
	}, [readyOrders.length]);

	const persistOrders = async (nextOrders: TOrder[]) => {
		const maintained = await updateOrders(nextOrders, Date.now());
		applyOrderState(maintained);
	};

	const handleToggleDishUnit = async (
		dishName: string,
		wasFulfilled: boolean
	) => {
		const nextOrders = wasFulfilled
			? unfulfillLastUnitForDish(orders, dishName)
			: fulfillNextUnitForDish(orders, dishName);
		await persistOrders(nextOrders);
	};

	const handleMarkDone = async (order: TOrder) => {
		await runConfirmingAction(`markDone:${order.id}`, async () => {
			if (!isOrderReady(order) || isOrderMarkedDone(order)) {
				setPendingMarkDone(null);
				return;
			}
			await persistOrders(markOrderDone(orders, order.id));
			setPendingMarkDone(null);
		});
	};

	const handleWelcomeDrink = async (group: OrderGroup) => {
		await runConfirmingAction(`drink:${group.key}`, async () => {
			await persistOrders(markTableWelcomeDrinkServed(orders, group));
			setPendingWelcomeDrink(null);
		});
	};

	const handleComplementary = async (group: OrderGroup) => {
		await runConfirmingAction(`comp:${group.key}`, async () => {
			await persistOrders(markTableComplementaryServed(orders, group));
			setPendingComplementary(null);
		});
	};

	const handleKotPrint = (order: TOrder) => {
		router.push(`/kot?orderId=${encodeURIComponent(order.id)}`);
	};

	const handleBill = async (group: OrderGroup) => {
		await runPendingAction(`bill:${group.key}`, async () => {
			const cart = orderGroupToCart(group);
			if (cart.items.length === 0) {
				return;
			}
			const billingContext: BillingContext = {
				source: "orders",
				groupKey: group.key,
				kind: group.kind,
				tableNumbers: group.tableNumbers ?? [],
				label: group.label,
			};
			await localforage.setItem<TCart>("cart", cart);
			await localforage.setItem(BILLING_CONTEXT_KEY, billingContext);
			router.push("/cart");
		});
	};

	const hasOrders = groups.length > 0;

	return (
		<div className="ops-app-screen">
			<div className="ops-sticky-header bg-white border-b px-6 pb-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h1 className="text-xl font-bold">Orders</h1>
							<div className="flex items-center gap-2 shrink-0">
								<OrderOpsSyncIndicator />
								<button
									type="button"
									onClick={() => router.push("/freeflow")}
									className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 touch-manipulation"
									aria-label="Freeflow bill"
								>
									<CategoryIcon className="w-5 h-5" />
								</button>
								<button
									type="button"
									onClick={() => {
										startInventoryNav(() => {
											router.push("/order/inventory");
										});
									}}
									className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 touch-manipulation"
									aria-label={
										inventoryNavPending
											? "Opening inventory"
											: "Dish inventory"
									}
									aria-busy={inventoryNavPending}
								>
									{inventoryNavPending ? (
										<LoadingSpinner className="h-5 w-5 text-gray-700" />
									) : (
										<InventoryIcon className="w-5 h-5" />
									)}
								</button>
								{readyOrders.length > 0 && (
									<button
										type="button"
										onClick={() => setReadyModalOpen(true)}
										className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-green-500 text-white text-sm font-bold hover:bg-green-600 touch-manipulation px-3"
										aria-label={`${readyOrders.length} ready orders`}
									>
										{readyOrders.length}
									</button>
								)}
							</div>
						</div>
						<p className="text-sm text-gray-500 mt-1">
							{activeTab === "tables"
								? "Grouped by table · active first, all-done at bottom"
								: "Grouped by kitchen section · FCFS fulfillment"}
						</p>
					</div>
				</div>

				<div className="flex gap-2 mt-4">
					<button
						type="button"
						onClick={() => setActiveTab("tables")}
						className={`flex-1 min-h-[44px] py-2 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
							activeTab === "tables"
								? "bg-black text-white"
								: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
						}`}
					>
						Table orders
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("items")}
						className={`flex-1 min-h-[44px] py-2 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
							activeTab === "items"
								? "bg-black text-white"
								: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
						}`}
					>
						By item
					</button>
				</div>
			</div>

			<div className="p-6 space-y-4">
				{loading && !hasOrders ? (
					<div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400 text-sm">
						<LoadingSpinner className="h-6 w-6 text-gray-500" />
						<span>Loading orders...</span>
					</div>
				) : activeTab === "tables" ? (
					<>
						{!hasOrders ? (
							<div className="text-center py-16 text-gray-500">
								<p className="text-lg font-medium mb-2">No active orders</p>
								<p className="text-sm">
									Tap the + button to place a new order
								</p>
							</div>
						) : (
							groups.map((group) => (
								<TableOrderCard
									key={group.key}
									group={group}
									now={now}
									isActionPending={isActionPending}
									onBill={handleBill}
									onEditOrder={setEditingOrder}
									onKotPrint={handleKotPrint}
									onRequestMarkDone={setPendingMarkDone}
									onRequestWelcomeDrink={setPendingWelcomeDrink}
									onRequestComplementary={setPendingComplementary}
								/>
							))
						)}
						<div className="flex justify-center pt-2 pb-2">
							<Link
								href="/order/history"
								className="inline-flex min-h-[44px] items-center justify-center px-5 rounded-lg text-xs font-semibold touch-manipulation transition-colors bg-white border border-gray-300 text-gray-700 active:bg-gray-100"
							>
								Today&apos;s order history
							</Link>
						</div>
					</>
				) : itemGroups.length === 0 ? (
					<div className="text-center py-16 text-gray-500 text-sm">
						No items in active orders
					</div>
				) : (
					itemGroups.map((group) => (
						<ItemGroupCard
							key={group.name}
							group={group}
							orders={orders}
							onToggleUnit={handleToggleDishUnit}
						/>
					))
				)}
			</div>

			<button
				type="button"
				onClick={() => router.push("/order/new")}
				className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-green-500 text-white text-sm font-semibold shadow-lg px-4 hover:bg-green-600 touch-manipulation z-20"
				aria-label="New table"
			>
				<PlusIcon className="w-5 h-5 shrink-0" />
				New table
			</button>

			{readyModalOpen && readyOrders.length > 0 && (
				<ReadyOrdersModal
					orders={readyOrders}
					onClose={() => setReadyModalOpen(false)}
				/>
			)}

			{pendingMarkDone && (
				<ConfirmOrderActionModal
					title="Mark order done?"
					message={`Confirm this order from ${formatOrderTime(pendingMarkDone.createdAt)} is complete. This cannot be undone.`}
					confirmLabel="Mark done"
					confirming={confirmingAction === `markDone:${pendingMarkDone.id}`}
					onCancel={() => setPendingMarkDone(null)}
					onConfirm={() => void handleMarkDone(pendingMarkDone)}
				/>
			)}

			{pendingWelcomeDrink && (
				<ConfirmOrderActionModal
					title="Welcome drink served?"
					message={`Is welcome drink served for ${pendingWelcomeDrink.label}?`}
					confirmLabel="Yes, served"
					confirming={confirmingAction === `drink:${pendingWelcomeDrink.key}`}
					onCancel={() => setPendingWelcomeDrink(null)}
					onConfirm={() => void handleWelcomeDrink(pendingWelcomeDrink)}
				/>
			)}

			{pendingComplementary && (
				<ConfirmOrderActionModal
					title="Complementary served?"
					message={`Is complementary served for ${pendingComplementary.label}?`}
					confirmLabel="Yes, served"
					confirming={confirmingAction === `comp:${pendingComplementary.key}`}
					onCancel={() => setPendingComplementary(null)}
					onConfirm={() => void handleComplementary(pendingComplementary)}
				/>
			)}

			{editingOrder && (
				<EditOrderModal
					order={editingOrder}
					onClose={() => setEditingOrder(null)}
					onSaved={() => loadOrders({ background: true })}
				/>
			)}
		</div>
	);
}
