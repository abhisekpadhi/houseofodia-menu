"use client";

import { TMenu, TMenuApiItem } from "@/src/models/common";
import {
	getAvailableQty,
	getInventoryForDate,
	getTodayDateKey,
	isInfiniteInventoryDish,
	isOutOfStock,
} from "@/src/utils/inventory_utils";
import { stringToColor, buildMenuFromApiItems, getMenuDisplayName, menuItemMatchesSearch, shouldShowMenuBillName } from "@/src/utils/menu_utils";
import axios from "axios";
import React, { useEffect, useMemo } from "react";
import { ParcelUnitButtons } from "@/components/feature/order/parcel-unit-buttons";

type MenuItem = {
  category: string;
  name: string;
  internal_name?: string;
  description: string;
  price: string;
  is_veg: boolean;
};

type MenuPickerProps = {
  quantities: Record<string, number>;
  onAddItem: (item: { name: string; price: string }) => void;
  onIncrement: (item: { name: string; price: string }) => void;
  onDecrement: (item: { name: string }) => void;
  headerAction?: React.ReactNode;
  /** When true, hide items with zero inventory. */
  inStockOnly?: boolean;
  /** When true, show parcel toggle buttons for items in the cart. */
  showParcelToggle?: boolean;
  parcelUnitsByName?: Record<string, boolean[]>;
  onToggleParcel?: (name: string, unitIndex: number) => void;
  onSearchFocus?: () => void;
};

