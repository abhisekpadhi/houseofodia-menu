"use client";

import { ItemGroup, OrderGroup, TCart, TMenuApiItem, TOrder, TOrdersStore, BillingContext, BILLING_CONTEXT_KEY, ItemCancelReason, TABLE_COUNT } from "@/src/models/common";
import {
	formatOrderLabel,
	formatOrderTime,
	getGroupCustomerDetails,
	getGroupNotes,
	getGroupPax,
	fulfillNextUnitForDish,
	getGroupLateByMs,
	getOrderLateByMs,
	getOrderItemUnitDisplay,
	getReadyOrders,
	getItemUnitStates,
	getUnitCancelReason,
	groupItemsByKitchenGroup,
	groupOrdersByTable,
	formatLateDuration,
	isGroupFullyMarkedDone,
	isGroupLate,
	isOrderLate,
	isOrderEditable,
	isOrderMarkedDone,
	isOrderReady,
	isTableComplementaryServed,
	isTableKidMenuEnabled,
	isTableKidMenuServed,
	isTableWelcomeDrinkServed,
	isItemUnitParcel,
	isUnitPending,
	maintainOrders,
	markOrderDone,
	markTableComplementaryServed,
	markTableKidMenuServed,
	markTableWelcomeDrinkServed,
	orderGroupToBillCart,
	groupHasBillableItems,
	closeTableFromBilling,
	ordersStoreChanged,
	getGroupWaterBottleCount,
	syncGroupWaterBottleCount,
	getWaterBottlePrice,
	WATER_DISH_NAME,
	canMoveTableGroupToTables,
	formatTableGroupLabel,
	getOccupiedTableNumbers,
	isTableAvailableForGroupMove,
	moveTableGroupToTables,
	normalizeTableNumbers,
	tableNumbersEqual,
	isUnitLastFulfilled,
	isUnitNextToFulfill,
	unfulfillLastUnitForDish,
	updateGroupNotes,
	updateOrders,
	cancelItemUnit,
	toggleItemUnitParcel,
} from "@/src/utils/order_utils";
import {
	decrementInventoryForOrder,
	getTodayDateKey,
	replenishInventoryForOrder,
} from "@/src/utils/inventory_utils";
import { buildDishCategoryMap } from "@/src/utils/menu_utils";
import { itemCancelReasonLabel } from "@/src/utils/item_cancel_reasons";
import { EditOrderModal } from "@/components/feature/order/edit-order-modal";
import { CancelItemModal } from "@/components/feature/order/cancel-item-modal";
import { OrderOpsSyncIndicator } from "@/components/feature/order/order-ops-sync-indicator";
import { OpsMenuButton } from "@/components/feature/layout/ops-drawer";
import {
	ConfirmModalActions,
	LoadingSpinner,
	TouchActionButton,
	TouchIconButton,
} from "@/components/ui/touch-controls";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import axios from "axios";
import localforage from "localforage";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const ORDERS_KEY = "orders";

type TabId = "tables" | "items";
type TableOrdersView = "groups" | "orders";

function orderMatchesTableFilter(
	order: TOrder,
	selectedTables: Set<number>
): boolean {
	if (selectedTables.size === 0) {
		return true;
	}
	if (order.kind !== "table") {
		return false;
	}
	return (order.tableNumbers ?? []).some((tableNumber) =>
		selectedTables.has(tableNumber)
	);
}

function groupMatchesTableFilter(
	group: OrderGroup,
	selectedTables: Set<number>
): boolean {
	if (selectedTables.size === 0) {
		return true;
	}
	if (group.kind !== "table") {
		return false;
	}
	return (group.tableNumbers ?? []).some((tableNumber) =>
		selectedTables.has(tableNumber)
	);
}

function filterItemGroupByTables(
	group: ItemGroup,
	orders: TOrder[],
	selectedTables: Set<number>
): ItemGroup | null {
	if (selectedTables.size === 0) {
		return group;
	}

	const orderById = new Map(orders.map((order) => [order.id, order]));
	const units = group.units.filter((unit) => {
		const order = orderById.get(unit.orderId);
		return order != null && orderMatchesTableFilter(order, selectedTables);
	});

	if (units.length === 0) {
		return null;
	}

	return {
		...group,
		units,
		totalQty: units.length,
		remainingQty: units.filter((unit) => isUnitPending(unit)).length,
	};
}

function TableFilterBar({
	selectedTables,
	onToggleTable,
	onClear,
}: {
	selectedTables: number[];
	onToggleTable: (tableNumber: number) => void;
	onClear: () => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<div className="min-w-0 flex-1 overflow-x-auto">
				<div className="flex gap-1 w-max">
					{Array.from({ length: TABLE_COUNT }, (_, index) => index + 1).map(
						(tableNumber) => {
							const isSelected = selectedTables.includes(tableNumber);
							return (
								<button
									key={tableNumber}
									type="button"
									onClick={() => onToggleTable(tableNumber)}
									aria-pressed={isSelected}
									className={`shrink-0 h-7 min-w-[1.75rem] rounded-md border px-1.5 text-xs font-semibold touch-manipulation transition-colors ${
										isSelected
											? "border-green-600 bg-green-500 text-white"
											: "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
									}`}
								>
									{tableNumber}
								</button>
							);
						}
					)}
				</div>
			</div>
			{selectedTables.length > 0 ? (
				<button
					type="button"
					onClick={onClear}
					className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-red-600 hover:bg-red-50 active:bg-red-100 touch-manipulation"
					aria-label="Clear table filter"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						className="h-4 w-4"
						aria-hidden
					>
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			) : null}
		</div>
	);
}

function FilterIcon({ className }: { className?: string }) {
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
			<path d="M4 6h16" />
			<path d="M6 12h12" />
			<path d="M10 18h4" />
		</svg>
	);
}

function OrderViewFiltersSheet({
	activeTab,
	onActiveTabChange,
	tableOrdersView,
	onTableOrdersViewChange,
	itemsAggregatesView,
	onItemsAggregatesViewChange,
	selectedTables,
	onToggleTable,
	onClearTables,
	onClose,
}: {
	activeTab: TabId;
	onActiveTabChange: (tab: TabId) => void;
	tableOrdersView: TableOrdersView;
	onTableOrdersViewChange: (view: TableOrdersView) => void;
	itemsAggregatesView: boolean;
	onItemsAggregatesViewChange: (aggregates: boolean) => void;
	selectedTables: number[];
	onToggleTable: (tableNumber: number) => void;
	onClearTables: () => void;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl bg-white shadow-xl max-h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-lg font-bold">View filters</h2>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 active:bg-green-700 touch-manipulation shrink-0"
							aria-label="Apply filters"
						>
							<CheckIcon checked className="w-5 h-5" />
						</button>
					</div>
				</div>
				<div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
					<div>
						<p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
							View
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => onActiveTabChange("tables")}
								className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
									activeTab === "tables"
										? "bg-black text-white"
										: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
								}`}
							>
								Table orders
							</button>
							<button
								type="button"
								onClick={() => onActiveTabChange("items")}
								className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
									activeTab === "items"
										? "bg-black text-white"
										: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
								}`}
							>
								By item
							</button>
						</div>
					</div>
					<div>
						<p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
							{activeTab === "tables" ? "Table orders layout" : "By item layout"}
						</p>
						<div className="flex gap-2">
							{activeTab === "tables" ? (
								<>
									<button
										type="button"
										onClick={() => onTableOrdersViewChange("groups")}
										className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
											tableOrdersView === "groups"
												? "bg-gray-800 text-white"
												: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
										}`}
									>
										By table
									</button>
									<button
										type="button"
										onClick={() => onTableOrdersViewChange("orders")}
										className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
											tableOrdersView === "orders"
												? "bg-gray-800 text-white"
												: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
										}`}
									>
										All orders
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										onClick={() => onItemsAggregatesViewChange(false)}
										className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
											!itemsAggregatesView
												? "bg-gray-800 text-white"
												: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
										}`}
									>
										Each item
									</button>
									<button
										type="button"
										onClick={() => onItemsAggregatesViewChange(true)}
										className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-sm font-semibold touch-manipulation transition-colors ${
											itemsAggregatesView
												? "bg-gray-800 text-white"
												: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
										}`}
									>
										Aggregates
									</button>
								</>
							)}
						</div>
					</div>
					<div>
						<p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
							Filter by table
						</p>
						<TableFilterBar
							selectedTables={selectedTables}
							onToggleTable={onToggleTable}
							onClear={onClearTables}
						/>
					</div>
				</div>
			</div>
		</div>
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

