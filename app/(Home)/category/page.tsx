"use client";
import { TCart, TDish, TMenu, TMenuApiItem } from "@/src/models/common";
import axios from "axios";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

const CategoryPage: React.FC = () => {
  const router = useRouter();

  const [fetchingMenu, setFetchingMenu] = React.useState<boolean>(true);
  const [menu, setMenu] = React.useState<TMenu | null>(null);
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const [cartQuantities, setCartQuantities] = React.useState<
    Record<string, number>
  >({});

  const fetchMenu = async () => {
    try {
      setFetchingMenu(true);

      const response = await axios.get<TMenuApiItem[]>("/api/menu", {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const result: TMenu = {};
      response.data.forEach((item) => {
        if (!result[item.category]) {
          result[item.category] = [];
        }
        // only show menu items that are switched on
        if (item.status.toLowerCase() === "on") {
          result[item.category].push({
            status: item.status,
            name: item.name,
            description: item.description,
            price: item.price,
            is_veg: item.is_veg,
          });
        }
      });
      setMenu(result);
    } catch (error) {
      console.error("Error fetching menu:", error);
      alert("Error fetching menu: " + error);
    } finally {
      setFetchingMenu(false);
    }
  };

  React.useEffect(() => {
    fetchMenu();
  }, []);

  React.useEffect(() => {
    localforage.getItem<TCart>("cart").then((cart) => {
      if (cart && cart.items) {
        const quantities: Record<string, number> = {};
        cart.items.forEach((item: TDish) => {
          quantities[item.name] = item.qty;
        });
        setCartQuantities(quantities);
      }
    });
  }, []);

  const [categories, setCategories] = React.useState<string[]>([]);

  useEffect(() => {
    if (menu) {
      setCategories(Object.keys(menu));
      return;
    }
    setCategories([]);
  }, [menu]);

  const allItems = React.useMemo(() => {
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

  const visibleItems = React.useMemo(() => {
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

  if (fetchingMenu) {
    return (
      <div className="flex bg-black justify-center items-center min-h-screen">
        <div className="text-white">Loading...</div>
      </div>
    );
  }
  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = "#";
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      const lightValue = Math.floor((value + 255) / 2); // Average with white
      color += ("00" + lightValue.toString(16)).slice(-2);
    }
    return color;
  }

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

  const handleAddItem = (item: {
    name: string;
    price: string;
  }) => {
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
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
        {categories.map((category, index) => {
          const isSelected = selectedCategory === category;

          const baseOpacity =
            selectedCategory === null || isSelected ? "opacity-100" : "opacity-50";

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
                <p className="text-xs text-gray-600 mt-1">{item.description}</p>
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
    </div>
  );
};

export default CategoryPage;
