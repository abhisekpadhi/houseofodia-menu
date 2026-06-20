"use client";

import { OrderOpsSyncIndicator } from "@/components/feature/order/order-ops-sync-indicator";
import {
	ConfirmModalActions,
	LoadingSpinner,
	TouchActionButton,
} from "@/components/ui/touch-controls";
import { TMenu, TMenuApiItem } from "@/src/models/common";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import {
	getInventoryForDate,
	getTodayDateKey,
	saveInventoryForDate,
} from "@/src/utils/inventory_utils";
import {
	applyInventoryShortcut,
	getShortcutTargetDishes,
	INVENTORY_SHORTCUTS,
	isDishCategoryInventoryShortcut,
	isOutOfStockInventoryShortcut,
	type InventoryShortcut,
	type InventoryShortcutId,
	shortcutConfirmMessage,
} from "@/src/utils/inventory_shortcuts";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type MenuRow = {
	category: string;
	name: string;
};

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

function formatTodayLabel(dateKey: string): string {
	const [year, month, day] = dateKey.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return date.toLocaleDateString("en-IN", {
		weekday: "long",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function parseInventoryQty(value: string | undefined): number {
	const raw = value?.trim() ?? "";
	if (raw === "") {
		return 0;
	}
	const parsed = parseInt(raw, 10);
	return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

export default function InventoryPage() {
	const router = useRouter();
	const dateKey = getTodayDateKey();
	const [menuRows, setMenuRows] = useState<MenuRow[]>([]);
	const [quantities, setQuantities] = useState<Record<string, string>>({});
	const [savedQuantities, setSavedQuantities] = useState<
		Record<string, number>
	>({});
	const [editingItems, setEditingItems] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [pendingShortcut, setPendingShortcut] =
		useState<InventoryShortcut | null>(null);
	const [applyingShortcut, setApplyingShortcut] = useState(false);
	const [pendingOosDish, setPendingOosDish] = useState<string | null>(null);

	const dishNames = useMemo(
		() => menuRows.map((row) => row.name),
		[menuRows]
	);

	const pendingShortcutCount = useMemo(() => {
		if (!pendingShortcut) {
			return 0;
		}
		return getShortcutTargetDishes(dishNames, pendingShortcut.id).length;
	}, [dishNames, pendingShortcut]);

	const pendingShortcutDishes = useMemo(() => {
		if (!pendingShortcut) {
			return [];
		}
		return getShortcutTargetDishes(dishNames, pendingShortcut.id);
	}, [dishNames, pendingShortcut]);

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const [menuResponse, savedInventory] = await Promise.all([
				axios.get<TMenuApiItem[]>("/api/menu", {
					headers: {
						"Cache-Control": "no-cache",
						Pragma: "no-cache",
					},
				}),
				getInventoryForDate(dateKey),
			]);

			const rows: MenuRow[] = [];
			const menu: TMenu = {};
			menuResponse.data.forEach((item) => {
				if (item.status.toLowerCase() !== "on") {
					return;
				}
				if (!menu[item.category]) {
					menu[item.category] = [];
				}
				menu[item.category].push({
					status: item.status,
					name: item.name,
					description: item.description,
					price: item.price,
					is_veg: item.is_veg,
				});
			});

			Object.entries(menu).forEach(([category, items]) => {
				items.forEach((item) => {
					rows.push({ category, name: item.name });
				});
			});

			rows.sort((a, b) => {
				const categoryCompare = a.category.localeCompare(b.category);
				if (categoryCompare !== 0) {
					return categoryCompare;
				}
				return a.name.localeCompare(b.name);
			});

			const nextQuantities: Record<string, string> = {};
			const nextSaved: Record<string, number> = {};
			rows.forEach((row) => {
				const qty = savedInventory[row.name] ?? 0;
				nextQuantities[row.name] = String(qty);
				nextSaved[row.name] = qty;
			});

			setMenuRows(rows);
			setQuantities(nextQuantities);
			setSavedQuantities(nextSaved);
			setEditingItems(new Set());
		} catch (error) {
			console.error("Failed to load inventory page:", error);
			alert("Failed to load menu. Please try again.");
		} finally {
			setLoading(false);
		}
	}, [dateKey]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	useEffect(() => {
		const onOrderOpsUpdated = () => {
			void loadData();
		};
		window.addEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
		return () => window.removeEventListener(ORDER_OPS_EVENT, onOrderOpsUpdated);
	}, [loadData]);

	const visibleRows = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) {
			return menuRows;
		}
		return menuRows.filter(
			(row) =>
				row.name.toLowerCase().includes(term) ||
				row.category.toLowerCase().includes(term)
		);
	}, [menuRows, searchTerm]);

	const groupedRows = useMemo(() => {
		const groups: { category: string; rows: MenuRow[] }[] = [];
		let currentCategory = "";

		for (const row of visibleRows) {
			if (row.category !== currentCategory) {
				currentCategory = row.category;
				groups.push({ category: row.category, rows: [row] });
			} else {
				groups[groups.length - 1].rows.push(row);
			}
		}

		return groups;
	}, [visibleRows]);

	const hasUnsavedChanges = useMemo(() => {
		if (loading || menuRows.length === 0) {
			return false;
		}
		return menuRows.some(
			(row) =>
				parseInventoryQty(quantities[row.name]) !==
				(savedQuantities[row.name] ?? 0)
		);
	}, [loading, menuRows, quantities, savedQuantities]);

	const handleQtyChange = (dishName: string, value: string) => {
		if (value !== "" && !/^\d+$/.test(value)) {
			return;
		}
		setQuantities((prev) => ({ ...prev, [dishName]: value }));
	};

	const toggleEdit = (dishName: string) => {
		setEditingItems((prev) => {
			const next = new Set(prev);
			if (next.has(dishName)) {
				next.delete(dishName);
				setQuantities((current) => ({
					...current,
					[dishName]: String(parseInventoryQty(current[dishName])),
				}));
			} else {
				next.add(dishName);
			}
			return next;
		});
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const items: Record<string, number> = {};
			for (const row of menuRows) {
				items[row.name] = parseInventoryQty(quantities[row.name]);
			}
			await saveInventoryForDate(dateKey, items);
			router.push("/order");
		} catch (error) {
			console.error("Failed to save inventory:", error);
			alert("Failed to save inventory. Please try again.");
			setSaving(false);
		}
	};

	const handleApplyShortcut = async (shortcut: InventoryShortcutId) => {
		setApplyingShortcut(true);
		try {
			setQuantities((current) =>
				applyInventoryShortcut(current, dishNames, shortcut)
			);
			setEditingItems(new Set());
			setPendingShortcut(null);
		} finally {
			setApplyingShortcut(false);
		}
	};

	const isDishOos = (dishName: string) =>
		parseInventoryQty(quantities[dishName]) === 0;

	const handleOosToggle = (dishName: string) => {
		if (isDishOos(dishName)) {
			setEditingItems((prev) => new Set(prev).add(dishName));
			return;
		}
		setPendingOosDish(dishName);
	};

	const confirmMarkOos = () => {
		if (!pendingOosDish) {
			return;
		}
		setQuantities((prev) => ({ ...prev, [pendingOosDish]: "0" }));
		setEditingItems((prev) => {
			const next = new Set(prev);
			next.delete(pendingOosDish);
			return next;
		});
		setPendingOosDish(null);
	};

	return (
		<div className="ops-app-screen">
			<div className="ops-sticky-header bg-white border-b px-6 pb-4">
				<div className="flex items-center justify-between mb-4">
					<button
						type="button"
						onClick={() => router.push("/order")}
						className="text-sm font-semibold text-gray-600 hover:text-black"
					>
						← Back
					</button>
					<h1 className="text-xl font-bold flex items-center gap-2">
						<InventoryIcon className="w-5 h-5" />
						Inventory
					</h1>
					<OrderOpsSyncIndicator />
				</div>

				<p className="text-xs font-medium text-gray-600 mb-1">Today</p>
				<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
				<p className="text-xs text-gray-500 mt-2">
					Unsaved days inherit remaining stock from the previous day. New menu
					items start at 0.
				</p>
			</div>

			<div className="px-6 pt-4">
				<div className="mb-4">
					<p className="text-xs font-semibold text-gray-500 mb-2">Shortcuts</p>
					<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
						{INVENTORY_SHORTCUTS.map((shortcut) => (
							<TouchActionButton
								key={shortcut.id}
								onClick={() => setPendingShortcut(shortcut)}
								disabled={loading || applyingShortcut}
								className={`shrink-0 bg-gray-100 text-gray-800 active:bg-gray-200 min-w-[88px] px-3 border ${
									isOutOfStockInventoryShortcut(shortcut.id)
										? "border-red-600"
										: "border-gray-300"
								}`}
							>
								{shortcut.label}
							</TouchActionButton>
						))}
					</div>
				</div>

				<input
					type="text"
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder="Search dishes..."
					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
				/>

				{loading ? (
					<div className="text-center py-12 text-sm text-gray-500">
						Loading menu...
					</div>
				) : groupedRows.length === 0 ? (
					<div className="text-center py-12 text-sm text-gray-500">
						No dishes found.
					</div>
				) : (
					<div className="space-y-6">
						{groupedRows.map((group) => (
							<section key={group.category}>
								<h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
									{group.category}
								</h2>
								<div className="space-y-2">
									{group.rows.map((row) => {
										const isEditing = editingItems.has(row.name);
										const oos = isDishOos(row.name);

										return (
											<div
												key={row.name}
												className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-white"
											>
												<div className="flex items-center gap-2 min-w-0 flex-1">
													<button
														type="button"
														onClick={() => handleOosToggle(row.name)}
														className={`shrink-0 min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold tracking-wide touch-manipulation transition-colors border ${
															oos
																? "bg-red-600 text-white border-red-700 active:bg-red-700"
																: "bg-gray-100 text-gray-600 border-red-600 active:bg-gray-200"
														}`}
														aria-pressed={oos}
														aria-label={
															oos
																? `${row.name} is out of stock — tap to edit quantity`
																: `Mark ${row.name} out of stock`
														}
													>
														OOS
													</button>
													<p
														className={`text-sm font-medium min-w-0 truncate ${
															oos ? "text-gray-400" : ""
														}`}
													>
														{row.name}
													</p>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													<input
														type="text"
														inputMode="numeric"
														pattern="[0-9]*"
														readOnly={!isEditing}
														value={quantities[row.name] ?? "0"}
														onChange={(e) =>
															handleQtyChange(row.name, e.target.value)
														}
														className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center ${
															isEditing
																? "border-gray-300 bg-white"
																: "border-gray-200 bg-gray-50 text-gray-700 cursor-default"
														}`}
														aria-label={`Inventory for ${row.name}`}
													/>
													<button
														type="button"
														onClick={() => toggleEdit(row.name)}
														className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
															isEditing
																? "bg-black text-white hover:bg-gray-800"
																: "bg-gray-100 text-gray-700 hover:bg-gray-200"
														}`}
													>
														{isEditing ? "Done" : "Edit"}
													</button>
												</div>
											</div>
										);
									})}
								</div>
							</section>
						))}
					</div>
				)}
			</div>

			<div className="fixed bottom-0 left-0 right-0 bg-white border-t px-6 py-4 shadow-lg z-20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
				<button
					type="button"
					disabled={loading || saving || !hasUnsavedChanges}
					onClick={() => void handleSave()}
					aria-busy={saving}
					className="w-full min-h-[48px] inline-flex items-center justify-center rounded-lg bg-black text-white text-sm font-bold touch-manipulation active:bg-gray-800 disabled:opacity-50"
				>
					{saving ? (
						<LoadingSpinner className="h-4 w-4 text-white" />
					) : (
						"Save inventory"
					)}
				</button>
			</div>

			{pendingOosDish && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => setPendingOosDish(null)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">Mark out of stock?</h2>
							<p className="text-sm text-gray-600 mt-2">
								Set inventory for{" "}
								<span className="font-semibold">{pendingOosDish}</span> to 0?
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setPendingOosDish(null)}
							onConfirm={confirmMarkOos}
							confirmLabel="Mark OOS"
						/>
					</div>
				</div>
			)}

			{pendingShortcut && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => {
						if (!applyingShortcut) {
							setPendingShortcut(null);
						}
					}}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">{pendingShortcut.title}</h2>
							<p className="text-sm text-gray-600 mt-2">
								{shortcutConfirmMessage(
									pendingShortcut,
									pendingShortcutCount
								)}
							</p>
							{isDishCategoryInventoryShortcut(pendingShortcut.id) &&
							pendingShortcutDishes.length > 0 ? (
								<p className="text-sm text-gray-800 mt-2 max-h-40 overflow-y-auto">
									{pendingShortcutDishes.join(", ")}
								</p>
							) : null}
						</div>
						<ConfirmModalActions
							onCancel={() => setPendingShortcut(null)}
							onConfirm={() =>
								void handleApplyShortcut(pendingShortcut.id)
							}
							confirmLabel={pendingShortcut.confirmLabel}
							confirming={applyingShortcut}
							cancelDisabled={applyingShortcut}
							confirmDisabled={pendingShortcutCount === 0}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
