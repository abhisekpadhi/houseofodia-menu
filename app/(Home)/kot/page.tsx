"use client";

import { TMenuApiItem, TOrder } from "@/src/models/common";
import { buildDishInternalNameMap, getKotDisplayName } from "@/src/utils/menu_utils";
import { formatDailyOrderNumber } from "@/src/utils/daily_order_number";
import {
	formatCustomerContact,
	formatOrderLabel,
	formatOrderTime,
	formatTableSessionFooter,
	getOrderKotLines,
	getOrdersStore,
} from "@/src/utils/order_utils";
import { requestKotPrint } from "@/src/utils/order_ops_sync";
import { isKotPrinterOnline } from "@/src/utils/print_servers";
import { useOrderOpsSync } from "@/context/order-ops-sync";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FaCompress, FaExpand, FaPrint } from "react-icons/fa";

const Divider = () => {
	return <div className="my-2 border-t border-solid border-black" />;
};

function BlankRows({ count }: { count: number }) {
	return (
		<div aria-hidden className="select-none">
			{Array.from({ length: count }, (_, index) => (
				<br key={index} />
			))}
		</div>
	);
}

function KotContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const orderId = searchParams.get("orderId");
	const sync = useOrderOpsSync();
	const kotPrinterOnline = isKotPrinterOnline(sync.memberDeviceNames);
	const [order, setOrder] = useState<TOrder | null>(null);
	const [activeOrders, setActiveOrders] = useState<TOrder[]>([]);
	const [internalNameByBillName, setInternalNameByBillName] = useState<
		Record<string, string>
	>({});
	const [loading, setLoading] = useState(true);
	const [fullSize, setFullSize] = useState(false);
	const [printServerState, setPrintServerState] = useState<
		"idle" | "sending" | "sent" | "error"
	>("idle");
	const [printServerError, setPrintServerError] = useState<string | null>(null);

	useEffect(() => {
		if (!orderId) {
			setLoading(false);
			return;
		}

		Promise.all([
			getOrdersStore(),
			axios.get<TMenuApiItem[]>("/api/menu", {
				headers: {
					"Cache-Control": "no-cache",
					Pragma: "no-cache",
				},
			}),
		])
			.then(([store, menuResponse]) => {
				const found = store.orders.find((entry) => entry.id === orderId) ?? null;
				setOrder(found);
				setActiveOrders(store.orders);
				setInternalNameByBillName(buildDishInternalNameMap(menuResponse.data));
			})
			.finally(() => {
				setLoading(false);
			});
	}, [orderId]);

	const sendToPrintServer = async () => {
		if (!order) return;
		setPrintServerState("sending");
		setPrintServerError(null);
		try {
			await requestKotPrint(order, {
				mode: "new",
				nameByBillName: internalNameByBillName,
				tableSessionLabel:
					formatTableSessionFooter(order, activeOrders) ?? undefined,
			});
			setPrintServerState("sent");
		} catch (error) {
			setPrintServerState("error");
			setPrintServerError(
				error instanceof Error
					? error.message
					: "Could not reach KOT Printer"
			);
		}
	};

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
	const orderNumberLabel = formatDailyOrderNumber(order.orderNumber);

	return (
		<div className="ops-app-screen">
			{!fullSize ? (
				<style
					dangerouslySetInnerHTML={{
						__html: `
              @media print {
                @page {
                  size: 58mm auto;
                  margin: 0;
                }
                html, body {
                  width: 58mm;
                  max-width: 58mm;
                  margin: 0;
                  padding: 0;
                }
              }
            `,
					}}
				/>
			) : null}
			<div className="sticky top-0 z-20 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-transparent pointer-events-none print:hidden">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pointer-events-auto">
					<button
						type="button"
						onClick={() => router.push("/order")}
						aria-label="Back"
						className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 text-sm font-semibold"
					>
						←
					</button>
					<div className="flex justify-center min-w-0 px-1">
						<div className="rounded-full bg-white border border-gray-200/80 shadow-md px-4 py-2 min-h-[44px] max-w-full flex flex-col justify-center">
							<h1 className="text-sm font-bold text-gray-900 truncate text-center">
								KOT
							</h1>
						</div>
					</div>
					<div className="min-w-[44px]" aria-hidden />
				</div>
			</div>
			<div
				className={
					fullSize
						? "w-full px-6 py-4 text-base print:px-0"
						: "text-xs"
				}
				style={{
					maxWidth: fullSize ? undefined : "58mm",
					fontFamily: "Helvetica",
				}}
			>
				<BlankRows count={6} />
				{orderNumberLabel ? (
					<h1
						className={`text-center font-black tracking-tight${
							fullSize ? " text-5xl" : " text-3xl"
						}`}
					>
						{orderNumberLabel}
					</h1>
				) : null}
				<h2 className={`text-center font-bold${fullSize ? " text-2xl" : ""}`}>
					Tangify
				</h2>
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
					{getOrderKotLines(order).map((line, index) => {
						const displayName = getKotDisplayName(
							line.name,
							internalNameByBillName
						);
						return (
							<div key={`${line.name}-${line.isParcel}-${index}`}>
								<span>
									{line.qty}x {displayName}
									{line.isParcel ? " (parcel)" : ""}
								</span>
							</div>
						);
					})}
				</div>
				{order.notes?.trim() ? (
					<>
						<Divider />
						<p>Notes</p>
						<p className="mt-1 whitespace-pre-wrap">{order.notes.trim()}</p>
					</>
				) : null}
				<BlankRows count={3} />
			</div>
			<div className="h-36 print:hidden" aria-hidden />
			<div className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col-reverse items-end gap-2 print:hidden">
				{kotPrinterOnline ? (
					<button
						type="button"
						disabled={printServerState === "sending"}
						aria-label="Send to KOT Printer"
						onClick={() => void sendToPrintServer()}
						className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-orange-500 px-4 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 touch-manipulation disabled:opacity-60"
					>
						<FaPrint className="h-4 w-4 shrink-0" />
						{printServerState === "sending" ? "Sending…" : "KOT Printer"}
					</button>
				) : null}
				<button
					type="button"
					aria-label="Print KOT"
					title="Print KOT"
					className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black text-white shadow-lg hover:bg-gray-800 touch-manipulation transition-colors"
					onClick={() => window.print()}
				>
					<FaPrint className="h-4 w-4" />
				</button>
				<button
					type="button"
					aria-label={fullSize ? "Receipt size (58mm)" : "Full size"}
					title={fullSize ? "Receipt size (58mm)" : "Full size"}
					className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-gray-300 bg-white text-gray-800 shadow-lg hover:bg-gray-50 touch-manipulation transition-colors"
					onClick={() => setFullSize((value) => !value)}
				>
					{fullSize ? (
						<FaCompress className="h-4 w-4" />
					) : (
						<FaExpand className="h-4 w-4" />
					)}
				</button>
				{printServerState === "error" && printServerError ? (
					<p className="max-w-[10rem] rounded-lg bg-white/95 px-2 py-1 text-xs text-red-600 shadow-md text-right">
						{printServerError}
					</p>
				) : null}
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
