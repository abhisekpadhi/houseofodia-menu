"use client";

import {
	BillingContext,
	BILLING_CONTEXT_KEY,
	TBill,
	TCart,
	TDish,
} from "@/src/models/common";
import { ConfirmModalActions } from "@/components/ui/touch-controls";
import {
	getBillingSession,
	removeBillingSession,
	saveBillingSession,
} from "@/src/utils/billing_state";
import {
	getGroupCustomerDetails,
	getOrdersStore,
	groupOrdersByTable,
} from "@/src/utils/order_utils";
import { notifyOrderOpsChange } from "@/src/utils/order_ops_sync";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const padButtonClass =
	"py-2 rounded-lg text-sm font-semibold transition-colors bg-gray-100 text-gray-800 hover:bg-gray-200";

const Cart = () => {
	const router = useRouter();
	const [cart, setCart] = useState<TCart>({ items: [] });
	const [billingContext, setBillingContext] = useState<BillingContext | null>(
		null
	);
	const [selectedItem, setSelectedItem] = useState<number | null>(null);
	const [processing, setProcessing] = useState(false);
	const [attribute, setAttribute] = useState("");
	const [changeTo, setChangeTo] = useState("");
	const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

	useEffect(() => {
		localforage.getItem<TCart>("cart").then((data) => {
			if (data) {
				setCart(data);
			}
		});
		localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY).then((context) => {
			setBillingContext(context);
		});
	}, []);

	const handleClear = async () => {
		setCart({ items: [] });
		await localforage.setItem("cart", { items: [] });
		await localforage.removeItem(BILLING_CONTEXT_KEY);
		await localforage.setItem("bill", null);
		if (billingContext?.sessionId) {
			await removeBillingSession(billingContext.sessionId);
			await notifyOrderOpsChange("billing");
		}
		setClearConfirmOpen(false);
		router.push(
			billingContext?.source === "orders" ? "/order" : "/freeflow"
		);
	};

	const requestClear = () => {
		if (cart.items.length === 0) {
			return;
		}
		setClearConfirmOpen(true);
	};

	const handleBack = () => {
		router.push(
			billingContext?.source === "orders" ? "/order" : "/freeflow"
		);
	};

	const totalAmount = cart.items.reduce(
		(sum: number, item: TDish) => sum + item.price * item.qty,
		0
	);

	const onClickPay = async () => {
		if (cart.items.length === 0) {
			return;
		}

		setProcessing(true);
		try {
			let context = billingContext;
			if (context && !context.sessionId) {
				context = {
					...context,
					sessionId: `legacy:${context.source}:${crypto.randomUUID()}`,
				};
				await localforage.setItem(BILLING_CONTEXT_KEY, context);
				setBillingContext(context);
			}
			if (!context) {
				const sessionId = `freeflow:${crypto.randomUUID()}`;
				context = {
					source: "freeflow",
					sessionId,
					groupKey: sessionId,
					kind: "takeaway",
					tableNumbers: [],
					label: "Freeflow",
				};
				await localforage.setItem(BILLING_CONTEXT_KEY, context);
				setBillingContext(context);
			}

			const existingSession = await getBillingSession(context.sessionId);
			const existingBill = existingSession?.bill;
			const cgst = Math.round(totalAmount * 0.025 * 100) / 100;
			const sgst = Math.round(totalAmount * 0.025 * 100) / 100;
			const preRoundPayable =
				Math.round((totalAmount + cgst + sgst) * 100) / 100;
			const payable = Math.ceil(preRoundPayable);
			const roundOff = Math.round((payable - preRoundPayable) * 100) / 100;

			let customerPhone = existingBill?.customerPhone?.trim() || undefined;
			if (
				!customerPhone &&
				context.source === "orders" &&
				(context.kind === "takeaway" || context.kind === "delivery")
			) {
				const store = await getOrdersStore();
				const group = groupOrdersByTable(store.orders).find(
					(entry) => entry.key === context.groupKey
				);
				customerPhone = group
					? getGroupCustomerDetails(group).phone
					: undefined;
			}

			const bill: TBill = {
				method: "CASH/UPI",
				billNumber: existingBill?.billNumber ?? "Pending",
				sessionId: context.sessionId,
				stateKey: `${context.sessionId}::checkout`,
				date: existingBill?.date ?? new Date().toLocaleDateString("en-IN", {
					day: "2-digit",
					month: "2-digit",
					year: "2-digit",
				}),
				time: existingBill?.time ?? new Date().toLocaleTimeString("en-IN", {
					hour: "2-digit",
					minute: "2-digit",
					hour12: true,
				}),
				cart: cart,
				subtotal: totalAmount,
				cgst,
				sgst,
				roundOff,
				payable,
				membership: "none",
				...(customerPhone ? { customerPhone } : {}),
				backendBillId: existingBill?.backendBillId,
				backendStatus: existingBill?.backendBillId ? "saved" : "idle",
				backendSavedAt: existingBill?.backendSavedAt,
				updatedAt: Date.now(),
			};
			await localforage.setItem<TBill>("bill", bill);
			await saveBillingSession(context, cart, bill);
			await notifyOrderOpsChange("billing");
			router.push("/bill");
		} catch (error) {
			alert("Failed to prepare bill, err:" + error);
		} finally {
			setProcessing(false);
		}
	};

	const handleRemove = () => {
		if (selectedItem === null) {
			return;
		}
		const newCart = { ...cart };
		newCart.items.splice(selectedItem, 1);

		localforage.setItem<TCart>("cart", newCart).then(() => {
			setCart(newCart);
			setSelectedItem(null);
			setAttribute("");
			setChangeTo("");
		});
	};

	const handleNumPress = (num: number) => {
		if (attribute === "") {
			return;
		}
		setChangeTo((prev) => prev + num.toString());
	};

	const handleSave = () => {
		if (selectedItem === null || attribute === "") {
			return;
		}

		if (attribute === "qty") {
			const newQty = parseInt(changeTo, 10);
			if (Number.isNaN(newQty)) {
				return;
			}
			if (newQty <= 0) {
				handleRemove();
				return;
			}
			const newCart = { ...cart };
			newCart.items[selectedItem].qty = newQty;
			localforage.setItem<TCart>("cart", newCart).then(() => {
				setCart(newCart);
			});
		}

		if (attribute === "price") {
			const newPrice = parseInt(changeTo, 10);
			if (Number.isNaN(newPrice)) {
				return;
			}
			const newCart = { ...cart };
			newCart.items[selectedItem].price = newPrice;
			localforage.setItem<TCart>("cart", newCart).then(() => {
				setCart(newCart);
			});
		}

		setAttribute("");
		setChangeTo("");
	};

	const changeMode = (mode: string) => {
		if (mode === attribute) {
			setAttribute("");
			setChangeTo("");
			return;
		}
		if (selectedItem !== null) {
			setAttribute(mode);
			setChangeTo("");
		}
	};

	const handleCartItemSelect = (index: number) => {
		if (selectedItem === index) {
			setSelectedItem(null);
			setAttribute("");
			setChangeTo("");
			return;
		}
		setSelectedItem(index);
	};

	const modeButtonClass = (mode: string, activeClass: string) => {
		const isActive = selectedItem !== null && attribute === mode;
		return `py-2 rounded-lg text-sm font-semibold transition-colors ${
			isActive ? activeClass : "bg-gray-100 text-gray-700 hover:bg-gray-200"
		}`;
	};

	return (
		<div className="ops-app-screen flex flex-col">
			<div className="sticky top-0 z-20 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-transparent pointer-events-none">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pointer-events-auto">
					<button
						type="button"
						onClick={handleBack}
						aria-label="Back"
						className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 text-sm font-semibold"
					>
						←
					</button>
					<div className="flex justify-center min-w-0 px-1">
						<div className="rounded-full bg-white border border-gray-200/80 shadow-md px-4 py-2 min-h-[44px] max-w-full flex flex-col justify-center">
							<h1 className="text-sm font-bold text-gray-900 truncate text-center">
								Cart
							</h1>
						</div>
					</div>
					<button
						type="button"
						onClick={requestClear}
						disabled={cart.items.length === 0}
						className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white text-red-600 hover:bg-red-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 px-3 text-sm font-semibold disabled:opacity-40 disabled:hover:bg-white"
					>
						Clear
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-auto px-4 sm:px-6">
				{cart.items.length === 0 ? (
					<div className="text-center py-16 text-gray-500 text-sm">
						Cart is empty
					</div>
				) : (
					cart.items.map((item, index) => (
						<button
							type="button"
							key={`${item.name}-${index}`}
							onClick={() => handleCartItemSelect(index)}
							className={`w-full flex justify-between items-center py-3 px-6 text-left border-b border-gray-100 border-l-4 transition-colors ${
								selectedItem === index
									? "bg-green-100 border-l-green-500"
									: "bg-white border-l-transparent hover:bg-gray-50"
							}`}
						>
							<div>
								<div className="font-semibold text-sm">{item.name}</div>
								<div className="text-xs text-gray-500 mt-0.5">
									{item.qty} × ₹{item.price}
								</div>
							</div>
							<div className="text-sm font-medium">₹{item.price * item.qty}</div>
						</button>
					))
				)}
			</div>

			<div className="flex-none bg-white border-t px-6 py-4 shadow-lg">
				<button
					type="button"
					disabled={attribute === ""}
					onClick={handleSave}
					className={`w-full py-2.5 rounded-lg text-sm font-semibold mb-3 transition-colors ${
						attribute !== ""
							? "bg-green-500 text-white hover:bg-green-600"
							: "bg-gray-100 text-gray-400 cursor-not-allowed"
					}`}
				>
					{attribute !== ""
						? `Set ${attribute} to ${changeTo || "…"}`
						: "Select qty or price to edit"}
				</button>

				<div className="grid grid-cols-3 gap-2 text-center">
					<button
						type="button"
						disabled={selectedItem === null}
						onClick={() => changeMode("qty")}
						className={`${modeButtonClass("qty", "bg-black text-white")} disabled:opacity-40`}
					>
						Qty
					</button>
					<button
						type="button"
						disabled={selectedItem === null}
						onClick={() => changeMode("price")}
						className={`${modeButtonClass("price", "bg-black text-white")} disabled:opacity-40`}
					>
						Price
					</button>
					<button
						type="button"
						disabled={selectedItem === null}
						onClick={handleRemove}
						className={`py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 ${
							selectedItem === null
								? "bg-gray-100 text-gray-400"
								: "bg-red-100 text-red-700 hover:bg-red-200"
						}`}
					>
						Remove
					</button>

					{Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
						<button
							type="button"
							key={num}
							disabled={attribute === ""}
							onClick={() => handleNumPress(num)}
							className={`${padButtonClass} disabled:opacity-40`}
						>
							{num}
						</button>
					))}
					<button
						type="button"
						disabled={attribute === ""}
						onClick={() => handleNumPress(0)}
						className={`${padButtonClass} disabled:opacity-40`}
					>
						0
					</button>
					<button
						type="button"
						disabled={processing || cart.items.length === 0}
						onClick={() => void onClickPay()}
						className="col-span-2 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold disabled:opacity-50 transition-colors"
					>
						{processing
							? "Processing…"
							: `${cart.items.length} items · ₹${totalAmount} · Bill`}
					</button>
				</div>
			</div>

			{clearConfirmOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => setClearConfirmOpen(false)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">Clear cart?</h2>
							<p className="text-sm text-gray-600 mt-2">
								All {cart.items.length} item
								{cart.items.length === 1 ? "" : "s"} will be removed from the
								cart.
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setClearConfirmOpen(false)}
							onConfirm={handleClear}
							confirmLabel="Clear cart"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
};

export default Cart;
