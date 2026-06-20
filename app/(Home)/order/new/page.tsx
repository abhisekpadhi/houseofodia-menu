"use client";

import { MenuPicker } from "@/components/feature/order/menu-picker";
import { OrderOpsSyncIndicator } from "@/components/feature/order/order-ops-sync-indicator";
import { Button } from "@/components/ui/button";
import {
	OrderKind,
	TABLE_COUNT,
	TDish,
	TOrder,
} from "@/src/models/common";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import {
	decrementInventoryForOrder,
	getInventoryForDate,
	getTodayDateKey,
	isOutOfStock,
} from "@/src/utils/inventory_utils";
import {
	addOrder,
	CUSTOMER_PHONE_DIGITS,
	formatTableGroupLabel,
	generateOrderId,
	getCustomerContactFlagsForGroupKey,
	getOccupiedTableNumbers,
	getOrdersStore,
	getTableServiceFlagsForTables,
	isValidCustomerPhone,
	orderTotal,
	parseTableParam,
	formatCustomerContact,
} from "@/src/utils/order_utils";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function CartIcon({ className }: { className?: string }) {
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
			<circle cx="8" cy="21" r="1" />
			<circle cx="19" cy="21" r="1" />
			<path d="M2.05 2.05h2l1.5 9.5a2 2 0 0 0 2 1.7h9.7a2 2 0 0 0 2-1.7l1.3-7.3H5.1" />
		</svg>
	);
}

