"use client";

import { TDish, TOrder, TOrderItem } from "@/src/models/common";
import {
	LoadingSpinner,
	TouchIconButton,
} from "@/components/ui/touch-controls";
import {
	adjustInventoryForOrderEdit,
	canIncreaseOrderItemQty,
	getInventoryForDate,
	getMaxEditableQty,
	getTodayDateKey,
} from "@/src/utils/inventory_utils";
import { formatOrderTime, isOrderMarkedDone, updateOrderItems } from "@/src/utils/order_utils";
import { useEffect, useMemo, useState } from "react";

type EditOrderModalProps = {
	order: TOrder;
	onClose: () => void;
	onSaved: () => void;
};

function EditOrderBlockedModal({ onClose }: { onClose: () => void }) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl sm:rounded-xl bg-white shadow-xl p-6"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-lg font-bold">Order is done</h2>
				<p className="text-sm text-gray-600 mt-2">
					This order has been marked done and can no longer be edited.
				</p>
				<button
					type="button"
					onClick={onClose}
					className="mt-4 w-full min-h-[44px] rounded-lg bg-gray-100 text-sm font-semibold touch-manipulation active:bg-gray-200"
				>
					Close
				</button>
			</div>
		</div>
	);
}

function EditOrderModalContent({ order, onClose, onSaved }: EditOrderModalProps) {
	const [draftItems, setDraftItems] = useState<TOrderItem[]>(() =>
		order.items.map((item) => ({ ...item }))
	);
	const [inventory, setInventory] = useState<Record<string, number>>({});
	const [saving, setSaving] = useState(false);

	const originalItems = useMemo(
		(): TDish[] =>
			order.items.map((item) => ({
				name: item.name,
				qty: item.qty,
				price: item.price,
			})),
		[order.items]
	);

	const originalQtyByName = useMemo(() => {
		const map: Record<string, number> = {};
		for (const item of order.items) {
			map[item.name] = item.qty;
		}
		return map;
	}, [order.items]);

	useEffect(() => {
		void getInventoryForDate(getTodayDateKey()).then(setInventory);
	}, []);

	const hasChanges = useMemo(() => {
		const serialize = (items: TOrderItem[]) =>
			items
				.map((item) => `${item.name}:${item.qty}`)
				.sort()
				.join("|");

		return serialize(draftItems) !== serialize(order.items);
	}, [draftItems, order.items]);

	const handleIncrement = (index: number) => {
		const item = draftItems[index];
		const originalQty = originalQtyByName[item.name] ?? 0;
		const nextQty = item.qty + 1;

		if (!canIncreaseOrderItemQty(inventory, item.name, originalQty, nextQty)) {
			alert(`Not enough stock for ${item.name}.`);
			return;
		}

		setDraftItems((prev) =>
			prev.map((entry, entryIndex) =>
				entryIndex === index ? { ...entry, qty: nextQty } : entry
			)
		);
	};

	const handleDecrement = (index: number) => {
		setDraftItems((prev) => {
			const item = prev[index];
			if (item.qty <= 1) {
				return prev.filter((_, entryIndex) => entryIndex !== index);
			}
			return prev.map((entry, entryIndex) =>
				entryIndex === index ? { ...entry, qty: entry.qty - 1 } : entry
			);
		});
	};

	const handleSave = async () => {
		if (draftItems.length === 0) {
			const confirmed = window.confirm(
				"Remove all items from this order?"
			);
			if (!confirmed) {
				return;
			}
		}

		setSaving(true);
		try {
			const nextItems: TDish[] = draftItems.map((item) => ({
				name: item.name,
				qty: item.qty,
				price: item.price,
			}));

			for (const item of nextItems) {
				const originalQty = originalQtyByName[item.name] ?? 0;
				if (
					item.qty > originalQty &&
					!canIncreaseOrderItemQty(
						inventory,
						item.name,
						originalQty,
						item.qty
					)
				) {
					alert(`Not enough stock for ${item.name}.`);
					setSaving(false);
					return;
				}
			}

			await adjustInventoryForOrderEdit(
				getTodayDateKey(),
				originalItems,
				nextItems
			);
			await updateOrderItems(order.id, draftItems);
			onSaved();
			onClose();
		} catch (error) {
			console.error("Failed to update order:", error);
			alert("Failed to update order. Please try again.");
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl sm:rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="text-lg font-bold">Edit order</h2>
							<p className="text-sm text-gray-500 mt-1">
								{formatOrderTime(order.createdAt)}
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="text-sm font-semibold text-gray-500 hover:text-black shrink-0"
						>
							Close
						</button>
					</div>
				</div>

				<div className="overflow-y-auto flex-1 px-5 py-4">
					{draftItems.length === 0 ? (
						<p className="text-sm text-gray-500 text-center py-8">
							No items left. Save to remove this order.
						</p>
					) : (
						<ul className="space-y-3">
							{draftItems.map((item, index) => {
								const originalQty = originalQtyByName[item.name] ?? 0;
								const maxQty = getMaxEditableQty(
									inventory,
									item.name,
									originalQty
								);
								const canIncrement = item.qty < maxQty;

								return (
									<li
										key={`${item.name}-${index}`}
										className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3"
									>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-semibold truncate">
												{item.name}
											</p>
											<p className="text-xs text-gray-500 mt-0.5">
												₹{item.price} each · max {maxQty}
											</p>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<TouchIconButton
												onClick={() => handleDecrement(index)}
												ariaLabel={`Decrease ${item.name}`}
												className="bg-red-100 text-red-700 text-lg leading-none min-h-[44px] min-w-[44px]"
											>
												-
											</TouchIconButton>
											<span className="min-w-[1.5rem] text-center text-sm font-medium">
												{item.qty}
											</span>
											<TouchIconButton
												onClick={() => handleIncrement(index)}
												disabled={!canIncrement}
												ariaLabel={`Increase ${item.name}`}
												className={`text-lg leading-none min-h-[44px] min-w-[44px] ${
													canIncrement
														? "bg-green-100 text-green-700"
														: "bg-gray-100 text-gray-400"
												}`}
											>
												+
											</TouchIconButton>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<div className="border-t px-5 py-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						disabled={saving}
						className="flex-1 min-h-[44px] rounded-lg bg-gray-100 text-sm font-semibold touch-manipulation active:bg-gray-200 disabled:opacity-60"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={saving || !hasChanges}
						onClick={() => void handleSave()}
						aria-busy={saving}
						className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-50"
					>
						{saving ? (
							<LoadingSpinner className="h-4 w-4 text-white" />
						) : (
							"Save changes"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

export function EditOrderModal({ order, onClose, onSaved }: EditOrderModalProps) {
	if (isOrderMarkedDone(order)) {
		return <EditOrderBlockedModal onClose={onClose} />;
	}
	return <EditOrderModalContent order={order} onClose={onClose} onSaved={onSaved} />;
}
