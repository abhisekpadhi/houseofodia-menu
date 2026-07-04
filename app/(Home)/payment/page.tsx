"use client";

import { TBill, TCart, TDish } from "@/src/models/common";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PaymentMethods = ["CASH", "UPI", "CARD"];

const Payment = () => {
	const router = useRouter();
	const [cart, setCart] = useState<TCart>({ items: [] });
	const [method, setMethod] = useState<string>("");
	const [membership, setMembership] = useState<"none" | "monthly" | "yearly">(
		"none"
	);

	useEffect(() => {
		localforage.getItem<TBill>("bill").then((data) => {
			if (data) {
				setCart(data.cart);
				setMethod(data.method);
			}
		});
	}, []);

	const handlePaymentMethod = (nextMethod: string) => {
		setMethod(nextMethod);
	};

	const handleMembershipSelect = (value: "monthly" | "yearly") => {
		setMembership((prev) => (prev === value ? "none" : value));
	};

	const handleClear = () => {
		localforage.setItem("cart", { items: [] }).then(() => {
			setCart({ items: [] });
			router.push("/freeflow");
		});
	};

	const handleBack = () => {
		router.push("/cart");
	};

	const totalAmount = cart
		? cart.items.reduce(
				(sum: number, item: TDish) => sum + item.price * item.qty,
				0
			)
		: 0;

	const discountRate =
		membership === "monthly" ? 0.1 : membership === "yearly" ? 0.2 : 0;
	const payableAmount = totalAmount - totalAmount * discountRate;

	const onClickPay = () => {
		if (!method) {
			alert("Select a payment method.");
			return;
		}

		localforage.getItem<TBill>("bill").then((data) => {
			if (!data) {
				return;
			}
			localforage
				.setItem<TBill>("bill", {
					...data,
					method: method,
					payable: payableAmount,
					staffWelfare: 0,
				})
				.then(() => {
					router.push("/bill");
				});
		});
	};

	const tabClass = (active: boolean) =>
		`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
			active
				? "bg-black text-white"
				: "bg-gray-100 text-gray-700 hover:bg-gray-200"
		}`;

	return (
		<div className="min-h-screen bg-gray-50 flex flex-col">
			<div className="ops-sticky-header bg-white border-b px-6 pb-4">
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={handleBack}
						className="text-sm font-semibold text-gray-600 hover:text-black"
					>
						← Back
					</button>
					<h1 className="text-xl font-bold">Payment</h1>
					<button
						type="button"
						onClick={handleClear}
						className="text-sm font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded-lg hover:bg-red-50"
					>
						Clear
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="px-6 py-4">
					<p className="text-xs font-medium text-gray-600 mb-2">
						Membership (optional)
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							className={tabClass(membership === "monthly")}
							onClick={() => handleMembershipSelect("monthly")}
						>
							Monthly (10% off)
						</button>
						<button
							type="button"
							className={tabClass(membership === "yearly")}
							onClick={() => handleMembershipSelect("yearly")}
						>
							Yearly (20% off)
						</button>
					</div>
				</div>

				<div className="px-6 py-4 border-t border-gray-100">
					<p className="text-xs font-medium text-gray-600 mb-3">
						Payment method
					</p>
					<div className="grid grid-cols-3 gap-3">
						{PaymentMethods.map((item) => (
							<button
								type="button"
								key={item}
								onClick={() => handlePaymentMethod(item)}
								className={`rounded-xl border-2 p-4 text-center transition-colors ${
									method === item
										? "border-green-500 bg-green-100 shadow-sm"
										: "border-gray-200 bg-white hover:bg-gray-50"
								}`}
							>
								<span className="block text-sm font-bold">{item}</span>
								{method === item ? (
									<span className="block text-xs font-semibold text-green-700 mt-1">
										₹{payableAmount}
									</span>
								) : null}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="flex-none bg-white border-t px-6 py-4 shadow-lg">
				<button
					type="button"
					onClick={onClickPay}
					className="w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors"
				>
					Confirm · ₹{payableAmount}
				</button>
			</div>
		</div>
	);
};

export default Payment;