function OrderCartModal({
	items,
	total,
	onClose,
	onIncrement,
	onDecrement,
}: {
	items: TDish[];
	total: number;
	onClose: () => void;
	onIncrement: (item: TDish) => void;
	onDecrement: (item: TDish) => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-xl sm:rounded-xl bg-white shadow-xl max-h-[80vh] flex flex-col"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b flex items-center justify-between">
					<h2 className="text-lg font-bold">Order cart</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-sm font-semibold text-gray-500 hover:text-black"
					>
						Close
					</button>
				</div>
				<div className="overflow-y-auto flex-1 px-5 py-4">
					{items.length === 0 ? (
						<p className="text-sm text-gray-500 text-center py-8">
							No items in cart yet.
						</p>
					) : (
						<ul className="space-y-3">
							{items.map((item) => (
								<li
									key={item.name}
									className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3"
								>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold truncate">
											{item.name}
										</p>
										<p className="text-xs text-gray-500 mt-0.5">
											₹{item.price} each
										</p>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<button
											type="button"
											className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-700 text-lg leading-none"
											onClick={() => onDecrement(item)}
										>
											-
										</button>
										<span className="min-w-[1.5rem] text-center text-sm font-medium">
											{item.qty}
										</span>
										<button
											type="button"
											className="w-7 h-7 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-lg leading-none"
											onClick={() => onIncrement(item)}
										>
											+
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
				<div className="border-t px-5 py-4">
					<div className="flex items-center justify-between mb-3">
						<span className="text-sm text-gray-600">
							{items.length} item{items.length === 1 ? "" : "s"}
						</span>
						<span className="text-lg font-bold">₹{total}</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="w-full py-2.5 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}

function AddOrderContent() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [orderKind, setOrderKind] = useState<OrderKind>("table");
	const [selectedTables, setSelectedTables] = useState<number[]>([]);
	const [preselectedTables, setPreselectedTables] = useState<number[]>([]);
	const [preselectedGroupKey, setPreselectedGroupKey] = useState<string | null>(
		null
	);
	const [existingCustomerContact, setExistingCustomerContact] = useState<
		string | null
	>(null);
	const [occupiedTables, setOccupiedTables] = useState<Set<number>>(new Set());
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const [itemPrices, setItemPrices] = useState<Record<string, number>>({});
	const [inventory, setInventory] = useState<Record<string, number>>({});
	const [orderNotes, setOrderNotes] = useState("");
	const [customerName, setCustomerName] = useState("");
	const [customerPhone, setCustomerPhone] = useState("");
	const [placing, setPlacing] = useState(false);
	const [cartModalOpen, setCartModalOpen] = useState(false);
	const [inStockOnly, setInStockOnly] = useState(false);

	const isFromTableCard = preselectedTables.length > 0;
	const isFromExistingGroup = preselectedGroupKey !== null;

	useEffect(() => {
		getOrdersStore().then((store) => {
			setOccupiedTables(getOccupiedTableNumbers(store.orders));
		});
		getInventoryForDate(getTodayDateKey()).then(setInventory);
	}, []);

	useEffect(() => {
		const onOrderOpsUpdated = () => {
			getInventoryForDate(getTodayDateKey()).then(setInventory);
			getOrdersStore().then((store) => {
				setOccupiedTables(getOccupiedTableNumbers(store.orders));
			});
		};
		window.addEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
		return () => window.removeEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
	}, []);

	useEffect(() => {
		const typeParam = searchParams.get("type");
		const tablesParam = searchParams.get("tables");
		const groupKeyParam = searchParams.get("groupKey");

		if (typeParam === "takeaway" || typeParam === "delivery") {
			setOrderKind(typeParam);
			setSelectedTables([]);
			setPreselectedTables([]);
			setPreselectedGroupKey(groupKeyParam);
			if (groupKeyParam) {
				void getOrdersStore().then((store) => {
					const flags = getCustomerContactFlagsForGroupKey(
						store.orders,
						groupKeyParam,
						typeParam
					);
					setCustomerName(flags.customerName ?? "");
					setCustomerPhone(flags.customerPhone ?? "");
					setExistingCustomerContact(
						formatCustomerContact({
							id: "",
							createdAt: 0,
							kind: typeParam,
							tableNumbers: [],
							items: [],
							...flags,
						})
					);
				});
			} else {
				setCustomerName("");
				setCustomerPhone("");
				setExistingCustomerContact(null);
			}
			return;
		}

		setPreselectedGroupKey(null);
		setExistingCustomerContact(null);

		const parsedTables = parseTableParam(tablesParam);
		if (parsedTables.length > 0) {
			setOrderKind("table");
			setSelectedTables(parsedTables);
			setPreselectedTables(parsedTables);
		} else {
			setPreselectedTables([]);
		}
	}, [searchParams]);

	const isTableDisabled = (tableNumber: number) => {
		if (!occupiedTables.has(tableNumber)) {
			return false;
		}
		if (isFromTableCard && preselectedTables.includes(tableNumber)) {
			return false;
		}
		return true;
	};

	const cartItems = useMemo((): TDish[] => {
		return Object.entries(quantities)
			.filter(([, qty]) => qty > 0)
			.map(([name, qty]) => ({
				name,
				qty,
				price: itemPrices[name] ?? 0,
			}));
	}, [quantities, itemPrices]);

	const cartTotal = useMemo(() => orderTotal(cartItems), [cartItems]);
	const cartItemCount = useMemo(
		() => cartItems.reduce((sum, item) => sum + item.qty, 0),
		[cartItems]
	);

	const needsTableSelection =
		orderKind === "table" && selectedTables.length === 0;
	const needsCustomerDetails =
		(orderKind === "takeaway" || orderKind === "delivery") &&
		!isFromExistingGroup;
	const hasCustomerDetails =
		customerName.trim().length > 0 && isValidCustomerPhone(customerPhone);
	const canPlaceOrder =
		cartItems.length > 0 &&
		!needsTableSelection &&
		(!needsCustomerDetails || hasCustomerDetails);

	const canAddMore = (name: string) =>
		!isOutOfStock(inventory, name, quantities[name] ?? 0);

	const toggleTable = (tableNumber: number) => {
		if (isTableDisabled(tableNumber)) {
			return;
		}
		setOrderKind("table");
		setSelectedTables((prev) =>
			prev.includes(tableNumber)
				? prev.filter((t) => t !== tableNumber)
				: [...prev, tableNumber].sort((a, b) => a - b)
		);
	};

	const handleAddItem = (item: { name: string; price: string }) => {
		if (needsTableSelection) {
			alert("Select at least one table number.");
			return;
		}

		if (!canAddMore(item.name)) {
			return;
		}

		const priceNumber = parseFloat(item.price);
		const price = Number.isNaN(priceNumber) ? 0 : priceNumber;

		setItemPrices((prev) => ({ ...prev, [item.name]: price }));
		setQuantities((prev) => ({
			...prev,
			[item.name]: (prev[item.name] ?? 0) + 1,
		}));
	};

	const handleIncrement = (item: { name: string; price: string }) => {
		handleAddItem(item);
	};

	const handleDecrement = (item: { name: string }) => {
		setQuantities((prev) => {
			const current = prev[item.name] ?? 0;
			if (current <= 1) {
				const next = { ...prev };
				delete next[item.name];
				return next;
			}
			return { ...prev, [item.name]: current - 1 };
		});
	};

	const handleModalDecrement = (item: TDish) => {
		handleDecrement({ name: item.name });
	};

	const handleModalIncrement = (item: TDish) => {
		if (!canAddMore(item.name)) {
			return;
		}
		handleIncrement({ name: item.name, price: String(item.price) });
	};

	const handlePlaceOrder = async () => {
		if (cartItems.length === 0) {
			alert("Add at least one item to the order.");
			return;
		}

		if (orderKind === "table" && selectedTables.length === 0) {
			alert("Select at least one table number.");
			return;
		}

		if (needsCustomerDetails && !hasCustomerDetails) {
			alert("Enter customer name and a 10-digit phone number.");
			return;
		}

		setPlacing(true);
		try {
			const trimmedNotes = orderNotes.trim();
			const trimmedName = customerName.trim();
			const trimmedPhone = customerPhone.trim();
			const store = await getOrdersStore();
			const tableServiceFlags =
				orderKind === "table"
					? getTableServiceFlagsForTables(store.orders, selectedTables)
					: {};
			const customerFlags =
				orderKind === "takeaway" || orderKind === "delivery"
					? isFromExistingGroup && preselectedGroupKey
						? getCustomerContactFlagsForGroupKey(
								store.orders,
								preselectedGroupKey,
								orderKind
							)
						: {
								...(trimmedName ? { customerName: trimmedName } : {}),
								...(trimmedPhone ? { customerPhone: trimmedPhone } : {}),
							}
					: {};
			const order: TOrder = {
				id: generateOrderId(),
				createdAt: Date.now(),
				kind: orderKind,
				tableNumbers: orderKind === "table" ? selectedTables : [],
				items: cartItems,
				...(trimmedNotes ? { notes: trimmedNotes } : {}),
				...customerFlags,
				...tableServiceFlags,
			};

			await addOrder(order);
			await decrementInventoryForOrder(getTodayDateKey(), cartItems);
			router.push("/order");
		} catch (error) {
			console.error("Failed to place order:", error);
			alert("Failed to place order. Please try again.");
			setPlacing(false);
		}
	};

	return (
		<div className="ops-app-screen bg-white">
			<div className="ops-sticky-header bg-white border-b px-6 pb-4">
				<div className="flex items-center justify-between mb-4">
					<button
						type="button"
						onClick={() => router.push("/order")}
						className="text-sm font-semibold text-gray-600 hover:text-black"
					>
						← Back
					</button>
					<h1 className="text-xl font-bold">New Order</h1>
					<OrderOpsSyncIndicator />
				</div>

				{!isFromTableCard && !isFromExistingGroup && (
					<div className="flex gap-2 mb-4">
						{(["table", "takeaway", "delivery"] as OrderKind[]).map((kind) => (
							<button
								key={kind}
								type="button"
								onClick={() => {
									setOrderKind(kind);
									if (kind !== "table") {
										setSelectedTables([]);
									}
								}}
								className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-colors ${
									orderKind === kind
										? "bg-black text-white"
										: "bg-gray-100 text-gray-700 hover:bg-gray-200"
								}`}
							>
								{kind}
							</button>
						))}
					</div>
				)}

				{isFromTableCard && orderKind === "table" && (
					<div className="mb-2">
						<p className="text-xs font-medium text-gray-500 mb-1">Adding order for</p>
						<p className="text-lg font-bold">
							{formatTableGroupLabel(preselectedTables)}
						</p>
					</div>
				)}

				{isFromExistingGroup && existingCustomerContact ? (
					<div className="mb-2">
						<p className="text-xs font-medium text-gray-500 mb-1">Adding order for</p>
						<p className="text-lg font-bold capitalize">{orderKind}</p>
						<p className="text-sm font-medium text-gray-700 mt-1">
							{existingCustomerContact}
						</p>
					</div>
				) : null}

				{!isFromTableCard && orderKind === "table" && (
					<div>
						<p className="text-xs font-medium text-gray-600 mb-2">
							Select table(s) — tap to toggle
						</p>
						{needsTableSelection ? (
							<p className="text-xs font-medium text-red-600 mb-2">
								Select at least one table to add items and place the order.
							</p>
						) : null}
						<div className="grid grid-cols-5 gap-2">
							{Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(
								(tableNumber) => {
									const isSelected = selectedTables.includes(tableNumber);
									const isDisabled = isTableDisabled(tableNumber);
									return (
										<button
											key={tableNumber}
											type="button"
											disabled={isDisabled}
											onClick={() => toggleTable(tableNumber)}
											className={`py-2 rounded-lg text-sm font-bold transition-colors ${
												isDisabled
													? "bg-gray-200 text-gray-400 cursor-not-allowed"
													: isSelected
														? "bg-green-500 text-white"
														: "bg-gray-100 text-gray-800 hover:bg-gray-200"
											}`}
										>
											{tableNumber}
										</button>
									);
								}
							)}
						</div>
					</div>
				)}

				{needsCustomerDetails ? (
					<div className="mt-4 space-y-3">
						<p className="text-xs font-medium text-gray-600">Customer</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<label
									htmlFor="customer-name"
									className="block text-xs text-gray-500 mb-1"
								>
									Name
								</label>
								<input
									id="customer-name"
									type="text"
									value={customerName}
									onChange={(e) => setCustomerName(e.target.value)}
									placeholder="Customer name"
									autoComplete="name"
									className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
								/>
							</div>
							<div>
								<label
									htmlFor="customer-phone"
									className="block text-xs text-gray-500 mb-1"
								>
									Phone
								</label>
								<input
									id="customer-phone"
									type="tel"
									inputMode="numeric"
									value={customerPhone}
									onChange={(e) =>
										setCustomerPhone(
											e.target.value.replace(/\D/g, "").slice(0, CUSTOMER_PHONE_DIGITS)
										)
									}
									placeholder="10-digit phone"
									autoComplete="tel"
									maxLength={CUSTOMER_PHONE_DIGITS}
									className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
								/>
							</div>
						</div>
						{!hasCustomerDetails ? (
							<p className="text-xs font-medium text-red-600">
								Enter name and a 10-digit phone number before placing the order.
							</p>
						) : null}
					</div>
				) : null}
			</div>

			<div className="px-6 pt-4">
				<label className="block text-xs font-medium text-gray-600 mb-1">
					Order notes (optional)
				</label>
				<textarea
					value={orderNotes}
					onChange={(e) => setOrderNotes(e.target.value)}
					placeholder="Special instructions for kitchen..."
					rows={2}
					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none mb-4"
				/>
				<MenuPicker
					quantities={quantities}
					inStockOnly={inStockOnly}
					onAddItem={handleAddItem}
					onIncrement={handleIncrement}
					onDecrement={handleDecrement}
					headerAction={
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setInStockOnly((prev) => !prev)}
								aria-pressed={inStockOnly}
								className={`min-h-9 px-3 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
									inStockOnly
										? "bg-green-500 text-white"
										: "bg-gray-100 text-gray-700 hover:bg-gray-200"
								}`}
							>
								In stock
							</button>
							<button
								type="button"
								onClick={() => setCartModalOpen(true)}
								className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
								aria-label="View order cart"
							>
								<CartIcon className="w-5 h-5" />
								{cartItemCount > 0 ? (
									<span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
										{cartItemCount}
									</span>
								) : null}
							</button>
						</div>
					}
				/>
			</div>

			<div className="fixed bottom-0 left-0 right-0 bg-white border-t px-6 py-4 shadow-lg z-20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
				<div className="flex items-center justify-between mb-3">
					<span className="text-sm text-gray-600">
						{cartItems.length} item{cartItems.length === 1 ? "" : "s"}
					</span>
					<span className="text-lg font-bold">₹{cartTotal}</span>
				</div>
				<Button
					className="w-full bg-green-500 hover:bg-green-600 text-white font-bold disabled:opacity-50"
					disabled={placing || !canPlaceOrder}
					onClick={handlePlaceOrder}
				>
					{placing
						? "Placing..."
						: needsTableSelection
							? "Select a table"
							: needsCustomerDetails && !hasCustomerDetails
								? "Enter customer details"
								: "Place Order"}
				</Button>
			</div>

			{cartModalOpen ? (
				<OrderCartModal
					items={cartItems}
					total={cartTotal}
					onClose={() => setCartModalOpen(false)}
					onIncrement={handleModalIncrement}
					onDecrement={handleModalDecrement}
				/>
			) : null}
		</div>
	);
}

export default function NewOrderPage() {
	return (
		<Suspense
			fallback={
				<div className="flex justify-center items-center min-h-screen">
					Loading...
				</div>
			}
		>
			<AddOrderContent />
		</Suspense>
	);
}
