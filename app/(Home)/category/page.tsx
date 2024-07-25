"use client";
import { TMenu, TMenuApiItem, TStorage } from "@/src/models/common";
import axios from "axios";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

const CategoryPage: React.FC = () => {
  const router = useRouter();

  const navigateToDishes = (category: string) => {
    router.push(`/dishes?category=${category}`);
  };

  const [fetchingMenu, setFetchingMenu] = React.useState<boolean>(true);

  const fetchMenu = async () => {
    try {
      setFetchingMenu(true);

      const response = await axios.get<TMenuApiItem[]>("/api/menu");
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
      localforage
        .setItem<TStorage>("menu", { menu: result, created_at: Date.now() })
        .then((data) => {

          setFetchingMenu(false);
        });
    } catch (error) {
      console.error("Error fetching menu:", error);
      alert("Error fetching menu: " + error);
    } finally {
      setFetchingMenu(false);
    }
  };

  React.useEffect(() => {
    localforage
      .getItem<TStorage | null>("menu")
      .then((data: TStorage | null) => {
        if (data) {
          // refresh if old data than 30 minutes
          if (Date.now() - data.created_at > 30 * 60 * 1000) {

            fetchMenu();
          } else {

            setFetchingMenu(false);
          }
        } else {
          // fetch menu if no data

          fetchMenu();
        }
      });
  }, []);

  const [categories, setCategories] = React.useState<string[]>([]);

  useEffect(() => {
    if (!fetchingMenu) {
      localforage.getItem<TStorage>("menu").then((data) => {
        setCategories(Object.keys(data.menu));
      });
    }
  }, [fetchingMenu]);

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

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-xl font-bold mb-4">SELECT CATEGORY</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {categories.map((category, index) => (
          <div
            key={`${category}-${index}`}
            style={{ backgroundColor: stringToColor(category) }}
            className="bg-yellow-400 p-4 text-center font-bold cursor-pointer break-words text-xs"
            onClick={() => navigateToDishes(category)}
          >
            {category}
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <button
          className={`py-2 px-6 rounded-lg flex items-center w-full justify-center bg-green-300 cursor-pointer`}
          onClick={goToCart}
        >
          SEE ORDER
        </button>
      </div>
    </div>
  );
};

export default CategoryPage;
