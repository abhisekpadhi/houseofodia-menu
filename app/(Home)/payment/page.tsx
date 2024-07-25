"use client";

import { TBill, TCart, TDish } from "@/src/models/common";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PaymentMethods = ["CASH", "UPI", "CARD"];

const Payment = () => {
  const router = useRouter();
  const [cart, setCart] = useState<TCart>({ items: [] });
  const [method, setMethod] = useState<string>("");

  useEffect(() => {
    // fetch items from local storage
    localforage.getItem<TBill>("bill").then((data) => {
      if (data) {
        setCart(data.cart);
        setMethod(data.method);
      }
    });
  }, []);

  const handlePaymentMethod = (method: string) => {
    setMethod(method);
  };

  const handleClear = () => {
    localforage.setItem("cart", { items: [] }).then((_) => {
      setCart({ items: [] });
      router.push("/category");
    });
  };

  const handleBack = () => {
    router.push("/category");
  };

  const totalAmount = cart
    ? cart.items.reduce(
        (sum: number, item: TDish) => sum + item.price * item.qty,
        0
      )
    : 0;

  const onClickPay = () => {
    localforage.getItem<TBill>("bill").then((data) => {
      localforage
        .setItem<TBill>("bill", {
          ...data,
          method: method,
        })
        .then((_) => {
          router.push("/bill");
        });
    });
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
          <h1 className="text-xl font-bold pt-2">PAYMENT</h1>
          <button
            className=" text-black bg-red-200 py-2 px-4 rounded-lg"
            onClick={handleClear}
          >
            x CLEAR
          </button>
        </div>
        <div className="">
          {PaymentMethods.map((item, index) => (
            <div
              onClick={() => handlePaymentMethod(item)}
              key={index}
              className={`flex justify-between items-center py-6 px-4 ${
                method === item ? "bg-blue-200" : ""
              }`}
            >
              <div>
                <div className="font-bold">{item}</div>
              </div>
              <div>
                <span>{method === item ? `₹${totalAmount}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-none h-auto p-4">
        <div
          onClick={onClickPay}
          className="py-4 bg-green-300 rounded-lg font-bold text-center"
        >
          PAY
        </div>
      </div>
    </div>
  );
};

export default Payment;
