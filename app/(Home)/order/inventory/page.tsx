"use client";

import { TMenu, TMenuApiItem } from "@/src/models/common";
import {
	getInventoryForDate,
	getTodayDateKey,
	saveInventoryForDate,
} from "@/src/utils/inventory_utils";
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
	const [editingItems, setEditingItems] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");

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
			rows.forEach((row) => {
				nextQuantities[row.name] = String(savedInventory[row.name] ?? 0);
			});

			setMenuRows(rows);
			setQuantities(nextQuantities);
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

	return (
		<div className="min-h-screen bg-gray-50 pb-24">
			<div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
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
					<div className="w-12" />
				</div>

				<p className="text-xs font-medium text-gray-600 mb-1">Today</p>
				<p className="text-sm font-semibold">{formatTodayLabel(dateKey)}</p>
				<p className="text-xs text-gray-500 mt-2">
					Unsaved days inherit remaining stock from the previous day. New menu
					items start at 0.
				</p>
			</div>

			<div className="px-6 pt-4">
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

										return (
											<div
												key={row.name}
												className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-white"
											>
												<p className="text-sm font-medium flex-1 min-w-0 truncate">
													{row.name}
												</p>
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

			<div className="fixed bottom-0 left-0 right-0 bg-white border-t px-6 py-4 shadow-lg z-20">
				<button
					type="button"
					disabled={loading || saving}
					onClick={() => void handleSave()}
					className="w-full py-3 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50"
				>
					{saving ? "Saving..." : "Save inventory"}
				</button>
			</div>
		</div>
	);
}