function PhoneIcon({ className }: { className?: string }) {
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
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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

function MoreVerticalIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden
		>
			<circle cx="12" cy="5" r="1.75" />
			<circle cx="12" cy="12" r="1.75" />
			<circle cx="12" cy="19" r="1.75" />
		</svg>
	);
}

function TableStatusDot({
	label,
	children,
	done = true,
}: {
	label: string;
	children: ReactNode;
	done?: boolean;
}) {
	return (
		<span
			className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border px-1 text-[10px] font-bold leading-none shadow-md ${
				done
					? "bg-green-100 border-green-600 text-green-800"
					: "bg-amber-50 border-amber-400 text-amber-900"
			}`}
			title={label}
			aria-label={label}
		>
			{children}
		</span>
	);
}

function TableNamePopover({
	label,
	onClose,
}: {
	label: string;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 px-6"
			onClick={onClose}
		>
			<div
				className="w-full max-w-sm rounded-xl bg-white px-5 py-4 shadow-xl text-center"
				onClick={(event) => event.stopPropagation()}
			>
				<p className="text-lg font-bold text-gray-900 break-words">{label}</p>
				<button
					type="button"
					onClick={onClose}
					className="mt-4 min-h-[40px] w-full rounded-lg bg-gray-100 text-sm font-semibold text-gray-800 touch-manipulation active:bg-gray-200"
				>
					Close
				</button>
			</div>
		</div>
	);
}

function TableGroupMoreSheet({
	group,
	hasOrdersInGroup,
	groupPax,
	groupNotes,
	showTableService,
	drinkServed,
	compServed,
	kidEnabled,
	kidServed,
	billingPending,
	changeTablePending,
	drinkPending,
	compPending,
	kidPending,
	notesPending,
	onBill,
	onChangeTable,
	onEditNotes,
	onRequestWelcomeDrink,
	onRequestComplementary,
	onRequestKidMenu,
	onClose,
}: {
	group: OrderGroup;
	hasOrdersInGroup: boolean;
	groupPax: number | null;
	groupNotes: string | null;
	showTableService: boolean;
	drinkServed: boolean;
	compServed: boolean;
	kidEnabled: boolean;
	kidServed: boolean;
	billingPending: boolean;
	changeTablePending: boolean;
	drinkPending: boolean;
	compPending: boolean;
	kidPending: boolean;
	notesPending: boolean;
	onBill: (group: OrderGroup) => void;
	onChangeTable: (group: OrderGroup) => void;
	onEditNotes: (group: OrderGroup) => void;
	onRequestWelcomeDrink: (group: OrderGroup) => void;
	onRequestComplementary: (group: OrderGroup) => void;
	onRequestKidMenu: (group: OrderGroup) => void;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl bg-white shadow-xl max-h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-lg font-bold truncate">{group.label}</h2>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 active:bg-green-700 touch-manipulation shrink-0"
							aria-label="Close"
						>
							<CheckIcon checked className="w-5 h-5" />
						</button>
					</div>
				</div>
				<div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
					<TouchActionButton
						onClick={() => {
							onClose();
							onBill(group);
						}}
						loading={billingPending}
						disabled={!hasOrdersInGroup || billingPending}
						className="w-full rounded-xl bg-green-500 border border-green-600 text-white active:bg-green-600 disabled:opacity-40 min-h-[44px]"
					>
						₹ Bill
					</TouchActionButton>
					{group.kind === "table" ? (
						<TouchActionButton
							onClick={() => {
								onClose();
								onChangeTable(group);
							}}
							loading={changeTablePending}
							disabled={!hasOrdersInGroup || changeTablePending}
							className="w-full rounded-xl bg-white border border-gray-300 text-gray-700 active:bg-gray-100 disabled:opacity-40 min-h-[44px]"
						>
							Change table
						</TouchActionButton>
					) : null}
					<button
						type="button"
						onClick={() => {
							onClose();
							onEditNotes(group);
						}}
						disabled={notesPending}
						className={`w-full min-h-[44px] rounded-xl border text-sm font-semibold touch-manipulation disabled:opacity-50 ${
							groupNotes
								? "border-green-600 bg-green-50 text-green-800"
								: "border-gray-300 bg-white text-gray-700 active:bg-gray-100"
						}`}
					>
						{notesPending ? "Saving notes…" : groupNotes ? "Edit notes" : "Add notes"}
					</button>
					{groupPax != null ? (
						<div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">
							{groupPax} pax
						</div>
					) : null}
					{showTableService ? (
						<div className="flex flex-wrap gap-2 pt-1">
							<TableServicePill
								label="🥤 Drink"
								checked={drinkServed}
								loading={drinkPending}
								onClick={() => onRequestWelcomeDrink(group)}
							/>
							<TableServicePill
								label="🫓 Complementary"
								checked={compServed}
								loading={compPending}
								onClick={() => onRequestComplementary(group)}
							/>
							{kidEnabled ? (
								<TableServicePill
									label="👶 Kid"
									checked={kidServed}
									loading={kidPending}
									onClick={() => onRequestKidMenu(group)}
								/>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
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

function CrossIcon({ className }: { className?: string }) {
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
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

function OrderRow({
	order,
	onEdit,
	onKotPrint,
	onRequestMarkDone,
	onRequestCancelItem,
	onRequestToggleParcel,
}: {
	order: TOrder;
	onEdit: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
	onRequestMarkDone: (order: TOrder) => void;
	onRequestCancelItem: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
	onRequestToggleParcel: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
}) {
	const markedDone = isOrderMarkedDone(order);
	const editable = isOrderEditable(order);
	const kitchenReady = isOrderReady(order);
	const canMarkDone = kitchenReady && !markedDone;

	return (
		<div
			className={`relative border rounded-lg px-3 py-2 bg-gray-50 ${
				markedDone ? "border-green-200 bg-green-50/40" : "border-gray-100"
			}`}
		>
			<div className="mb-2 flex items-center gap-2">
				<button
					type="button"
					onClick={() => onKotPrint(order)}
					className="inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full border border-yellow-400 bg-yellow-100 px-3 text-xs font-semibold text-yellow-900 touch-manipulation active:bg-yellow-200"
				>
					KOT
				</button>
				<button
					type="button"
					role="checkbox"
					aria-checked={markedDone}
					disabled={!canMarkDone && !markedDone}
					title={
						!markedDone && !kitchenReady
							? "Mark each item ready or cancelled on the By item tab, or cancel from here"
							: undefined
					}
					onClick={() => {
						if (canMarkDone) {
							onRequestMarkDone(order);
						}
					}}
					className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold touch-manipulation shrink-0 transition-colors ${
						!canMarkDone && !markedDone
							? "cursor-not-allowed opacity-50 border-gray-200 bg-white text-gray-400"
							: markedDone
								? "border-green-600 bg-green-100 text-green-800"
								: "border-gray-300 bg-white text-gray-700 active:bg-gray-100"
					}`}
				>
					<span
						className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
							markedDone
								? "border-green-600 bg-green-600 text-white"
								: "border-gray-300 bg-white"
						}`}
					>
						{markedDone ? (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="3"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="h-2.5 w-2.5"
								aria-hidden
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>
						) : null}
					</span>
					Done
				</button>
				<span className="text-xs font-semibold text-gray-600 truncate min-w-0 flex-1">
					{formatOrderTime(order.createdAt)}
				</span>
				{editable ? (
					<TouchIconButton
						onClick={() => onEdit(order)}
						ariaLabel={`Edit order from ${formatOrderTime(order.createdAt)}`}
						className="bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 shrink-0 -mr-1"
					>
						<PencilIcon className="w-4 h-4" />
					</TouchIconButton>
				) : null}
			</div>
			{order.notes?.trim() ? (
				<p className="text-xs text-gray-500 mb-1.5 italic">
					Note: {order.notes.trim()}
				</p>
			) : null}
			<ul className="space-y-1">
				{order.items.map((item, itemIndex) => {
					const unitDisplays = Array.from({ length: item.qty }, (_, unitIndex) =>
						getOrderItemUnitDisplay(item, unitIndex)
					);
					const cancelReasons = Array.from({ length: item.qty }, (_, unitIndex) =>
						getUnitCancelReason(getItemUnitStates(item)[unitIndex] ?? "pending")
					);
					return (
						<li
							key={`${order.id}-${item.name}-${itemIndex}`}
							className="text-sm text-gray-700"
						>
							<div className="flex items-center gap-2 flex-wrap">
								<QtyBadge qty={item.qty} />
								<span
									className={`font-medium leading-snug ${
										unitDisplays.every((display) => display === "cancelled")
											? "line-through text-gray-400"
											: ""
									}`}
								>
									{item.name}
								</span>
								<span className="inline-flex items-center gap-1 ml-1 flex-wrap">
									{unitDisplays.map((display, unitIndex) => {
										const isParcel = isItemUnitParcel(item, unitIndex);
										return (
										<span
											key={unitIndex}
											className="inline-flex items-center gap-0.5"
											title={
												display === "cancelled" && cancelReasons[unitIndex]
													? itemCancelReasonLabel(cancelReasons[unitIndex]!)
													: isParcel
														? "Parcel"
														: undefined
											}
										>
											{display === "fulfilled" ? (
												<CheckIcon checked className="w-4 h-4 shrink-0 text-green-600" />
											) : display === "cancelled" ? (
												<CrossIcon className="w-4 h-4 shrink-0 text-red-500" />
											) : (
												<CheckIcon checked={false} className="w-4 h-4 shrink-0 text-gray-300" />
											)}
											{(display === "pending" || display === "fulfilled") ? (
												<button
													type="button"
													onClick={() =>
														onRequestToggleParcel(order, itemIndex, unitIndex)
													}
													className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border touch-manipulation ${
														isParcel
															? "border-amber-400 bg-amber-200 text-amber-900 opacity-100 active:bg-amber-300"
															: "border-amber-200 bg-amber-50 text-amber-800 opacity-50 active:bg-amber-100"
													}`}
													aria-label={`${isParcel ? "Unmark" : "Mark"} ${item.name} for parcel`}
													aria-pressed={isParcel}
												>
													<span className="text-base leading-none" aria-hidden>
														📦
													</span>
												</button>
											) : isParcel ? (
												<span
													className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full bg-amber-100 text-sm opacity-100"
													aria-label="Parcel"
												>
													📦
												</span>
											) : null}
											{display === "pending" && editable ? (
												<button
													type="button"
													onClick={() =>
														onRequestCancelItem(order, itemIndex, unitIndex)
													}
													className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 touch-manipulation active:bg-red-100"
													aria-label={`Cancel ${item.name}`}
												>
													<CrossIcon className="w-5 h-5" />
												</button>
											) : null}
										</span>
									);
									})}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function IndividualOrderCard({
	order,
	now,
	onEdit,
	onKotPrint,
	onRequestMarkDone,
	onRequestCancelItem,
	onRequestToggleParcel,
}: {
	order: TOrder;
	now: number;
	onEdit: (order: TOrder) => void;
	onKotPrint: (order: TOrder) => void;
	onRequestMarkDone: (order: TOrder) => void;
	onRequestCancelItem: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
	onRequestToggleParcel: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
}) {
	const isLate = order.kind === "table" && isOrderLate(order, now);
	const lateByMs = isLate ? getOrderLateByMs(order, now) : 0;

	return (
		<div
			className={`rounded-xl shadow-md overflow-hidden ${
				isLate
					? "border-2 border-red-500 bg-red-50"
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
			<div className="px-4 pt-3 pb-1 border-b border-gray-100">
				<p className="text-sm font-semibold text-gray-900">
					{formatOrderLabel(order)}
				</p>
			</div>
			<div className="p-3">
				<OrderRow
					order={order}
					onEdit={onEdit}
					onKotPrint={onKotPrint}
					onRequestMarkDone={onRequestMarkDone}
					onRequestCancelItem={onRequestCancelItem}
					onRequestToggleParcel={onRequestToggleParcel}
				/>
			</div>
		</div>
	);
}

function TableServicePill({
	label,
	checked,
	loading,
	onClick,
}: {
	label: string;
	checked: boolean;
	loading?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={checked || loading}
			aria-pressed={checked}
			aria-busy={loading}
			className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold touch-manipulation transition-colors ${
				checked
					? "bg-green-100 border border-green-600 text-green-800"
					: "bg-white border border-gray-300 text-gray-700 active:bg-gray-100"
			}`}
		>
			<span>{label}</span>
			{loading ? (
				<LoadingSpinner className="h-4 w-4 shrink-0" />
			) : checked ? (
				<CheckIcon checked className="w-4 h-4 shrink-0 text-green-700" />
			) : null}
		</button>
	);
}

