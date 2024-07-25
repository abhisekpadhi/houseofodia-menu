"use client";
import { TBill, TBillNoUpdateResp } from "@/src/models/common";
import axios from "axios";
import localforage from "localforage";
import { useEffect, useState } from "react";
import { FaPlus, FaPrint } from "react-icons/fa";
import { useRouter } from "next/navigation";

const Receipt = () => {
	const router = useRouter();
  const [bill, setBill] = useState<TBill | null>(null);
  const [processing, setProcessing] = useState(false)
  useEffect(() => {
    localforage.getItem<TBill>("bill").then((data) => {
      if (data) {
        setBill(data);
      }
    });
  }, []);

  if (!bill) {
    return <div>Loading...</div>;
  }

  const onClickNewOrder = async () => {
	setProcessing(true);
    const updateResp = await axios.post<TBillNoUpdateResp>("/api/bill_no", {
      bill_no: parseInt(bill.billNumber) + 1,
    });

	setProcessing(false);
	if (!updateResp.data.success) {
		alert("Error updating bill number");
		return;
	}
    localforage.setItem("cart", { items: [] }).then((_) => {
      localforage.setItem("bill", null).then((_) => {
        router.push("/category");
      });
    });
  };

  if (processing) {
	  return <div>Loading...</div>
  }

  return (
    <div className="text-xs" style={{ maxWidth: "58mm" }}>
      <h1 className="text-center font-bold">T A N G I F Y</h1>
      <p className="text-center">Estimate</p>
      <p className="text-center">
        Jeevan Bima Nagar, Indiranagar, Bengaluru, KA - 560075
      </p>
      <p className="text-center">Ph: 7855074030</p>
      <p className="text-center">FSSAI: 21224010000927</p>
      <div className="my-2 border-t border-solid"></div>
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
      <div className="my-2 border-t border-solid"></div>
      <div>
        {bill.cart.items.map((item, index) => (
          <div className="flex justify-between" key={index}>
            <span>
              {item.qty}x {item.name}
            </span>
            <span>{item.price}</span>
          </div>
        ))}
      </div>
      <div className="my-2 border-t border-solid"></div>
      <div className="flex justify-between">
        <span>SubTotal</span>
        <span>{bill.subtotal}</span>
      </div>
      {/* <div className="flex justify-between">
        <span>CGST @2.5%</span>
        <span>21</span>
      </div>
      <div className="flex justify-between">
        <span>SGST @2.5%</span>
        <span>21</span>
      </div> */}
      <div className="my-2 border-t border-solid"></div>
      <div className="flex justify-between font-bold">
        <span>Payable ({bill.method})</span>
        <span>₹{bill.payable}</span>
      </div>
      <p className="text-center mt-2">Thank you. Please visit again.</p>
      <div className="flex justify-center mt-4 print:hidden">
        <button
          className="bg-green-300 py-2 px-6 rounded-lg flex items-center w-full justify-center"
          onClick={() => window.print()}
        >
          <FaPrint className="mr-2" /> PRINT
        </button>
      </div>
      <div className="flex justify-center mt-4 print:hidden">
        <button
          className="bg-black text-white py-2 px-6 rounded-lg flex items-center w-full justify-center"
          onClick={onClickNewOrder}
        >
          <FaPlus className="mr-2" /> NEW ORDER
        </button>
      </div>
    </div>
  );
};

export default Receipt;
