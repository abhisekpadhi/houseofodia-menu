"use client";

import { ItemGroup, OrderGroup, TCart, TMenuApiItem, TOrder, TOrdersStore, BillingContext, BILLING_CONTEXT_KEY } from "@/src/models/common";
import {
	formatOrderLabel,
	formatOrderTime,
	fulfillNextUnitForDish,
	getOrderItemUnits,
	getReadyOrders,
	groupItemsByKitchenGroup,
	groupOrdersByTable,
	isGroupLate,
	maintainOrders,
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
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import axios from "axios";
import localforage from "localforage";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function KotPrintIcon({ className }: { className?: string }) {
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
			<path d="M6 9V2h12v7" />
			<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
			<path d="M6 14h12v8H6z" />
		</svg>
	);
}

function OrderRow({
	order,
	onEdit,
	onKotPrint,
}: {
	order: TOrder;
	onEdit: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
}) {
	return (
		<div className="relative border border-gray-100 rounded-lg px-3 py-2 pr-10 bg-gray-50">
			<button
				type="button"
				onClick={() => onEdit(order)}
				className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-gray-600 hover:bg-gray-100 hover:text-black border border-gray-200 transition-colors"
				aria-label={`Edit order from ${formatOrderTime(order.createdAt)}`}
			>
				<PencilIcon className="w-3.5 h-3.5" />
			</button>
			<div className="mb-1 flex items-center gap-2">
				<button
					type="button"
					onClick={() => onKotPrint(order)}
					className="w-7 h-7 flex items-center justify-center rounded-full bg-white text-gray-600 hover:bg-gray-100 hover:text-black border border-gray-200 transition-colors shrink-0"
					aria-label={`Print KOT for order at ${formatOrderTime(order.createdAt)}`}
				>
					<KotPrintIcon className="w-3.5 h-3.5" />
				</button>
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
							className="text-xs text-gray-600"
						>
							<div className="flex items-center gap-1.5 flex-wrap">
								<QtyBadge qty={item.qty} />
								<span>{item.name}</span>
								<span className="inline-flex items-center gap-0.5 ml-1">
									{unitChecks.map((fulfilled, unitIndex) => (
										<CheckIcon
											key={unitIndex}
											checked={fulfilled}
											className={`w-3.5 h-3.5 shrink-0 ${
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

function BillIcon({ className }: { className?: string }) {
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
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<path d="M14 2v6h6" />
			<path d="M16 13H8" />
			<path d="M16 17H8" />
			<path d="M10 9H8" />
		</svg>
	);
}

function LateIndicator() {
	return (
		<span className="relative flex h-2.5 w-2.5 shrink-0" aria-label="Late order">
			<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
			<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
		</span>
	);
}

function TableOrderCard({
	group,
	now,
	onBill,
	onEditOrder,
	onKotPrint,
}: {
	group: OrderGroup;
	now: number;
	onBill: (group: OrderGroup) => void;
	onEditOrder: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
}) {
	const addOrderHref =
		group.kind === "table" && group.tableNumbers?.length
			? `/order/new?tables=${group.tableNumbers.join(",")}`
			: `/order/new?type=${group.kind}`;

	const isLate = isGroupLate(group, now);
	const hasItems = group.orders.some((order) => order.items.length > 0);

	return (
		<div className="rounded-xl border bg-white text-card-foreground shadow-md">
			<div className="flex flex-col space-y-1.5 p-6 pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 min-w-0">
						{isLate && <LateIndicator />}
						<button
							type="button"
							disabled={!hasItems}
							onClick={() => onBill(group)}
							className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
							aria-label={`Bill ${group.label}`}
						>
							<BillIcon className="w-4 h-4" />
						</button>
						<h3 className="text-lg font-semibold truncate">{group.label}</h3>
					</div>
					<Link
						href={addOrderHref}
						className="w-8 h-8 flex items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
						aria-label={`Add order to ${group.label}`}
					>
						<PlusIcon className="w-4 h-4" />
					</Link>
				</div>
				<p className="text-xs text-gray-500">
					{group.orders.length} order{group.orders.length === 1 ? "" : "s"}
				</p>
			</div>
			<div className="p-6 pt-0 space-y-2">
				{group.orders.map((order) => (
					<OrderRow
						key={order.id}
						order={order}
						onEdit={onEditOrder}
						onKotPrint={onKotPrint}
					/>
				))}
			</div>
		</div>
	);
}

function ConfirmItemModal({
	dishName,
	unit,
	isUncheck,
	onConfirm,
	onCancel,
}: {
	dishName: string;
	unit: ItemGroup["units"][number];
	isUncheck: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={onCancel}
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
				<div className="flex gap-2 p-4">
					<button
						type="button"
						onClick={onCancel}
						className="flex-1 py-2 rounded-lg bg-gray-100 text-sm font-semibold hover:bg-gray-200"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600"
					>
						Confirm
					</button>
				</div>
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
	onToggleUnit: (dishName: string, wasFulfilled: boolean) => void;
}) {
	const [pendingAction, setPendingAction] = useState<{
		unitIndex: number;
		wasFulfilled: boolean;
	} | null>(null);

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
			<ul className="px-6 pb-6 space-y-2">
				{group.units.map((unit, index) => {
					const canCheck = isUnitNextToFulfill(orders, unit);
					const canUncheck = isUnitLastFulfilled(orders, unit);

					return (
						<li
							key={`${unit.orderId}-${unit.itemIndex}-${unit.unitIndex}`}
							className="flex items-center gap-3 text-sm"
						>
							<button
								type="button"
								disabled={!canCheck && !canUncheck}
								onClick={() => {
									if (canCheck) {
										setPendingAction({ unitIndex: index, wasFulfilled: false });
									} else if (canUncheck) {
										setPendingAction({ unitIndex: index, wasFulfilled: true });
									}
								}}
								className={`shrink-0 ${
									canCheck || canUncheck
										? "cursor-pointer"
										: "cursor-default opacity-60"
								}`}
								aria-label={
									unit.fulfilled
										? `Mark ${unit.dishName} as pending`
										: `Mark ${unit.dishName} as ready`
								}
							>
								<CheckIcon
									checked={unit.fulfilled}
									className={`w-5 h-5 ${
										unit.fulfilled ? "text-green-600" : "text-gray-300"
									}`}
								/>
							</button>
							<div className="min-w-0 flex-1">
								<p className="font-medium truncate">{unit.dishName}</p>
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
					onCancel={() => setPendingAction(null)}
					onConfirm={() => {
						onToggleUnit(
							pendingUnit.dishName,
							pendingAction.wasFulfilled
						);
						setPendingAction(null);
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
	const [orders, setOrders] = useState<TOrder[]>([]);
	const [groups, setGroups] = useState<OrderGroup[]>([]);
	const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<TabId>("tables");
	const [readyModalOpen, setReadyModalOpen] = useState(false);
	const [editingOrder, setEditingOrder] = useState<TOrder | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [dishCategoryMap, setDishCategoryMap] = useState<Record<string, string>>(
		{}
	);
	const dishCategoryMapRef = useRef(dishCategoryMap);
	dishCategoryMapRef.current = dishCategoryMap;
	const hasLoadedOnceRef = useRef(false);

	const readyOrders = useMemo(() => getReadyOrders(orders), [orders]);

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
		}, 30_000);
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

	const handleKotPrint = (order: TOrder) => {
		router.push(`/kot?orderId=${encodeURIComponent(order.id)}`);
	};

	const handleBill = async (group: OrderGroup) => {
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
	};

	const hasOrders = groups.length > 0;

	return (
		<div className="min-h-screen bg-gray-50 pb-24">
			<div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h1 className="text-xl font-bold">Orders</h1>
							<div className="flex items-center gap-2 shrink-0">
								<OrderOpsSyncIndicator />
								<button
									type="button"
									onClick={() => router.push("/freeflow")}
									className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
									aria-label="Freeflow bill"
								>
									<CategoryIcon className="w-5 h-5" />
								</button>
								<button
									type="button"
									onClick={() => router.push("/order/inventory")}
									className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
									aria-label="Dish inventory"
								>
									<InventoryIcon className="w-5 h-5" />
								</button>
								{readyOrders.length > 0 && (
									<button
										type="button"
										onClick={() => setReadyModalOpen(true)}
										className="min-w-[2rem] h-8 px-2 rounded-full bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors"
										aria-label={`${readyOrders.length} ready orders`}
									>
										{readyOrders.length}
									</button>
								)}
							</div>
						</div>
						<p className="text-sm text-gray-500 mt-1">
							{activeTab === "tables"
								? "Grouped by table · oldest first"
								: "Grouped by kitchen section · FCFS fulfillment"}
						</p>
					</div>
				</div>

				<div className="flex gap-2 mt-4">
					<button
						type="button"
						onClick={() => setActiveTab("tables")}
						className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
							activeTab === "tables"
								? "bg-black text-white"
								: "bg-gray-100 text-gray-700 hover:bg-gray-200"
						}`}
					>
						Table orders
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("items")}
						className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
							activeTab === "items"
								? "bg-black text-white"
								: "bg-gray-100 text-gray-700 hover:bg-gray-200"
						}`}
					>
						By item
					</button>
				</div>
			</div>

			<div className="p-6 space-y-4">
				{loading && !hasOrders ? (
					<div className="text-center py-8 text-gray-400 text-sm">
						Loading orders...
					</div>
				) : !hasOrders ? (
					<div className="text-center py-16 text-gray-500">
						<p className="text-lg font-medium mb-2">No active orders</p>
						<p className="text-sm">
							Tap the + button to place a new order
						</p>
					</div>
				) : activeTab === "tables" ? (
					groups.map((group) => (
						<TableOrderCard
							key={group.key}
							group={group}
							now={now}
							onBill={handleBill}
							onEditOrder={setEditingOrder}
							onKotPrint={handleKotPrint}
						/>
					))
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
				className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center hover:bg-green-600 transition-colors z-20"
				aria-label="Add new order"
			>
				<PlusIcon className="w-7 h-7" />
			</button>

			{readyModalOpen && readyOrders.length > 0 && (
				<ReadyOrdersModal
					orders={readyOrders}
					onClose={() => setReadyModalOpen(false)}
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
