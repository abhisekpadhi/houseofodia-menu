"use client";

import { ItemGroup, OrderGroup, TCart, TMenuApiItem, TOrder, TOrdersStore, BillingContext, BILLING_CONTEXT_KEY, ItemCancelReason } from "@/src/models/common";
import {
	formatOrderLabel,
	formatOrderTime,
	getGroupCustomerDetails,
	getGroupNotes,
	fulfillNextUnitForDish,
	getGroupLateByMs,
	getOrderItemUnitDisplay,
	getReadyOrders,
	getItemUnitStates,
	getUnitCancelReason,
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
	isUnitPending,
	maintainOrders,
	markOrderDone,
	markTableComplementaryServed,
	markTableWelcomeDrinkServed,
	orderGroupToCart,
	ordersStoreChanged,
	isUnitLastFulfilled,
	isUnitNextToFulfill,
	unfulfillLastUnitForDish,
	updateGroupNotes,
	updateOrders,
	cancelItemUnit,
} from "@/src/utils/order_utils";
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

function NoteIcon({ className }: { className?: string }) {
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
			<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
			<path d="M15 3v4a2 2 0 0 0 2 2h4" />
			<path d="M8 13h6" />
			<path d="M8 17h4" />
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
}) {
	const markedDone = isOrderMarkedDone(order);
	const editable = isOrderEditable(order);
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
						? "Mark each item ready or cancelled on the By item tab, or cancel from here"
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
									{unitDisplays.map((display, unitIndex) => (
										<span
											key={unitIndex}
											className="inline-flex items-center gap-0.5"
											title={
												display === "cancelled" && cancelReasons[unitIndex]
													? itemCancelReasonLabel(cancelReasons[unitIndex]!)
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
											{display === "pending" && editable ? (
												<button
													type="button"
													onClick={() =>
														onRequestCancelItem(order, itemIndex, unitIndex)
													}
													className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 touch-manipulation active:bg-red-100"
													aria-label={`Cancel ${item.name}`}
												>
													<CrossIcon className="w-5 h-5" />
												</button>
											) : null}
										</span>
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
	onRequestCancelItem,
	onEditNotes,
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
	onRequestCancelItem: (
		order: TOrder,
		itemIndex: number,
		unitIndex: number
	) => void;
	onEditNotes: (group: OrderGroup) => void;
}) {
	const addOrderHref =
		group.kind === "table" && group.tableNumbers?.length
			? `/order/new?tables=${group.tableNumbers.join(",")}`
			: `/order/new?type=${group.kind}&groupKey=${encodeURIComponent(group.key)}`;

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
	const groupCustomer = getGroupCustomerDetails(group);
	const hasGroupCustomer =
		groupCustomer.name !== undefined || groupCustomer.phone !== undefined;
	const groupNotes = getGroupNotes(group);
	const notesPending = isActionPending(`notes:${group.key}`);

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
					<div className="flex items-center gap-2 shrink-0">
						<button
							type="button"
							onClick={() => onEditNotes(group)}
							disabled={notesPending}
							className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full touch-manipulation transition-colors disabled:opacity-50 ${
								groupNotes
									? "bg-green-500 text-white hover:bg-green-600 active:bg-green-700"
									: "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
							}`}
							aria-label={groupNotes ? "Edit table notes" : "Add table notes"}
						>
							{notesPending ? (
								<LoadingSpinner
									className={`h-4 w-4 shrink-0 ${groupNotes ? "text-white" : "text-gray-600"}`}
								/>
							) : (
								<NoteIcon className="w-4 h-4 shrink-0" />
							)}
						</button>
						<Link
							href={addOrderHref}
							className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 touch-manipulation px-3 shrink-0"
							aria-label={`Add order to ${group.label}`}
						>
							<PlusIcon className="w-4 h-4 shrink-0" />
							<span className="text-xs font-semibold">add order</span>
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
									className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-300 touch-manipulation"
									aria-label={`Call ${groupCustomer.phone}`}
								>
									<PhoneIcon className="w-4 h-4 shrink-0" />
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
				{showTableService ? (
					<div className="flex items-center gap-2 flex-wrap pt-1">
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
						onEdit={onEditOrder}
						onKotPrint={onKotPrint}
						onRequestMarkDone={onRequestMarkDone}
						onRequestCancelItem={onRequestCancelItem}
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
									className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 touch-manipulation active:bg-red-100"
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
	const [inventoryNavPending, startInventoryNav] = useTransition();
	const [orders, setOrders] = useState<TOrder[]>([]);
	const [groups, setGroups] = useState<OrderGroup[]>([]);
	const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<TabId>("tables");
	const [itemsAggregatesView, setItemsAggregatesView] = useState(false);
	const [readyModalOpen, setReadyModalOpen] = useState(false);
	const [editingOrder, setEditingOrder] = useState<TOrder | null>(null);
	const [pendingMarkDone, setPendingMarkDone] = useState<TOrder | null>(null);
	const [pendingWelcomeDrink, setPendingWelcomeDrink] =
		useState<OrderGroup | null>(null);
	const [pendingComplementary, setPendingComplementary] =
		useState<OrderGroup | null>(null);
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
							<div className="flex items-center gap-2 min-w-0">
								<OpsMenuButton />
								<h1 className="text-xl font-bold truncate">Orders</h1>
							</div>
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
								: itemsAggregatesView
									? "Grouped by kitchen section · totals per dish"
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

				{activeTab === "items" ? (
					<div className="flex gap-2 mt-3">
						<button
							type="button"
							onClick={() => setItemsAggregatesView(false)}
							className={`flex-1 min-h-[40px] py-2 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
								!itemsAggregatesView
									? "bg-gray-800 text-white"
									: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
							}`}
						>
							Each item
						</button>
						<button
							type="button"
							onClick={() => setItemsAggregatesView(true)}
							className={`flex-1 min-h-[40px] py-2 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
								itemsAggregatesView
									? "bg-gray-800 text-white"
									: "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-300"
							}`}
						>
							Aggregates
						</button>
					</div>
				) : null}
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
									onRequestCancelItem={handleRequestCancelItem}
									onEditNotes={openNotesModal}
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
							onRequestCancelUnit={handleRequestCancelUnit}
							aggregatesView={itemsAggregatesView}
						/>
					))
				)}
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
