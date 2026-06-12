"use client";
import {
	BillingContext,
	BILLING_CONTEXT_KEY,
	TBill,
	TBillNoUpdateResp,
} from "@/src/models/common";
import { closeTableFromBilling } from "@/src/utils/order_utils";
import axios from "axios";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaPlus, FaPrint } from "react-icons/fa";

const Divider = () => {
  return <div className="my-2 border-t border-solid border-black" />;
};

const Receipt = () => {
  const router = useRouter();
  const [bill, setBill] = useState<TBill | null>(null);
  const [billingContext, setBillingContext] =
    useState<BillingContext | null>(null);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    localforage.getItem<TBill>("bill").then((data) => {
      if (data) {
        setBill(data);
      }
    });
    localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY).then((context) => {
      setBillingContext(context);
    });
  }, []);

  const handleBack = () => {
    router.push(
      billingContext?.source === "orders" ? "/order" : "/freeflow"
    );
  };

  if (!bill) {
    return <div>Loading...</div>;
  }

  const staffWelfare = bill.staffWelfare ?? 0;
  const discount = Math.max(
    0,
    Math.floor(bill.subtotal - bill.payable + staffWelfare)
  );
  const upiAmount = Math.max(0, bill.payable);
  const upiPayload = `upi://pay?pa=q030249494@ybl&pn=Tangify&am=${upiAmount}&cu=INR`;
  const upiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=225x225&data=${encodeURIComponent(
    upiPayload
  )}`;

  const onClickCloseTable = async () => {
    setProcessing(true);
    try {
      const updateResp = await axios.post<TBillNoUpdateResp>("/api/bill_no", {
        bill_no: parseInt(bill.billNumber) + 1,
      });

      if (!updateResp.data.success) {
        alert("Error updating bill number");
        return;
      }

      const billingContext =
        await localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY);

      await localforage.setItem("cart", { items: [] });
      await localforage.setItem("bill", null);
      await localforage.removeItem(BILLING_CONTEXT_KEY);

      if (billingContext?.source === "orders") {
        await closeTableFromBilling(billingContext);
        router.push("/order");
        return;
      }

      router.push("/freeflow");
    } finally {
      setProcessing(false);
    }
  };

  if (processing) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm font-semibold text-gray-600 hover:text-black"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold">Bill</h1>
          <div className="w-12" />
        </div>
      </div>
      <div
        className="text-xs"
        style={{ maxWidth: "58mm", fontFamily: "Helvetica" }}
      >
        <h1 className="text-center font-bold">Tangify</h1>
        <p className="text-center">Estimate</p>
        <p className="text-center">Sarjapura, BLR, KA - 562125</p>
        <p className="text-center">Ph: 7760601643</p>
        <p className="text-center">FSSAI: 21224010000927</p>
        <Divider />
        <div className="flex justify-between">
          <span>Bill No</span>
          <span>{bill.billNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{bill.date}</span>
        </div>
        <div className="flex justify-between">
          <span>Time</span>
          <span>{bill.time}</span>
        </div>
        <Divider />
        <div>
          {bill.cart.items.map((item, index) => (
            <div className="flex justify-between" key={index}>
              <span>
                {item.qty}x {item.name}
              </span>
              <span>{item.price * item.qty}</span>
            </div>
          ))}
        </div>
        <Divider />
        <div className="flex justify-between">
          <span>SubTotal</span>
          <span>{bill.subtotal}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <span>Membership savings</span>
            <span>-{discount}</span>
          </div>
        )}
        {staffWelfare > 0 && (
          <div className="flex justify-between">
            <span>Service charge (optional)</span>
            <span>{staffWelfare}</span>
          </div>
        )}
        {/* <div className="flex justify-between">
        <span>CGST @2.5%</span>
        <span>21</span>
      </div>
      <div className="flex justify-between">
        <span>SGST @2.5%</span>
        <span>21</span>
      </div> */}
        <Divider />
        <div className="flex justify-between">
          <span>Payable ({bill.method})</span>
          <span>₹{bill.payable}</span>
        </div>
        <p className="text-center mt-2">Thank you. Please visit again.</p>
        <div className="mt-3 flex flex-col items-center">
          <p className="text-center font-semibold">Scan & Pay (UPI)</p>
          <img
            src={upiQrUrl}
            alt={`UPI QR for ₹${upiAmount}`}
            width={140}
            height={140}
            className="mt-1"
          />
        </div>
        <br />
        <br />
        <br />
      </div>
      <div className="px-6 py-4 space-y-3 print:hidden">
        <button
          type="button"
          className="w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold flex items-center justify-center transition-colors"
          onClick={() => window.print()}
        >
          <FaPrint className="mr-2" /> Print
        </button>

        <button
          type="button"
          className="w-full py-3 rounded-lg bg-black hover:bg-gray-800 text-white text-sm font-bold flex items-center justify-center transition-colors"
          onClick={onClickCloseTable}
        >
          <FaPlus className="mr-2" /> Close table
        </button>
      </div>
    </div>
  );
};

export default Receipt;