function GroupNotesModal({
	group,
	draft,
	saving,
	onDraftChange,
	onClose,
	onSave,
}: {
	group: OrderGroup;
	draft: string;
	saving: boolean;
	onDraftChange: (value: string) => void;
	onClose: () => void;
	onSave: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
			onClick={() => {
				if (!saving) {
					onClose();
				}
			}}
		>
			<div
				className="w-full max-w-sm rounded-xl bg-white shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<h2 className="text-lg font-bold">Table notes</h2>
					<p className="text-sm text-gray-600 mt-2">
						Notes for {group.label} — visible on this orders view only.
					</p>
					<textarea
						value={draft}
						onChange={(e) => onDraftChange(e.target.value)}
						placeholder="e.g. birthday, allergy, seating preference..."
						rows={4}
						className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
					/>
				</div>
				<ConfirmModalActions
					onCancel={onClose}
					onConfirm={onSave}
					confirmLabel="Save notes"
					confirming={saving}
					cancelDisabled={saving}
				/>
			</div>
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
	onRequestKidMenu,
	onRequestCancelItem,
	onRequestToggleParcel,
	onEditNotes,
	onChangeTable,
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
	onRequestKidMenu: (group: OrderGroup) => void;
	onRequestCancelItem: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
	onRequestToggleParcel: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
	onEditNotes: (group: OrderGroup) => void;
	onChangeTable: (group: OrderGroup) => void;
}) {
	const addOrderHref =
		group.kind === "table" && group.tableNumbers?.length
			? `/order/new?tables=${group.tableNumbers.join(",")}`
			: `/order/new?type=${group.kind}&groupKey=${encodeURIComponent(group.key)}`;

	const isLate = group.kind === "table" && isGroupLate(group, now);
	const allDone = group.kind === "table" && isGroupFullyMarkedDone(group);
	const lateByMs = isLate ? getGroupLateByMs(group, now) : 0;
	const hasOrdersInGroup = group.orders.length > 0;
	const billingPending = isActionPending(`bill:${group.key}`);
	const drinkPending = isActionPending(`drink:${group.key}`);
	const compPending = isActionPending(`comp:${group.key}`);
	const kidPending = isActionPending(`kid:${group.key}`);
	const drinkServed = isTableWelcomeDrinkServed(group);
	const compServed = isTableComplementaryServed(group);
	const kidServed = isTableKidMenuServed(group);
	const kidEnabled = isTableKidMenuEnabled(group);
	const showTableService = group.kind === "table";
	const groupCustomer = getGroupCustomerDetails(group);
	const hasGroupCustomer =
		groupCustomer.name !== undefined || groupCustomer.phone !== undefined;
	const groupNotes = getGroupNotes(group);
	const groupPax = getGroupPax(group);
	const notesPending = isActionPending(`notes:${group.key}`);
	const changeTablePending = isActionPending(`move-table:${group.key}`);
	const [moreOpen, setMoreOpen] = useState(false);
	const [namePopoverOpen, setNamePopoverOpen] = useState(false);

	const statusDots: ReactNode[] = [];
	if (drinkServed) {
		statusDots.push(
			<TableStatusDot key="drink" label="Welcome drink served">
				🥤
			</TableStatusDot>
		);
	}
	if (compServed) {
		statusDots.push(
			<TableStatusDot key="comp" label="Complementary served">
				🫓
			</TableStatusDot>
		);
	}
	if (groupPax != null) {
		statusDots.push(
			<TableStatusDot key="pax" label={`${groupPax} pax`} done={false}>
				{groupPax}
			</TableStatusDot>
		);
	}
	if (kidEnabled) {
		statusDots.push(
			<TableStatusDot
				key="kid"
				label={kidServed ? "Kid menu served" : "Kid menu"}
				done={kidServed}
			>
				👶
			</TableStatusDot>
		);
	}

	return (
		<div className="relative">
			{statusDots.length > 0 ? (
				<div className="absolute -top-2 -right-2 z-0 flex flex-wrap justify-end gap-1 max-w-[60%] pointer-events-none">
					{statusDots}
				</div>
			) : null}
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
				<div className="flex justify-center border-b border-red-200 bg-red-50 px-3 py-1.5">
					<span
						className="inline-flex items-center rounded-full bg-red-600 px-3 py-0.5 text-xs font-bold text-white shadow-sm whitespace-nowrap"
						aria-label={`Late by ${formatLateDuration(lateByMs)}`}
					>
						Late {formatLateDuration(lateByMs)}
					</span>
				</div>
			) : null}
			<div className="flex flex-col space-y-1 p-4 pb-2">
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
					<button
						type="button"
						onClick={() => setNamePopoverOpen(true)}
						className="min-w-0 text-left touch-manipulation pt-1"
						aria-label={`Show full name for ${group.label}`}
					>
						<h3 className="text-base font-semibold truncate">{group.label}</h3>
					</button>
					<div className="flex items-center gap-1 shrink-0 flex-nowrap">
						<button
							type="button"
							onClick={() => setMoreOpen(true)}
							className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 touch-manipulation"
							aria-label={`More actions for ${group.label}`}
						>
							<MoreVerticalIcon className="w-5 h-5" />
						</button>
						<Link
							href={addOrderHref}
							className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200 border border-green-300 touch-manipulation"
							aria-label={`Add order to ${group.label}`}
						>
							<PlusIcon className="w-5 h-5 shrink-0" />
						</Link>
					</div>
				</div>
				{hasGroupCustomer ? (
					<div className="flex items-center gap-2 flex-wrap text-sm font-medium text-gray-700">
						{groupCustomer.name ? <span>{groupCustomer.name}</span> : null}
						{groupCustomer.name && groupCustomer.phone ? (
							<span className="text-gray-400">·</span>
						) : null}
						{groupCustomer.phone ? (
							<span className="inline-flex items-center gap-1.5">
								<span>{groupCustomer.phone}</span>
								<a
									href={`tel:${groupCustomer.phone}`}
									className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-300 touch-manipulation"
									aria-label={`Call ${groupCustomer.phone}`}
								>
									<PhoneIcon className="w-3.5 h-3.5 shrink-0" />
								</a>
							</span>
						) : null}
					</div>
				) : null}
				{groupNotes ? (
					<p className="text-xs text-gray-600 leading-relaxed">
						<span className="font-semibold text-gray-700">Note:</span>{" "}
						{groupNotes}
					</p>
				) : null}
				<p className="text-xs text-gray-500">
					{group.orders.length} order{group.orders.length === 1 ? "" : "s"}
				</p>
			</div>
			<div className="px-4 pb-4 pt-0 space-y-2">
				{group.orders.map((order) => (
					<OrderRow
						key={order.id}
						order={order}
						onEdit={onEditOrder}
						onKotPrint={onKotPrint}
						onRequestMarkDone={onRequestMarkDone}
						onRequestCancelItem={onRequestCancelItem}
						onRequestToggleParcel={onRequestToggleParcel}
					/>
				))}
			</div>
			</div>
			{namePopoverOpen ? (
				<TableNamePopover
					label={group.label}
					onClose={() => setNamePopoverOpen(false)}
				/>
			) : null}
			{moreOpen ? (
				<TableGroupMoreSheet
					group={group}
					hasOrdersInGroup={hasOrdersInGroup}
					groupPax={groupPax}
					groupNotes={groupNotes}
					showTableService={showTableService}
					drinkServed={drinkServed}
					compServed={compServed}
					kidEnabled={kidEnabled}
					kidServed={kidServed}
					billingPending={billingPending}
					changeTablePending={changeTablePending}
					drinkPending={drinkPending}
					compPending={compPending}
					kidPending={kidPending}
					notesPending={notesPending}
					onBill={onBill}
					onChangeTable={onChangeTable}
					onEditNotes={onEditNotes}
					onRequestWelcomeDrink={onRequestWelcomeDrink}
					onRequestComplementary={onRequestComplementary}
					onRequestKidMenu={onRequestKidMenu}
					onClose={() => setMoreOpen(false)}
				/>
			) : null}
		</div>
	);
}

