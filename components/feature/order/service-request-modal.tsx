"use client";

import { ConfirmModalActions } from "@/components/ui/touch-controls";
import {
	SERVICE_REQUEST_KIND_LABELS,
	ServiceRequest,
	ServiceRequestKind,
} from "@/src/models/service_requests";
import { getPendingQtyByTable } from "@/src/utils/service_requests_utils";
import { useEffect, useMemo, useState } from "react";

function CloseIcon({ className }: { className?: string }) {
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

type ServiceRequestModalProps = {
	kind: ServiceRequestKind;
	requests: ServiceRequest[];
	occupiedTables: number[];
	submitting: boolean;
	onClose: () => void;
	onRequest: (tableNumber: number, qty: number) => void;
	onMarkDone: (tableNumber: number) => void;
};

export function ServiceRequestModal({
	kind,
	requests,
	occupiedTables,
	submitting,
	onClose,
	onRequest,
	onMarkDone,
}: ServiceRequestModalProps) {
	const pendingByTable = useMemo(
		() => getPendingQtyByTable(requests, kind),
		[requests, kind]
	);
	const pendingTables = useMemo(
		() =>
			Array.from(pendingByTable.entries())
				.filter(([, qty]) => qty > 0)
				.sort(([a], [b]) => a - b),
		[pendingByTable]
	);

	const activeTables = useMemo(
		() => [...occupiedTables].sort((a, b) => a - b),
		[occupiedTables]
	);

	const defaultTable = activeTables[0] ?? null;

	const [tableNumber, setTableNumber] = useState<number | null>(defaultTable);
	const [qty, setQty] = useState(1);
	const [confirmDone, setConfirmDone] = useState<{
		table: number;
		qty: number;
	} | null>(null);

	useEffect(() => {
		setTableNumber((current) => {
			if (current != null && activeTables.includes(current)) {
				return current;
			}
			return defaultTable;
		});
	}, [activeTables, defaultTable]);

	const decrementQty = () => setQty((value) => Math.max(1, value - 1));
	const incrementQty = () => setQty((value) => Math.min(99, value + 1));

	const handleRequest = () => {
		if (tableNumber == null || !activeTables.includes(tableNumber) || qty < 1) {
			return;
		}
		onRequest(tableNumber, qty);
		setQty(1);
	};

	const handleDoneCheckbox = (table: number, tableQty: number) => {
		if (submitting) {
			return;
		}
		setConfirmDone({ table, qty: tableQty });
	};

	const handleConfirmDone = () => {
		if (!confirmDone) {
			return;
		}
		onMarkDone(confirmDone.table);
		setConfirmDone(null);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
			onClick={() => {
				if (!submitting && !confirmDone) {
					onClose();
				}
			}}
		>
			<div
				className="w-full max-w-md rounded-t-xl sm:rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col min-h-0 pb-[env(safe-area-inset-bottom)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0">
					<div>
						<h2 className="text-lg font-bold">
							{SERVICE_REQUEST_KIND_LABELS[kind]}
						</h2>
						<p className="text-xs text-gray-500 mt-0.5">
							Check Done when delivered
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 touch-manipulation disabled:opacity-40 shrink-0"
						aria-label="Close"
					>
						<CloseIcon className="w-5 h-5" />
					</button>
				</div>

				<div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-5">
					<div className="min-h-0">
						<p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
							Pending by table
						</p>
						{pendingTables.length === 0 ? (
							<p className="text-sm text-gray-400 py-2">No pending requests</p>
						) : (
							<ul className="space-y-2 max-h-[min(40vh,320px)] overflow-y-auto overscroll-contain pr-1">
								{pendingTables.map(([table, tableQty]) => (
									<li
										key={table}
										className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5"
									>
										<div className="min-w-0">
											<p className="text-sm font-semibold text-gray-900">
												Table {table}
											</p>
											<p className="text-xs text-amber-800">Qty {tableQty}</p>
										</div>
										<label className="inline-flex items-center gap-2 shrink-0 touch-manipulation cursor-pointer">
											<span className="text-xs font-semibold text-gray-700">
												Done
											</span>
											<input
												type="checkbox"
												checked={false}
												disabled={submitting}
												onChange={() => handleDoneCheckbox(table, tableQty)}
												className="h-6 w-6 rounded border-gray-300 text-green-600 focus:ring-green-500 touch-manipulation"
												aria-label={`Mark table ${table} done`}
											/>
										</label>
									</li>
								))}
							</ul>
						)}
					</div>

					<div>
						<p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
							New request
						</p>
						<div className="rounded-xl border border-gray-200 p-4 space-y-4">
							<div>
								<p className="text-sm font-medium text-gray-700 mb-2">Table</p>
								{activeTables.length === 0 ? (
									<p className="text-sm text-gray-400">
										No active tables right now
									</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{activeTables.map((table) => {
											const selected = tableNumber === table;
											return (
												<button
													key={table}
													type="button"
													disabled={submitting}
													onClick={() => setTableNumber(table)}
													className={`min-h-[40px] min-w-[40px] rounded-lg border text-sm font-semibold touch-manipulation ${
														selected
															? "border-green-600 bg-green-500 text-white"
															: "border-gray-300 bg-gray-50 text-gray-800"
													}`}
												>
													{table}
												</button>
											);
										})}
									</div>
								)}
							</div>

							<div className="flex items-center justify-between gap-3">
								<p className="text-sm font-medium text-gray-700">Quantity</p>
								<div className="flex items-center gap-3">
									<button
										type="button"
										onClick={decrementQty}
										disabled={submitting || qty <= 1}
										className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xl leading-none touch-manipulation disabled:opacity-40"
										aria-label="Decrease quantity"
									>
										−
									</button>
									<span className="w-10 text-center text-lg font-bold tabular-nums">
										{qty}
									</span>
									<button
										type="button"
										onClick={incrementQty}
										disabled={submitting || qty >= 99}
										className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-xl leading-none touch-manipulation disabled:opacity-40"
										aria-label="Increase quantity"
									>
										+
									</button>
								</div>
							</div>

							<button
								type="button"
								onClick={handleRequest}
								disabled={
									submitting || tableNumber == null || activeTables.length === 0
								}
								className="w-full min-h-[44px] rounded-xl bg-green-500 border border-green-600 text-white font-semibold touch-manipulation active:bg-green-600 disabled:opacity-50"
							>
								{submitting
									? "Saving…"
									: tableNumber != null
										? `Request for T${tableNumber}`
										: "Select an active table"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{confirmDone ? (
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
					onClick={() => {
						if (!submitting) {
							setConfirmDone(null);
						}
					}}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h3 className="text-lg font-bold">Mark as done?</h3>
							<p className="text-sm text-gray-600 mt-2">
								Table {confirmDone.table} — {SERVICE_REQUEST_KIND_LABELS[kind]}{" "}
								×{confirmDone.qty} delivered?
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setConfirmDone(null)}
							onConfirm={handleConfirmDone}
							confirmLabel="Yes, done"
							confirming={submitting}
							cancelDisabled={submitting}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