export function MenuPicker({
  quantities,
  onAddItem,
  onIncrement,
  onDecrement,
  headerAction,
  inStockOnly = false,
  showParcelToggle = false,
  parcelUnitsByName = {},
  onToggleParcel,
  onSearchFocus,
}: MenuPickerProps) {
  const [fetchingMenu, setFetchingMenu] = React.useState(true);
  const [menu, setMenu] = React.useState<TMenu | null>(null);
  const [inventory, setInventory] = React.useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        setFetchingMenu(true);
        const [response, dayInventory] = await Promise.all([
          axios.get<TMenuApiItem[]>("/api/menu", {
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          }),
          getInventoryForDate(getTodayDateKey()),
        ]);
        setMenu(buildMenuFromApiItems(response.data));
        setInventory(dayInventory);
      } catch (error) {
        console.error("Error fetching menu:", error);
        alert("Error fetching menu: " + error);
      } finally {
        setFetchingMenu(false);
      }
    };

    fetchMenu();
  }, []);

  const categories = useMemo(() => (menu ? Object.keys(menu) : []), [menu]);

  const allItems = useMemo(() => {
    if (!menu) {
      return [] as MenuItem[];
    }

    const items: MenuItem[] = [];
    Object.entries(menu).forEach(([category, categoryItems]) => {
      categoryItems.forEach((item) => {
        items.push({
          category,
          name: item.name,
          ...(item.internal_name ? { internal_name: item.internal_name } : {}),
          description: item.description,
          price: item.price,
          is_veg: item.is_veg,
        });
      });
    });
    return items;
  }, [menu]);

  const visibleItems = useMemo(() => {
    let filtered = allItems;

    if (selectedCategory) {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    if (searchTerm.trim()) {
      filtered = filtered.filter((item) => menuItemMatchesSearch(item, searchTerm));
    }

    if (inStockOnly) {
      filtered = filtered.filter(
        (item) => !isOutOfStock(inventory, item.name, 0)
      );
    }

    return filtered;
  }, [allItems, selectedCategory, searchTerm, inStockOnly, inventory]);

  const isSearching = searchTerm.trim().length > 0;

  React.useEffect(() => {
    if (!isSearching || !searchFocused) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSearching, searchFocused, visibleItems.length]);

  const dismissSearch = () => {
    searchInputRef.current?.blur();
    setSearchFocused(false);
  };

  if (fetchingMenu) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-sm text-gray-500">Loading menu...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Menu
        </h2>
        {headerAction}
      </div>
      <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-white touch-pan-y">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            inputMode="search"
            enterKeyHint="done"
            autoComplete="off"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              onSearchFocus?.();
            }}
            onBlur={() => {
              window.setTimeout(() => setSearchFocused(false), 120);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                dismissSearch();
              }
            }}
            placeholder="Search for items across all categories"
            className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm touch-manipulation ${
              searchTerm || searchFocused ? "pr-11" : ""
            } ${searchFocused ? "ring-2 ring-blue-400 border-blue-400" : ""}`}
          />
          {searchTerm ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSearchTerm("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-red-600 hover:bg-red-50 active:bg-red-100 touch-manipulation"
              aria-label="Clear search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
        {searchFocused ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {isSearching
                ? `${visibleItems.length} result${visibleItems.length === 1 ? "" : "s"}`
                : "Type to search the menu"}
            </p>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={dismissSearch}
              className="min-h-[32px] rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white touch-manipulation"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
      {!isSearching ? (
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
        {categories.map((category, index) => {
          const isSelected = selectedCategory === category;
          const baseOpacity =
            selectedCategory === null || isSelected
              ? "opacity-100"
              : "opacity-50";

          return (
            <button
              key={`${category}-${index}`}
              type="button"
              style={{ backgroundColor: stringToColor(category) }}
              className={`whitespace-nowrap px-4 py-2 text-center font-bold text-xs rounded-lg cursor-pointer transition-transform ${baseOpacity} ${
                isSelected ? "ring-2 ring-black scale-105" : ""
              }`}
              onClick={() =>
                setSelectedCategory((prev) =>
                  prev === category ? null : category
                )
              }
            >
              {category}
            </button>
          );
        })}
      </div>
      ) : null}
      <div ref={resultsRef} className="space-y-3 scroll-mt-24">
        {visibleItems.map((item, index) => {
          const cartQty = quantities[item.name] ?? 0;
          const infiniteStock = isInfiniteInventoryDish(item.name);
          const availableQty = getAvailableQty(inventory, item.name, cartQty);
          const oos = isOutOfStock(inventory, item.name, cartQty);
          const canIncrement = infiniteStock || availableQty > 0;

          return (
            <div
              key={`${item.category}-${item.name}-${index}`}
              className={`border rounded-lg px-4 py-3 shadow-sm ${
                oos ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
              <div className="mr-4 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {item.is_veg ? (
                    <img src="/veg.svg" alt="veg" className="w-4 h-4" />
                  ) : (
                    <img src="/non_veg.svg" alt="non veg" className="w-4 h-4" />
                  )}
                  <p className="font-semibold text-sm">{getMenuDisplayName(item)}</p>
                  {shouldShowMenuBillName(item) ? (
                    <p className="text-[10px] text-gray-500">{item.name}</p>
                  ) : null}
                  {oos ? (
                    <span className="text-[10px] font-bold uppercase text-red-600">
                      OOS
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                ) : null}
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-gray-500 uppercase">
                    {item.category}
                  </p>
                  <p className="text-[10px] font-medium text-gray-600">
                    Stock: {infiniteStock ? "∞" : availableQty}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-2 shrink-0">
                <p className="font-medium text-sm">₹{item.price}</p>
                {oos ? (
                  <span className="text-xs font-semibold text-red-600">
                    Out of stock
                  </span>
                ) : cartQty > 0 ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-700 text-lg leading-none"
                      onClick={() => onDecrement(item)}
                    >
                      -
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-medium">
                      {cartQty}
                    </span>
                    <button
                      type="button"
                      disabled={!canIncrement}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-lg leading-none ${
                        canIncrement
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                      onClick={() => onIncrement(item)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={oos}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      oos
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-green-200"
                    }`}
                    onClick={() => onAddItem(item)}
                  >
                    + ADD
                  </button>
                )}
              </div>
              </div>
              {showParcelToggle && cartQty > 0 && onToggleParcel ? (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <ParcelUnitButtons
                    itemName={item.name}
                    qty={cartQty}
                    parcelUnits={parcelUnitsByName[item.name] ?? []}
                    onToggle={(unitIndex) => onToggleParcel(item.name, unitIndex)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div className="text-center text-sm text-gray-500">
            No items found for the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
