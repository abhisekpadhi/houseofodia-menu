"use client";

import { TBill, TBillNoResp, TCart, TDish } from "@/src/models/common";
import axios from "axios";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PaymentMethods = ["CASH", "UPI", "CARD"];

const Cart = () => {
  const router = useRouter();
  const [cart, setCart] = useState<TCart>({ items: [] });
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [attribute, setAttribute] = useState("");
  const [changeTo, setChangeTo] = useState("");

  useEffect(() => {
    // fetch items from local storage
    localforage.getItem<TCart>("cart").then((data) => {
      if (data) {
        setCart(data);
      }
    });
  });

  const handleClear = () => {
    setCart({ items: [] });
    localforage.setItem("cart", { items: [] }).then((_) => {
      localforage.setItem("bill", null).then((_) => {
        router.push("/category");
      });
    });
  };

  const handleBack = () => {
    router.push("/category");
  };

  const totalAmount = cart.items.reduce(
    (sum: number, item: TDish) => sum + item.price * item.qty,
    0
  );

  const onClickPay = async () => {
    setProcessing(true);
    try {
      const response = await axios.get<TBillNoResp>("/api/bill_no");
      const bill_no = response.data.bill_no;

      localforage
        .setItem<TBill>("bill", {
          method: "CASH",
          billNumber: bill_no.toString(),
          date: new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          }),
          time: new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          cart: cart,
          subtotal: totalAmount,
          cgst: totalAmount * 0,
          sgst: totalAmount * 0,
          payable: totalAmount,
        })
        .then((_) => {
          setProcessing(false);
          router.push("/payment");
        });
    } catch (error) {
      setProcessing(false);
      alert("Failed to update bill number, err:" + error);
    }
  };

  const handleRemove = () => {
    if (selectedItem === null) {
      return;
    }
    const newCart = { ...cart };
    newCart.items.splice(selectedItem, 1);

    localforage.setItem<TCart>("cart", newCart).then((_) => {
      setCart(newCart);
      setSelectedItem(null);
    });
  };

  const handleNumPress = (num: number) => {
    if (attribute === "") {
      return;
    }
    setChangeTo((prev) => prev + num.toString());
  };

  const handleSave = () => {
    if (attribute === "qty") {
      // update qty of cart item
      const newQty = parseInt(changeTo);
      if (isNaN(newQty)) {
        return;
      }
      if (newQty <= 0) {
        handleRemove();
      }
      const newCart = { ...cart };
      newCart.items[selectedItem].qty = newQty;
      localforage.setItem<TCart>("cart", newCart).then((_) => {
        setCart(newCart);
      });

      setAttribute("");
      setChangeTo("");
    }

    if (attribute === "price") {
      // update price of cart item
      const newPrice = parseInt(changeTo);
      if (isNaN(newPrice)) {
        return;
      }
      const newCart = { ...cart };
      newCart.items[selectedItem].price = newPrice;
      localforage.setItem<TCart>("cart", newCart).then((_) => {
        setCart(newCart);
      });

      setAttribute("");
      setChangeTo("");
    }
  };

  const changeMode = (m: string) => {
    if (m === attribute) {
      setAttribute("");
      setChangeTo("");
      return;
    }
    if (selectedItem !== null) {
      setAttribute(m);
    }
  };

  const handleCartItemSelect = (index: number) => {
    if (selectedItem === index) {
      setSelectedItem(null);
      setAttribute("");
      setChangeTo("");

      return;
    }
    setSelectedItem(index);
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-grow overflow-auto">
        <div className="flex justify-between items-cente p-2">
          <button
            onClick={handleBack}
            className="text-white bg-black px-4 py-2 rounded-lg"
          >
            &lt; BACK
          </button>
          <h1 className="text-xl font-bold pt-2">CART</h1>
          <button
            className=" text-black bg-red-200 py-2 px-4 rounded-lg"
            onClick={handleClear}
          >
            x CLEAR
          </button>
        </div>
        <div className="">
          {cart.items.map((item, index) => (
            <div
              onClick={() => {
                handleCartItemSelect(index);
              }}
              key={index}
              className={`flex justify-between items-center py-2 px-4 ${
                selectedItem === index ? "bg-blue-200" : ""
              }`}
            >
              <div>
                <div className="font-bold">{item.name}</div>
                <div className="text-sm ">
                  {item.qty} Units x {item.price}/unit
                </div>
              </div>
              <div>
                <span>₹{item.price * item.qty}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-none h-auto">
        <div className="flex justify-center mt-2 mx-4">
          <button
            className={`py-2 px-6 rounded-lg flex items-center w-full justify-center ${
              attribute !== "" ? "bg-green-300" : "bg-gray-200"
            } cursor-pointer`}
            onClick={handleSave}
          >
            Change {attribute} to {changeTo}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center p-4">
          <div
            onClick={() => {
              changeMode("qty");
            }}
            className={`${
              selectedItem === null || attribute !== "qty"
                ? "bg-gray-200"
                : "bg-yellow-300"
            } py-2 rounded-lg`}
          >
            QTY
          </div>
          <div
            onClick={() => {
              changeMode("price");
            }}
            className={`${
              selectedItem === null || attribute !== "price"
                ? "bg-gray-200"
                : "bg-green-300"
            } py-2 rounded-lg`}
          >
            PRICE
          </div>
          <div
            onClick={handleRemove}
            className={`${
              selectedItem === null ? "bg-gray-200" : "bg-red-200"
            } py-2 rounded-lg`}
          >
            REMOVE
          </div>

          {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => {
            return (
              <div
                key={num}
                onClick={() => handleNumPress(num)}
                className="py-2 bg-gray-200 rounded-lg"
              >
                {num}
              </div>
            );
          })}
          <div
            onClick={() => handleNumPress(0)}
            className="py-2 bg-gray-200 rounded-lg"
          >
            0
          </div>
          {processing ? (
            <div>Processing...</div>
          ) : (
            <div
              onClick={onClickPay}
              className="py-2 bg-green-300 rounded-lg col-span-2 text-sm font-bold"
            >
              {cart.items.length} Items · ₹{totalAmount} · PAY
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Cart;
