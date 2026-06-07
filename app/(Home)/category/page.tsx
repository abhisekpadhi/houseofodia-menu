"use client";

import { TCart, TDish, TMenu, TMenuApiItem } from "@/src/models/common";
import { buildMenuFromApiItems, stringToColor } from "@/src/utils/menu_utils";
import axios from "axios";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

const CategoryPage: React.FC = () => {
  const router = useRouter();

  const [fetchingMenu, setFetchingMenu] = useState(true);
  const [menu, setMenu] = useState<TMenu | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>(
    {}
  );
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    axios
      .get<TMenuApiItem[]>("/api/menu", {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      })
      .then((response) => {
        if (cancelled) return;
        setMenu(buildMenuFromApiItems(response.data));
        setLoadError(null);
      })
      .catch((error) => {
        console.error("Error fetching menu:", error);
        if (cancelled) return;
        setLoadError("Could not load menu. Pull to refresh or try again.");
        setMenu({});
      })
      .finally(() => {
        if (!cancelled) {
          setFetchingMenu(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localforage
      .getItem<TCart>("cart")
      .then((cart) => {
        if (cart?.items) {
          const quantities: Record<string, number> = {};
          cart.items.forEach((item: TDish) => {
            quantities[item.name] = item.qty;
          });
          setCartQuantities(quantities);
        }
      })
      .catch((error) => {
        console.error("Failed to load cart:", error);
      });
  }, []);

  useEffect(() => {
    if (menu) {
      setCategories(Object.keys(menu));
      return;
    }
    setCategories([]);
  }, [menu]);

  const allItems = useMemo(() => {
    if (!menu) {
      return [];
    }

    const itemsWithCategory: {
      category: string;
      name: string;
      description: string;
      price: string;
      is_veg: boolean;
    }[] = [];

    Object.entries(menu).forEach(([category, items]) => {
      items.forEach((item) => {
        itemsWithCategory.push({
          category,
          name: item.name,
          description: item.description,
          price: item.price,
          is_veg: item.is_veg,
        });
      });
    });

    return itemsWithCategory;
  }, [menu]);

  const visibleItems = useMemo(() => {
    let filtered = allItems;

    if (selectedCategory) {
      filtered = filtered.filter(
        (item) => item.category === selectedCategory
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const nameMatch = item.name.toLowerCase().includes(term);
        const descriptionMatch = item.description
          ? item.description.toLowerCase().includes(term)
          : false;
        return nameMatch || descriptionMatch;
      });
    }

    return filtered;
  }, [allItems, selectedCategory, searchTerm]);

  const goToCart = () => {
    router.push("/cart");
  };

  const updateCartAndQuantities = (
    itemName: string,
    updater: (currentQty: number, cart: TCart) => TCart
  ) => {
    localforage.getItem<TCart>("cart").then((existingCart) => {
      const baseCart: TCart = existingCart ?? { items: [] };
      const currentQty = cartQuantities[itemName] || 0;
      const newCart = updater(currentQty, baseCart);

      localforage.setItem<TCart>("cart", newCart).then(() => {
        const updatedQty =
          newCart.items.find((i) => i.name === itemName)?.qty ?? 0;
        setCartQuantities((prev) => {
          const next = { ...prev };
          if (updatedQty > 0) {
            next[itemName] = updatedQty;
          } else {
            delete next[itemName];
          }
          return next;
        });
      });
    });
  };

  const handleAddItem = (item: { name: string; price: string }) => {
    updateCartAndQuantities(item.name, (_, cart) => {
      const existingIndex = cart.items.findIndex(
        (i: TDish) => i.name === item.name
      );

      if (existingIndex === -1) {
        const priceNumber = parseFloat(item.price);
        const newItem: TDish = {
          name: item.name,
          qty: 1,
          price: isNaN(priceNumber) ? 0 : priceNumber,
        };
        return { items: [...cart.items, newItem] };
      }

      const newItems = [...cart.items];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        qty: newItems[existingIndex].qty + 1,
      };
      return { items: newItems };
    });
  };

  const handleIncrement = (item: { name: string; price: string }) => {
    handleAddItem(item);
  };

  const handleDecrement = (item: { name: string }) => {
    updateCartAndQuantities(item.name, (currentQty, cart) => {
      if (currentQty <= 1) {
        return {
          items: cart.items.filter((i: TDish) => i.name !== item.name),
        };
      }

      return {
        items: cart.items.map((i: TDish) =>
          i.name === item.name ? { ...i, qty: i.qty - 1 } : i
        ),
      };
    });
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">BILL</h1>
        <button
          className="py-2 px-4 rounded-lg bg-green-300 text-sm font-semibold"
          onClick={goToCart}
        >
          Cart
        </button>
      </div>
      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search for items across all categories"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {fetchingMenu ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Loading menu...
        </div>
      ) : loadError ? (
        <div className="text-center py-12 text-red-500 text-sm">{loadError}</div>
      ) : (
        <>
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
          <div className="space-y-3 mb-8">
            {visibleItems.map((item, index) => (
              <div
                key={`${item.category}-${item.name}-${index}`}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 bg-white shadow-sm"
              >
                <div className="mr-4">
                  <p className="font-semibold text-sm">{item.name}</p>
                  {item.description ? (
                    <p className="text-xs text-gray-600 mt-1">
                      {item.description}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-gray-500 mt-1 uppercase">
                    {item.category}
                  </p>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <p className="font-medium text-sm">₹{item.price}</p>
                  {cartQuantities[item.name] && cartQuantities[item.name] > 0 ? (
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-700 text-lg leading-none"
                        onClick={() => handleDecrement(item)}
                      >
                        -
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-medium">
                        {cartQuantities[item.name]}
                      </span>
                      <button
                        type="button"
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-lg leading-none"
                        onClick={() => handleIncrement(item)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full bg-green-200 text-xs font-semibold"
                      onClick={() => handleAddItem(item)}
                    >
                      + ADD
                    </button>
                  )}
                </div>
              </div>
            ))}
            {visibleItems.length === 0 && (
              <div className="text-center text-sm text-gray-500">
                No items found for the current filters.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CategoryPage;
