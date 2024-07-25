"use client";

import { TCart, TDish, TStorage } from "@/src/models/common";
import localforage from "localforage";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";

const DishesScreen = () => {
  const params = useSearchParams();
  const router = useRouter();

  const [selectedItems, setSelectedItems] = useState([]);
  const [dishes, setDishes] = React.useState<TDish[]>([]);

  const handleItemClick = (index: number, item: TDish) => {
    const cart = localforage.getItem<TCart>("cart").then((data) => {
      if (data) {
        if (data.items.findIndex((o) => o.name === item.name) !== -1) {
          // already in cart -- do nothing
          // localforage.setItem('cart', {items: data.items.filter(o => o.name !== item.name)})
        } else {
          // add item to cart
          localforage.setItem("cart", { items: [...data.items, item] });
        }
      } else {
        localforage.setItem("cart", { items: [item] });
      }
    });
    setSelectedItems((prev) =>
      prev.includes(index) ? prev : [...prev, index]
    );
  };

  const goToCart = () => {
    router.push("/cart");
  };

  //   const totalAmount = selectedItems.reduce(
  //     (acc, index) => acc + dishes[index].price,
  //     0
  //   );

  useEffect(() => {
    const category = params.get("category");

    if (category) {
      localforage.getItem<TStorage>("menu").then((data) => {
        if (category in data.menu) {
          const dishes = data.menu[params.get("category")];
          const items: TDish[] = [];
          dishes.forEach((dish) => {
            if (dish.price.includes("/")) {
              items.push({
                qty: 1,
                name: `${dish.name}-half`,
                price: parseFloat(dish.price.split("/")[0]),
              });
              items.push({
                qty: 1,
                name: `${dish.name}-full`,
                price: parseFloat(dish.price.split("/")[1]),
              });
            } else {
              items.push({
                qty: 1,
                name: dish.name,
                price: parseFloat(dish.price),
              });
            }
          });
          setDishes(items);

          localforage.getItem<TCart>("cart").then((cart) => {
            if (cart) {

              const _items = cart.items.map((item) =>
                items.findIndex((o) => o.name === item.name)
              );
              const itemsInCart: TDish[] = [];
              _items.forEach((index) => {
                if (index !== -1) {
                  itemsInCart.push(items[index]);
                }
              });

              setSelectedItems(_items);
            }
          });
        }
      });
    }
  }, []);

  return (
    <div className="p-4">
      <div className="flex-none bg-white mb-4">
        <button
          onClick={() => {
            router.back();
          }}
          className="text-white bg-black px-4 py-2 rounded-lg"
        >
          {"< BACK"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {dishes.map((item, index) => (
          <div
            key={index}
            className={`p-4 text-center cursor-pointer ${
              selectedItems.includes(index) ? "bg-green-300" : "bg-gray-300"
            }`}
            onClick={() => handleItemClick(index, item)}
          >
            <p>{item.name}</p>
            <p>{item.price}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <button
          className={`py-2 px-6 rounded-lg flex items-center w-full justify-center bg-green-300 cursor-pointer`}
          onClick={() => goToCart()}
        >
          SEE ORDER
        </button>
      </div>
    </div>
  );
};

export default DishesScreen;
