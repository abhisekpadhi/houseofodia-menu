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
  const [membership, setMembership] = useState<"none" | "monthly" | "yearly">(
    "none"
  );

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

  const handleMembershipSelect = (value: "monthly" | "yearly") => {
    setMembership((prev) => (prev === value ? "none" : value));
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

  const discountRate =
    membership === "monthly" ? 0.1 : membership === "yearly" ? 0.2 : 0;
  const discountedSubtotal = totalAmount - totalAmount * discountRate;
  const payableAmount = discountedSubtotal;

  const onClickPay = () => {
    localforage.getItem<TBill>("bill").then((data) => {
      localforage
        .setItem<TBill>("bill", {
          ...data,
          method: method,
          payable: payableAmount,
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
        <div className="px-4 py-2">
          <p className="text-sm font-semibold mb-2">Membership (optional)</p>
          <div className="flex gap-3">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 border rounded-lg py-2 text-xs ${
                membership === "monthly" ? "border-black bg-gray-100" : "border-gray-300"
              }`}
              onClick={() => handleMembershipSelect("monthly")}
            >
              <span
                className={`w-3 h-3 rounded-full border ${
                  membership === "monthly" ? "bg-black border-black" : "border-gray-400"
                }`}
              />
              <span>Monthly (10% off)</span>
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 border rounded-lg py-2 text-xs ${
                membership === "yearly" ? "border-black bg-gray-100" : "border-gray-300"
              }`}
              onClick={() => handleMembershipSelect("yearly")}
            >
              <span
                className={`w-3 h-3 rounded-full border ${
                  membership === "yearly" ? "bg-black border-black" : "border-gray-400"
                }`}
              />
              <span>Yearly (20% off)</span>
            </button>
          </div>
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
                  <span>{method === item ? `₹${payableAmount}` : ""}</span>
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