function ChangeTableSheetModal({
	group,
	selectedTables,
	occupiedTables,
	onToggleTable,
	onContinue,
	onClose,
}: {
	group: OrderGroup;
	selectedTables: number[];
	occupiedTables: Set<number>;
	onToggleTable: (tableNumber: number) => void;
	onContinue: () => void;
	onClose: () => void;
}) {
	const currentTables = group.tableNumbers ?? [];
	const canContinue =
		selectedTables.length > 0 &&
		!tableNumbersEqual(selectedTables, currentTables);

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl bg-white shadow-xl max-h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-lg font-bold">Change table</h2>
						<button
							type="button"
							onClick={onClose}
							className="text-sm font-semibold text-gray-500 hover:text-black touch-manipulation"
						>
							Close
						</button>
					</div>
					<p className="text-sm text-gray-600 mt-2">
						Select available table(s) for {group.label}. Tap to toggle seats.
					</p>
				</div>
				<div className="overflow-y-auto flex-1 px-5 py-4">
					<div className="grid grid-cols-5 gap-2">
						{Array.from({ length: TABLE_COUNT }, (_, index) => index + 1).map(
							(tableNumber) => {
								const isSelected = selectedTables.includes(tableNumber);
								const isDisabled = !isTableAvailableForGroupMove(
									tableNumber,
									group,
									occupiedTables
								);

								return (
									<button
										key={tableNumber}
										type="button"
										disabled={isDisabled}
										onClick={() => onToggleTable(tableNumber)}
										aria-label={
											isDisabled
												? `Table ${tableNumber} occupied`
												: `Table ${tableNumber}`
										}
										className={`relative py-2 rounded-lg text-sm font-bold transition-colors touch-manipulation ${
											isDisabled
												? "bg-gray-200 text-gray-400 cursor-not-allowed"
												: isSelected
													? "bg-green-500 text-white"
													: "bg-gray-100 text-gray-800 hover:bg-gray-200"
										}`}
									>
										{tableNumber}
										{isDisabled ? (
											<span className="absolute -top-1 -right-1 flex h-[1.1rem] w-[1.1rem] items-center justify-center rounded-full bg-amber-500 text-white text-[10px] leading-none shadow-sm">
												🪑
											</span>
										) : null}
									</button>
								);
							}
						)}
					</div>
					{selectedTables.length > 0 ? (
						<p className="text-sm font-medium text-gray-700 mt-4">
							Selected: {formatTableGroupLabel(selectedTables)}
							{tableNumbersEqual(selectedTables, currentTables) ? (
								<span className="text-gray-500 font-normal">
									{" "}
									(same as current)
								</span>
							) : null}
						</p>
					) : (
						<p className="text-sm text-red-600 mt-4">
							Select at least one table.
						</p>
					)}
				</div>
				<div className="border-t px-5 py-4">
					<TouchActionButton
						onClick={onContinue}
						disabled={!canContinue}
						className="w-full bg-green-500 border border-green-600 text-white active:bg-green-600 disabled:opacity-40"
					>
						Continue
					</TouchActionButton>
				</div>
			</div>
		</div>
	);
}

