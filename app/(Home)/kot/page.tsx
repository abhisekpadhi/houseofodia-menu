"use client";

import { TOrder } from "@/src/models/common";
import { formatCustomerContact, formatOrderLabel, formatOrderTime, getOrdersStore } from "@/src/utils/order_utils";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FaPrint } from "react-icons/fa";

const Divider = () => {
	return <div className="my-2 border-t border-solid border-black" />;
};

function KotContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const orderId = searchParams.get("orderId");
	const [order, setOrder] = useState<TOrder | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!orderId) {
			setLoading(false);
			return;
		}

		getOrdersStore()
			.then((store) => {
				const found = store.orders.find((entry) => entry.id === orderId) ?? null;
				setOrder(found);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [orderId]);

	if (loading) {
		return <div className="p-4">Loading...</div>;
	}

	if (!order) {
		return (
			<div className="p-4">
				<p className="mb-4">Order not found.</p>
				<button
					type="button"
					onClick={() => router.push("/order")}
					className="text-white bg-black px-4 py-2 rounded-lg"
				>
					&lt; BACK
				</button>
			</div>
		);
	}

	const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
	});
	const customerContact = formatCustomerContact(order);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="sticky top-0 z-10 bg-white border-b px-6 py-4 print:hidden">
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={() => router.push("/order")}
						className="text-sm font-semibold text-gray-600 hover:text-black"
					>
						← Back
					</button>
					<h1 className="text-xl font-bold">KOT</h1>
					<div className="w-12" />
				</div>
			</div>
			<div
				className="text-xs"
				style={{ maxWidth: "58mm", fontFamily: "Helvetica" }}
			>
				<h1 className="text-center font-bold">Tangify</h1>
				<p className="text-center">Kitchen Order Ticket</p>
				<p className="text-center">Sarjapura, BLR, KA - 562125</p>
				<Divider />
				<div className="flex justify-between">
					<span>Table</span>
					<span>{formatOrderLabel(order)}</span>
				</div>
				<div className="flex justify-between">
					<span>Date</span>
					<span>{orderDate}</span>
				</div>
				<div className="flex justify-between">
					<span>Time</span>
					<span>{formatOrderTime(order.createdAt)}</span>
				</div>
				{customerContact ? (
					<>
						<div className="flex justify-between">
							<span>Customer</span>
							<span className="text-right max-w-[60%]">{customerContact}</span>
						</div>
					</>
				) : null}
				<Divider />
				<div>
					{order.items.map((item, index) => (
						<div key={`${item.name}-${index}`}>
							<span>
								{item.qty}x {item.name}
							</span>
						</div>
					))}
				</div>
				{order.notes?.trim() ? (
					<>
						<Divider />
						<p>Notes</p>
						<p className="mt-1 whitespace-pre-wrap">{order.notes.trim()}</p>
					</>
				) : null}
				<br />
				<br />
				<br />
			</div>
			<div className="px-6 py-4 print:hidden">
				<button
					type="button"
					className="w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold flex items-center justify-center transition-colors"
					onClick={() => window.print()}
				>
					<FaPrint className="mr-2" /> Print KOT
				</button>
			</div>
		</div>
	);
}

export default function KotPage() {
	return (
		<Suspense fallback={<div className="p-4">Loading...</div>}>
			<KotContent />
		</Suspense>
	);
}