function WaterBottlesModal({
	groupLabel,
	value,
	onChange,
	onConfirm,
	onCancel,
	confirming,
}: {
	groupLabel: string;
	value: string;
	onChange: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
	confirming?: boolean;
}) {
	const parsedCount = parseInt(value.trim(), 10);
	const count = Number.isNaN(parsedCount) ? 0 : parsedCount;

	const decrement = () => {
		onChange(String(Math.max(0, count - 1)));
	};

	const increment = () => {
		onChange(String(Math.min(999, count + 1)));
	};

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
					<h2 className="text-lg font-bold">Water bottles</h2>
					<p className="text-sm text-gray-600 mt-2">
						How many water bottles for {groupLabel}?
					</p>
					<label htmlFor="water-bottle-count" className="sr-only">
						Water bottle count
					</label>
					<div className="mt-4 flex items-center justify-center gap-3">
						<button
							type="button"
							onClick={decrement}
							disabled={confirming || count <= 0}
							className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xl leading-none touch-manipulation disabled:opacity-40"
							aria-label="Decrease water bottles"
						>
							-
						</button>
						<input
							id="water-bottle-count"
							type="text"
							inputMode="numeric"
							value={value}
							onChange={(event) =>
								onChange(event.target.value.replace(/\D/g, "").slice(0, 3))
							}
							className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center touch-manipulation"
							autoFocus
						/>
						<button
							type="button"
							onClick={increment}
							disabled={confirming || count >= 999}
							className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-xl leading-none touch-manipulation disabled:opacity-40"
							aria-label="Increase water bottles"
						>
							+
						</button>
					</div>
					<p className="text-xs text-gray-500 mt-2">
						Uses the &quot;{WATER_DISH_NAME}&quot; menu item. Adjust if needed
						before billing.
					</p>
				</div>
				<ConfirmModalActions
					onCancel={onCancel}
					onConfirm={onConfirm}
					confirmLabel="Continue to bill"
					confirming={confirming}
					cancelDisabled={confirming}
				/>
			</div>
		</div>
	);
}

function ConfirmOrderActionModal({
	title,
	message,
	confirmLabel,
	cancelLabel,
	confirming,
	onConfirm,
	onCancel,
}: {
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel?: string;
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
					cancelLabel={cancelLabel}
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
	onRequestCancelUnit,
	aggregatesView,
}: {
	group: ItemGroup;
	orders: TOrder[];
	onToggleUnit: (dishName: string, wasFulfilled: boolean) => Promise<void>;
	onRequestCancelUnit: (unit: ItemGroup["units"][number]) => void;
	aggregatesView: boolean;
}) {
	const [pendingAction, setPendingAction] = useState<{
		unitIndex: number;
		wasFulfilled: boolean;
	} | null>(null);
	const [confirmingToggle, setConfirmingToggle] = useState(false);

	const pendingUnit =
		pendingAction != null ? group.units[pendingAction.unitIndex] : null;

	const dishAggregates = useMemo(() => {
		const map = new Map<
			string,
			{ totalQty: number; pendingQty: number; fulfilledQty: number; cancelledQty: number }
		>();
		for (const unit of group.units) {
			const entry = map.get(unit.dishName) ?? {
				totalQty: 0,
				pendingQty: 0,
				fulfilledQty: 0,
				cancelledQty: 0,
			};
			entry.totalQty += 1;
			if (unit.cancelled) {
				entry.cancelledQty += 1;
			} else if (unit.fulfilled) {
				entry.fulfilledQty += 1;
			} else {
				entry.pendingQty += 1;
			}
			map.set(unit.dishName, entry);
		}
		return Array.from(map.entries())
			.map(([dishName, counts]) => ({ dishName, ...counts }))
			.sort((a, b) => a.dishName.localeCompare(b.dishName));
	}, [group.units]);

	return (
		<div className="rounded-xl border bg-white shadow-md">
			<div className="p-6 pb-3">
				<h3 className="text-lg font-semibold">{group.name}</h3>
				<p className="text-xs text-gray-500 mt-1">
					{aggregatesView
						? `${dishAggregates.length} dish${dishAggregates.length === 1 ? "" : "es"} · ${group.totalQty} total`
						: `${group.remainingQty} of ${group.totalQty} pending`}
				</p>
			</div>
			{aggregatesView ? (
				<ul className="px-4 pb-6 space-y-1">
					{dishAggregates.map(
						({ dishName, totalQty, pendingQty, fulfilledQty, cancelledQty }) => (
							<li
								key={dishName}
								className="flex items-center gap-3 min-h-[52px] px-2 rounded-lg"
							>
								<QtyBadge qty={totalQty} />
								<p className="text-base font-medium leading-snug min-w-0 flex-1">
									{dishName}
								</p>
								<div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
									{pendingQty > 0 ? (
										<span className="text-xs font-medium text-amber-700">
											{pendingQty} pending
										</span>
									) : null}
									{fulfilledQty > 0 ? (
										<span className="text-xs font-medium text-green-700">
											{fulfilledQty} ready
										</span>
									) : null}
									{cancelledQty > 0 ? (
										<span className="text-xs font-medium text-red-600">
											{cancelledQty} cancelled
										</span>
									) : null}
								</div>
							</li>
						)
					)}
				</ul>
			) : (
			<ul className="px-4 pb-6 space-y-1">
				{group.units.map((unit, index) => {
					const canCheck = isUnitNextToFulfill(orders, unit);
					const canUncheck = isUnitLastFulfilled(orders, unit);
					const canCancel = isUnitPending(unit);
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
							className={`flex items-center gap-2 text-sm min-h-[52px] px-2 rounded-lg ${
								unit.cancelled ? "bg-red-50/70" : ""
							}`}
						>
							<button
								type="button"
								disabled={(!interactive && !rowPending) || unit.cancelled}
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
									unit.cancelled
										? `${unit.dishName} cancelled`
										: unit.fulfilled
											? `Mark ${unit.dishName} as pending`
											: `Mark ${unit.dishName} as ready`
								}
								aria-busy={rowPending}
							>
								{rowPending ? (
									<LoadingSpinner className="h-6 w-6 text-gray-700" />
								) : unit.cancelled ? (
									<CrossIcon className="h-7 w-7 text-red-500" />
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
								<p
									className={`text-base font-medium truncate leading-snug ${
										unit.cancelled ? "line-through text-gray-400" : ""
									}`}
								>
									{unit.dishName}
								</p>
								<p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
									<span>{formatOrderTime(unit.createdAt)}</span>
									<QtyBadge qty={1} />
									{unit.cancelled && unit.cancelReason ? (
										<span className="text-red-600 font-medium">
											{itemCancelReasonLabel(unit.cancelReason)}
										</span>
									) : null}
								</p>
							</div>
							{canCancel ? (
								<button
									type="button"
									onClick={() => onRequestCancelUnit(unit)}
									className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 touch-manipulation active:bg-red-100"
									aria-label={`Cancel ${unit.dishName}`}
								>
									<CrossIcon className="w-5 h-5" />
								</button>
							) : null}
						</li>
					);
				})}
			</ul>
			)}

			{!aggregatesView && pendingAction && pendingUnit && (
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
	const [orders, setOrders] = useState<TOrder[]>([]);
	const [groups, setGroups] = useState<OrderGroup[]>([]);
	const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<TabId>("tables");
	const [tableOrdersView, setTableOrdersView] = useState<TableOrdersView>("groups");
	const [selectedTableFilters, setSelectedTableFilters] = useState<number[]>([]);
	const [itemsAggregatesView, setItemsAggregatesView] = useState(false);
	const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
	const [readyModalOpen, setReadyModalOpen] = useState(false);
	const [editingOrder, setEditingOrder] = useState<TOrder | null>(null);
	const [pendingMarkDone, setPendingMarkDone] = useState<TOrder | null>(null);
	const [pendingWelcomeDrink, setPendingWelcomeDrink] =
		useState<OrderGroup | null>(null);
	const [pendingComplementary, setPendingComplementary] =
		useState<OrderGroup | null>(null);
	const [pendingKidMenu, setPendingKidMenu] = useState<OrderGroup | null>(null);
	const [pendingBillGroup, setPendingBillGroup] = useState<OrderGroup | null>(
		null
	);
	const [waterBottleDraft, setWaterBottleDraft] = useState("");
	const [changeTableGroup, setChangeTableGroup] = useState<OrderGroup | null>(
		null
	);
	const [changeTableDraft, setChangeTableDraft] = useState<number[]>([]);
	const [pendingChangeTableConfirm, setPendingChangeTableConfirm] = useState<{
		group: OrderGroup;
		newTables: number[];
	} | null>(null);
	const [pendingCloseTable, setPendingCloseTable] = useState<OrderGroup | null>(
		null
	);
	const [editingNotesGroup, setEditingNotesGroup] = useState<OrderGroup | null>(
		null
	);
	const [notesDraft, setNotesDraft] = useState("");
	const [pendingCancelItem, setPendingCancelItem] = useState<{
		orderId: string;
		itemIndex: number;
		unitIndex: number;
		dishName: string;
	} | null>(null);
	const [pendingParcelItem, setPendingParcelItem] = useState<{
		orderId: string;
		itemIndex: number;
		unitIndex: number;
		dishName: string;
		isParcel: boolean;
	} | null>(null);
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

	const occupiedTables = useMemo(
		() => getOccupiedTableNumbers(orders),
		[orders]
	);

	const selectedTableFilterSet = useMemo(
		() => new Set(selectedTableFilters),
		[selectedTableFilters]
	);

	const filteredGroups = useMemo(() => {
		if (selectedTableFilterSet.size === 0) {
			return groups;
		}
		return groups.filter((group) =>
			groupMatchesTableFilter(group, selectedTableFilterSet)
		);
	}, [groups, selectedTableFilterSet]);

	const filteredItemGroups = useMemo(() => {
		if (selectedTableFilterSet.size === 0) {
			return itemGroups;
		}
		return itemGroups
			.map((group) =>
				filterItemGroupByTables(group, orders, selectedTableFilterSet)
			)
			.filter((group): group is ItemGroup => group != null);
	}, [itemGroups, orders, selectedTableFilterSet]);

	const chronologicalOrders = useMemo(
		() =>
			filteredGroups
				.flatMap((group) => group.orders)
				.sort((a, b) => a.createdAt - b.createdAt),
		[filteredGroups]
	);

	const toggleTableFilter = useCallback((tableNumber: number) => {
		setSelectedTableFilters((current) =>
			current.includes(tableNumber)
				? current.filter((value) => value !== tableNumber)
				: [...current, tableNumber].sort((a, b) => a - b)
		);
	}, []);

	const clearTableFilters = useCallback(() => {
		setSelectedTableFilters([]);
	}, []);

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

	const handleRequestCancelItem = (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => {
		const item = order.items[itemIndex];
		if (!item || !isOrderEditable(order)) {
			return;
		}
		setPendingCancelItem({
			orderId: order.id,
			itemIndex,
			unitIndex,
			dishName: item.name,
		});
	};

	const handleRequestCancelUnit = (unit: ItemGroup["units"][number]) => {
		const order = orders.find((entry) => entry.id === unit.orderId);
		if (!order || !isOrderEditable(order)) {
			return;
		}
		setPendingCancelItem({
			orderId: unit.orderId,
			itemIndex: unit.itemIndex,
			unitIndex: unit.unitIndex,
			dishName: unit.dishName,
		});
	};

	const handleCancelItem = async (reason: ItemCancelReason) => {
		if (!pendingCancelItem) {
			return;
		}
		const key = `cancel:${pendingCancelItem.orderId}:${pendingCancelItem.itemIndex}:${pendingCancelItem.unitIndex}`;
		await runConfirmingAction(key, async () => {
			await persistOrders(
				cancelItemUnit(
					orders,
					pendingCancelItem.orderId,
					pendingCancelItem.itemIndex,
					pendingCancelItem.unitIndex,
					reason
				)
			);
			setPendingCancelItem(null);
		});
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

	const handleKidMenu = async (group: OrderGroup) => {
		await runConfirmingAction(`kid:${group.key}`, async () => {
			await persistOrders(markTableKidMenuServed(orders, group));
			setPendingKidMenu(null);
		});
	};

	const handleRequestToggleParcel = (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => {
		const item = order.items[itemIndex];
		if (!item) {
			return;
		}
		const display = getOrderItemUnitDisplay(item, unitIndex);
		if (display !== "pending" && display !== "fulfilled") {
			return;
		}
		setPendingParcelItem({
			orderId: order.id,
			itemIndex,
			unitIndex,
			dishName: item.name,
			isParcel: isItemUnitParcel(item, unitIndex),
		});
	};

	const handleToggleParcel = async () => {
		if (!pendingParcelItem) {
			return;
		}
		const { orderId, itemIndex, unitIndex } = pendingParcelItem;
		const order = orders.find((entry) => entry.id === orderId);
		const item = order?.items[itemIndex];
		const unitDisplay = item
			? getOrderItemUnitDisplay(item, unitIndex)
			: null;
		if (
			!order ||
			!item ||
			(unitDisplay !== "pending" && unitDisplay !== "fulfilled")
		) {
			setPendingParcelItem(null);
			return;
		}
		const key = `parcel:${orderId}:${itemIndex}:${unitIndex}`;
		await runConfirmingAction(key, async () => {
			await persistOrders(
				toggleItemUnitParcel(orders, orderId, itemIndex, unitIndex)
			);
			setPendingParcelItem(null);
		});
	};

	const openNotesModal = (group: OrderGroup) => {
		setEditingNotesGroup(group);
		setNotesDraft(getGroupNotes(group) ?? "");
	};

	const handleSaveGroupNotes = async () => {
		if (!editingNotesGroup) {
			return;
		}
		await runPendingAction(`notes:${editingNotesGroup.key}`, async () => {
			await persistOrders(
				updateGroupNotes(orders, editingNotesGroup, notesDraft)
			);
			setEditingNotesGroup(null);
			setNotesDraft("");
		});
	};

	const handleKotPrint = (order: TOrder) => {
		router.push(`/kot?orderId=${encodeURIComponent(order.id)}`);
	};

	const openChangeTableModal = (group: OrderGroup) => {
		setChangeTableGroup(group);
		setChangeTableDraft(normalizeTableNumbers(group.tableNumbers ?? []));
	};

	const toggleChangeTableDraft = (tableNumber: number) => {
		if (!changeTableGroup) {
			return;
		}
		if (!isTableAvailableForGroupMove(tableNumber, changeTableGroup, occupiedTables)) {
			return;
		}
		setChangeTableDraft((current) =>
			current.includes(tableNumber)
				? current.filter((value) => value !== tableNumber)
				: [...current, tableNumber].sort((a, b) => a - b)
		);
	};

	const handleChangeTableContinue = () => {
		if (!changeTableGroup) {
			return;
		}
		const newTables = normalizeTableNumbers(changeTableDraft);
		if (newTables.length === 0) {
			alert("Select at least one table.");
			return;
		}
		if (tableNumbersEqual(newTables, changeTableGroup.tableNumbers ?? [])) {
			alert("Choose a different table or seat combination.");
			return;
		}
		if (!canMoveTableGroupToTables(orders, changeTableGroup, newTables)) {
			alert("One or more selected tables are already occupied.");
			return;
		}
		setPendingChangeTableConfirm({
			group: changeTableGroup,
			newTables,
		});
		setChangeTableGroup(null);
		setChangeTableDraft([]);
	};

	const handleConfirmChangeTable = async () => {
		if (!pendingChangeTableConfirm) {
			return;
		}
		const { group, newTables } = pendingChangeTableConfirm;
		const key = `move-table:${group.key}`;
		await runConfirmingAction(key, async () => {
			await persistOrders(
				moveTableGroupToTables(orders, group, newTables)
			);
			setPendingChangeTableConfirm(null);
		});
	};

	const proceedToBill = async (group: OrderGroup) => {
		if (!groupHasBillableItems(group)) {
			if (group.orders.length > 0) {
				setPendingCloseTable(group);
			}
			return;
		}
		const cart = await orderGroupToBillCart(group);
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

	const handleBill = (group: OrderGroup) => {
		if (!groupHasBillableItems(group)) {
			if (group.orders.length > 0) {
				setPendingCloseTable(group);
			}
			return;
		}

		if (group.kind === "table") {
			setPendingBillGroup(group);
			setWaterBottleDraft(String(getGroupWaterBottleCount(group)));
			return;
		}

		void runPendingAction(`bill:${group.key}`, () => proceedToBill(group));
	};

	const handleConfirmBillWithWater = async () => {
		if (!pendingBillGroup) {
			return;
		}

		const targetQty = parseInt(waterBottleDraft.trim(), 10);
		if (Number.isNaN(targetQty) || targetQty < 0) {
			alert("Enter a valid water bottle count.");
			return;
		}

		const groupKey = pendingBillGroup.key;
		await runPendingAction(`bill:${groupKey}`, async () => {
			const waterPrice = await getWaterBottlePrice();
			const currentQty = getGroupWaterBottleCount(pendingBillGroup);
			let billingGroup = pendingBillGroup;

			if (targetQty !== currentQty) {
				const delta = targetQty - currentQty;
				const updatedOrders = syncGroupWaterBottleCount(
					orders,
					pendingBillGroup,
					targetQty,
					waterPrice
				);
				await persistOrders(updatedOrders);

				const dateKey = getTodayDateKey();
				const waterItem = {
					name: WATER_DISH_NAME,
					price: waterPrice,
					qty: Math.abs(delta),
				};
				if (delta > 0) {
					await decrementInventoryForOrder(dateKey, [waterItem]);
				} else if (delta < 0) {
					await replenishInventoryForOrder(dateKey, [waterItem]);
				}

				const refreshedGroup = groupOrdersByTable(updatedOrders).find(
					(group) => group.key === groupKey
				);
				if (!refreshedGroup) {
					return;
				}
				billingGroup = refreshedGroup;
			}

			await proceedToBill(billingGroup);
			setPendingBillGroup(null);
			setWaterBottleDraft("");
		});
	};

	const handleCloseTable = async (group: OrderGroup) => {
		await runConfirmingAction(`close:${group.key}`, async () => {
			const billingContext: BillingContext = {
				source: "orders",
				groupKey: group.key,
				kind: group.kind,
				tableNumbers: group.tableNumbers ?? [],
				label: group.label,
			};
			const remaining = await closeTableFromBilling(billingContext);
			applyOrderState(remaining);
			setPendingCloseTable(null);
		});
	};

	const hasOrders = groups.length > 0;
	const hasFilteredOrders = filteredGroups.length > 0;
	const hasFilteredChronologicalOrders = chronologicalOrders.length > 0;
	const hasFilteredItems = filteredItemGroups.length > 0;

	const hasActiveViewFilters = useMemo(() => {
		if (selectedTableFilters.length > 0) {
			return true;
		}
		if (activeTab !== "tables") {
			return true;
		}
		if (tableOrdersView !== "groups") {
			return true;
		}
		return itemsAggregatesView;
	}, [
		selectedTableFilters,
		activeTab,
		tableOrdersView,
		itemsAggregatesView,
	]);

	const viewFilterSummary = useMemo(() => {
		const parts: string[] = [];
		if (activeTab === "tables") {
			parts.push(tableOrdersView === "groups" ? "By table" : "All orders");
		} else {
			parts.push(itemsAggregatesView ? "Aggregates" : "Each item");
		}
		if (selectedTableFilters.length > 0) {
			parts.push(
				selectedTableFilters.length === 1
					? `Table ${selectedTableFilters[0]}`
					: `${selectedTableFilters.length} tables`
			);
		}
		return parts.join(" · ");
	}, [
		activeTab,
		tableOrdersView,
		itemsAggregatesView,
		selectedTableFilters,
	]);

	return (
		<div className="ops-app-screen">
			<div className="sticky top-0 z-20 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-transparent pointer-events-none">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pointer-events-auto">
					<OpsMenuButton />
					<div className="flex justify-center min-w-0 px-1">
						<div className="rounded-full bg-white border border-gray-200/80 shadow-md px-4 py-2 min-h-[44px] max-w-full flex flex-col justify-center">
							<h1 className="text-sm font-bold text-gray-900 truncate text-center">
								Orders
							</h1>
							{hasActiveViewFilters ? (
								<p className="text-[10px] text-gray-500 truncate text-center leading-tight mt-0.5">
									{viewFilterSummary}
								</p>
							) : null}
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0 justify-end">
						<OrderOpsSyncIndicator />
						{readyOrders.length > 0 && (
							<button
								type="button"
								onClick={() => setReadyModalOpen(true)}
								className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold hover:bg-green-600 touch-manipulation px-2.5 shadow-md border border-green-600"
								aria-label={`${readyOrders.length} ready orders`}
							>
								{readyOrders.length}
							</button>
						)}
					</div>
				</div>
			</div>

			<div className="px-6 pb-6 pt-1 space-y-4">
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
						) : tableOrdersView === "orders" ? (
							!hasFilteredChronologicalOrders ? (
								<div className="text-center py-16 text-gray-500">
									<p className="text-lg font-medium mb-2">
										{selectedTableFilters.length > 0
											? "No orders for selected tables"
											: "No active orders"}
									</p>
									<p className="text-sm">
										{selectedTableFilters.length > 0
											? "Try another table filter or clear the filter."
											: "Tap the + button to place a new order"}
									</p>
								</div>
							) : (
								chronologicalOrders.map((order) => (
									<IndividualOrderCard
										key={order.id}
										order={order}
										now={now}
										onEdit={setEditingOrder}
										onKotPrint={handleKotPrint}
										onRequestMarkDone={setPendingMarkDone}
										onRequestCancelItem={handleRequestCancelItem}
										onRequestToggleParcel={handleRequestToggleParcel}
									/>
								))
							)
						) : !hasFilteredOrders ? (
							<div className="text-center py-16 text-gray-500">
								<p className="text-lg font-medium mb-2">
									{selectedTableFilters.length > 0
										? "No orders for selected tables"
										: "No active orders"}
								</p>
								<p className="text-sm">
									{selectedTableFilters.length > 0
										? "Try another table filter or clear the filter."
										: "Tap the + button to place a new order"}
								</p>
							</div>
						) : (
							filteredGroups.map((group) => (
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
									onRequestKidMenu={setPendingKidMenu}
									onRequestCancelItem={handleRequestCancelItem}
									onRequestToggleParcel={handleRequestToggleParcel}
									onEditNotes={openNotesModal}
									onChangeTable={openChangeTableModal}
								/>
							))
						)}
					</>
				) : !hasFilteredItems ? (
					<div className="text-center py-16 text-gray-500 text-sm">
						{selectedTableFilters.length > 0
							? "No items for selected tables"
							: "No items in active orders"}
					</div>
				) : (
					filteredItemGroups.map((group) => (
						<ItemGroupCard
							key={group.name}
							group={group}
							orders={orders}
							onToggleUnit={handleToggleDishUnit}
							onRequestCancelUnit={handleRequestCancelUnit}
							aggregatesView={itemsAggregatesView}
						/>
					))
				)}
			</div>

			<div className="fixed left-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20">
				<button
					type="button"
					onClick={() => setViewFiltersOpen(true)}
					className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 touch-manipulation"
					aria-label="View filters"
				>
					<FilterIcon className="w-5 h-5 shrink-0" />
					{hasActiveViewFilters ? (
						<span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white" />
					) : null}
				</button>
			</div>

			<button
				type="button"
				onClick={() => router.push("/order/new")}
				className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-green-500 text-white text-sm font-semibold shadow-lg px-4 hover:bg-green-600 touch-manipulation z-20"
				aria-label="New order"
			>
				<PlusIcon className="w-5 h-5 shrink-0" />
				Order
			</button>

			{viewFiltersOpen ? (
				<OrderViewFiltersSheet
					activeTab={activeTab}
					onActiveTabChange={setActiveTab}
					tableOrdersView={tableOrdersView}
					onTableOrdersViewChange={setTableOrdersView}
					itemsAggregatesView={itemsAggregatesView}
					onItemsAggregatesViewChange={setItemsAggregatesView}
					selectedTables={selectedTableFilters}
					onToggleTable={toggleTableFilter}
					onClearTables={clearTableFilters}
					onClose={() => setViewFiltersOpen(false)}
				/>
			) : null}

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

			{pendingKidMenu && (
				<ConfirmOrderActionModal
					title="Kid menu served?"
					message={`Is kid menu served for ${pendingKidMenu.label}?`}
					confirmLabel="Yes, served"
					confirming={confirmingAction === `kid:${pendingKidMenu.key}`}
					onCancel={() => setPendingKidMenu(null)}
					onConfirm={() => void handleKidMenu(pendingKidMenu)}
				/>
			)}

			{changeTableGroup && (
				<ChangeTableSheetModal
					group={changeTableGroup}
					selectedTables={changeTableDraft}
					occupiedTables={occupiedTables}
					onToggleTable={toggleChangeTableDraft}
					onContinue={handleChangeTableContinue}
					onClose={() => {
						setChangeTableGroup(null);
						setChangeTableDraft([]);
					}}
				/>
			)}

			{pendingChangeTableConfirm && (
				<ConfirmOrderActionModal
					title="Change table?"
					message={`Move ${pendingChangeTableConfirm.group.label} to ${formatTableGroupLabel(pendingChangeTableConfirm.newTables)}? All orders in this group will be updated.`}
					confirmLabel="Change table"
					confirming={
						confirmingAction ===
						`move-table:${pendingChangeTableConfirm.group.key}`
					}
					onCancel={() => {
						if (
							confirmingAction ===
							`move-table:${pendingChangeTableConfirm.group.key}`
						) {
							return;
						}
						setPendingChangeTableConfirm(null);
					}}
					onConfirm={() => void handleConfirmChangeTable()}
				/>
			)}

			{pendingBillGroup && (
				<WaterBottlesModal
					groupLabel={pendingBillGroup.label}
					value={waterBottleDraft}
					onChange={setWaterBottleDraft}
					confirming={confirmingAction === `bill:${pendingBillGroup.key}`}
					onCancel={() => {
						if (confirmingAction === `bill:${pendingBillGroup.key}`) {
							return;
						}
						setPendingBillGroup(null);
						setWaterBottleDraft("");
					}}
					onConfirm={() => void handleConfirmBillWithWater()}
				/>
			)}

			{pendingCloseTable && (
				<ConfirmOrderActionModal
					title="Nothing to bill"
					message={`All items on ${pendingCloseTable.label} are cancelled or removed. ${
						pendingCloseTable.kind === "table"
							? "Close the table to clear it from active orders."
							: "Close this group to clear it from active orders."
					}`}
					confirmLabel={
						pendingCloseTable.kind === "table" ? "Close table" : "Close"
					}
					cancelLabel="Don't do anything"
					confirming={confirmingAction === `close:${pendingCloseTable.key}`}
					onCancel={() => setPendingCloseTable(null)}
					onConfirm={() => void handleCloseTable(pendingCloseTable)}
				/>
			)}

			{editingNotesGroup && (
				<GroupNotesModal
					group={editingNotesGroup}
					draft={notesDraft}
					saving={Boolean(pendingActions[`notes:${editingNotesGroup.key}`])}
					onDraftChange={setNotesDraft}
					onClose={() => {
						setEditingNotesGroup(null);
						setNotesDraft("");
					}}
					onSave={() => void handleSaveGroupNotes()}
				/>
			)}

			{editingOrder && (
				<EditOrderModal
					order={editingOrder}
					onClose={() => setEditingOrder(null)}
					onSaved={() => loadOrders({ background: true })}
				/>
			)}

			{pendingParcelItem && (
				<ConfirmOrderActionModal
					title={
						pendingParcelItem.isParcel ? "Remove parcel?" : "Mark for parcel?"
					}
					message={
						pendingParcelItem.isParcel
							? `Remove parcel packing for ${pendingParcelItem.dishName}?`
							: `Mark ${pendingParcelItem.dishName} for parcel packing?`
					}
					confirmLabel={pendingParcelItem.isParcel ? "Remove parcel" : "Mark parcel"}
					confirming={
						confirmingAction ===
						`parcel:${pendingParcelItem.orderId}:${pendingParcelItem.itemIndex}:${pendingParcelItem.unitIndex}`
					}
					onCancel={() => setPendingParcelItem(null)}
					onConfirm={() => void handleToggleParcel()}
				/>
			)}

			{pendingCancelItem && (
				<CancelItemModal
					dishName={pendingCancelItem.dishName}
					confirming={
						confirmingAction ===
						`cancel:${pendingCancelItem.orderId}:${pendingCancelItem.itemIndex}:${pendingCancelItem.unitIndex}`
					}
					onCancel={() => setPendingCancelItem(null)}
					onConfirm={(reason) => void handleCancelItem(reason)}
				/>
			)}
		</div>
	);
}
