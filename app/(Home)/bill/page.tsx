"use client";
import {
	BillingContext,
	BILLING_CONTEXT_KEY,
	TBill,
} from "@/src/models/common";
import { closeTableFromBilling } from "@/src/utils/order_utils";
import {
  getBillingSession,
  removeBillingSession,
  saveBillingSession,
} from "@/src/utils/billing_state";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import { notifyOrderOpsChange } from "@/src/utils/order_ops_sync";
import { saveBillToBackend } from "@/src/utils/tangify_api";
import localforage from "localforage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { FaCheck, FaPrint } from "react-icons/fa";

type Membership = "none" | "monthly" | "yearly";

const PAYMENT_METHODS = [
  { value: "CASH/UPI", label: "💵 CASH / 📱 UPI" },
  { value: "CARD", label: "💳 CARD" },
] as const;

const roundCurrency = (amount: number) => Math.round(amount * 100) / 100;
const formatCurrency = (amount: number) => roundCurrency(amount).toFixed(2);
const BILL_SAVE_ATTEMPTS = 3;
const BILL_SAVE_RETRY_DELAY_MS = 5_000;

const wait = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

async function saveWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BILL_SAVE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < BILL_SAVE_ATTEMPTS) {
        await wait(BILL_SAVE_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

const calculateBillAmounts = (
  subtotal: number,
  membership: Membership,
  staffWelfare = 0
) => {
  const discountRate =
    membership === "monthly" ? 0.1 : membership === "yearly" ? 0.2 : 0;
  const discount = roundCurrency(subtotal * discountRate);
  const taxableAmount = subtotal - discount;
  const cgst = roundCurrency(taxableAmount * 0.025);
  const sgst = roundCurrency(taxableAmount * 0.025);

  return {
    discount,
    cgst,
    sgst,
    payable: roundCurrency(taxableAmount + cgst + sgst + staffWelfare),
  };
};

const Divider = () => {
  return <div className="my-2 border-t border-solid border-black" />;
};

const Receipt = () => {
  const router = useRouter();
  const [bill, setBill] = useState<TBill | null>(null);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailureOpen, setSaveFailureOpen] = useState(false);
  const [fallbackAction, setFallbackAction] = useState<"print" | "close">(
    "print"
  );
  const [fullSize, setFullSize] = useState(false);
  const [showPaymentQr, setShowPaymentQr] = useState(true);
  useEffect(() => {
    const loadBill = async () => {
      let context =
        await localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY);
      if (context && !context.sessionId) {
        const localBill = await localforage.getItem<TBill>("bill");
        const sessionId =
          localBill?.sessionId ?? `legacy:${context.source}:${crypto.randomUUID()}`;
        context = { ...context, sessionId };
        await localforage.setItem(BILLING_CONTEXT_KEY, context);
      }
      setBillingContext(context);
      const synced = context
        ? await getBillingSession(context.sessionId)
        : null;
      const data = synced?.bill ?? (await localforage.getItem<TBill>("bill"));
      if (data) {
        const membership = data.membership ?? "none";
        const totals = calculateBillAmounts(
          data.subtotal,
          membership,
          data.staffWelfare
        );
        const sessionId = data.sessionId || context?.sessionId || `legacy:${crypto.randomUUID()}`;
        const updatedBill = {
          ...data,
          ...totals,
          membership,
          sessionId,
          stateKey: data.stateKey || `${sessionId}::checkout`,
          updatedAt: data.updatedAt ?? Date.now(),
        };
        setBill(updatedBill);
        await localforage.setItem<TBill>("bill", updatedBill);
      }
    };
    const handleSyncedUpdate = () => void loadBill();
    void loadBill();
    window.addEventListener(ORDER_OPS_EVENT, handleSyncedUpdate);
    return () => {
      window.removeEventListener(ORDER_OPS_EVENT, handleSyncedUpdate);
    };
  }, []);

  const handleBack = () => {
    router.push("/cart");
  };

  if (!bill) {
    return <div>Loading...</div>;
  }

  const staffWelfare = bill.staffWelfare ?? 0;
  const membership = bill.membership ?? "none";
  const { discount } = calculateBillAmounts(
    bill.subtotal,
    membership,
    staffWelfare
  );
  const upiAmount = Math.max(0, bill.payable);
  const upiPayload = `upi://pay?pa=q030249494@ybl&pn=Tangify&am=${upiAmount}&cu=INR`;
  const upiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${fullSize ? "300x300" : "225x225"}&data=${encodeURIComponent(
    upiPayload
  )}`;

  const updateBill = async (updatedBill: TBill) => {
    setBill(updatedBill);
    await localforage.setItem<TBill>("bill", updatedBill);
    if (billingContext) {
      await saveBillingSession(billingContext, updatedBill.cart, updatedBill);
      await notifyOrderOpsChange("billing");
    }
  };

  const handleMembershipSelect = (value: Exclude<Membership, "none">) => {
    const nextMembership = membership === value ? "none" : value;
    const totals = calculateBillAmounts(
      bill.subtotal,
      nextMembership,
      staffWelfare
    );
    void updateBill({
      ...bill,
      ...totals,
      membership: nextMembership,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
  };

  const handlePaymentMethod = (method: string) => {
    void updateBill({
      ...bill,
      method,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
  };

  const handlePrint = async () => {
    if (!billingContext || saving) {
      return;
    }
    if (bill.backendBillId) {
      window.print();
      return;
    }
    setSaving(true);
    const savingBill = {
      ...bill,
      backendStatus: "saving" as const,
      updatedAt: Date.now(),
    };
    await updateBill(savingBill);
    try {
      const stored = await saveWithRetry(() =>
        saveBillToBackend(savingBill, billingContext)
      );
      const savedAt = Date.now();
      const savedBill: TBill = {
        ...savingBill,
        billNumber: stored.id,
        backendBillId: stored.id,
        backendStatus: "saved",
        backendSavedAt: savedAt,
        updatedAt: savedAt,
      };
      flushSync(() => setBill(savedBill));
      await localforage.setItem<TBill>("bill", savedBill);
      await saveBillingSession(billingContext, savedBill.cart, savedBill);
      await notifyOrderOpsChange("billing");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      window.print();
    } catch {
      const failedBill: TBill = {
        ...savingBill,
        billNumber: savingBill.backendBillId
          ? savingBill.billNumber
          : `UNSAVED-${Date.now().toString().slice(-6)}`,
        backendStatus: "failed",
        updatedAt: Date.now(),
      };
      await updateBill(failedBill);
      setFallbackAction("print");
      setSaveFailureOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
      active
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const finalizeCloseTable = async (context: BillingContext) => {
    await localforage.setItem("cart", { items: [] });
    await localforage.setItem("bill", null);
    await localforage.removeItem(BILLING_CONTEXT_KEY);
    await removeBillingSession(context.sessionId);
    await notifyOrderOpsChange("billing");

    if (context.source === "orders") {
      await closeTableFromBilling(context);
      router.push("/order");
      return;
    }
    router.push("/freeflow");
  };

  const onClickCloseTable = async () => {
    setProcessing(true);
    try {
      const context =
        await localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY);
      if (!context) {
        alert("Billing session is missing.");
        return;
      }

      if (!bill.backendBillId || bill.backendSavedAt !== bill.updatedAt) {
        await saveWithRetry(() => saveBillToBackend(bill, context));
      }
      await finalizeCloseTable(context);
    } catch {
      setFallbackAction("close");
      setSaveFailureOpen(true);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintFallbackCopies = () => {
    const action = fallbackAction;
    flushSync(() => setSaveFailureOpen(false));
    window.print();
    window.setTimeout(() => {
      window.print();
      if (action === "close") {
        void localforage
          .getItem<BillingContext>(BILLING_CONTEXT_KEY)
          .then((context) => {
            if (context) {
              return finalizeCloseTable(context);
            }
          });
      }
    }, 500);
  };

  if (processing) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="ops-sticky-header bg-white border-b px-6 pb-4 print:hidden">
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
      <div className="bg-white border-b px-6 py-4 space-y-4 print:hidden">
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Membership (optional)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={tabClass(membership === "monthly")}
              onClick={() => handleMembershipSelect("monthly")}
            >
              Monthly (10% off)
            </button>
            <button
              type="button"
              className={tabClass(membership === "yearly")}
              onClick={() => handleMembershipSelect("yearly")}
            >
              Yearly (20% off)
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Payment method
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                type="button"
                key={method.value}
                onClick={() => handlePaymentMethod(method.value)}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors ${
                  bill.method === method.value
                    ? "border-green-500 bg-green-100 text-green-900"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={
          fullSize
            ? "w-full px-6 py-4 text-base print:px-0"
            : "text-xs"
        }
        style={{
          maxWidth: fullSize ? undefined : "58mm",
          fontFamily: "Helvetica",
        }}
      >
        <h1 className={`text-center font-bold${fullSize ? " text-2xl" : ""}`}>
          Tangify
        </h1>
        <p className="text-center">GSTIN: 29FIUPM1844M1ZA</p>
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
          <span>{formatCurrency(bill.subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <span>Membership savings</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>CGST @2.5%</span>
          <span>{formatCurrency(bill.cgst)}</span>
        </div>
        <div className="flex justify-between">
          <span>SGST @2.5%</span>
          <span>{formatCurrency(bill.sgst)}</span>
        </div>
        {staffWelfare > 0 && (
          <div className="flex justify-between">
            <span>Service charge (optional)</span>
            <span>{formatCurrency(staffWelfare)}</span>
          </div>
        )}
        <Divider />
        <div className="flex justify-between">
          <span>Payable ({bill.method})</span>
          <span>₹{formatCurrency(bill.payable)}</span>
        </div>
        <p className="text-center mt-2">Thank you. Please visit again.</p>
        {showPaymentQr && bill.method === "CASH/UPI" ? (
          <div className="mt-3 flex flex-col items-center">
            <p className="text-center font-semibold">Scan & Pay (UPI)</p>
            <img
              src={upiQrUrl}
              alt={`UPI QR for ₹${upiAmount}`}
              width={fullSize ? 220 : 140}
              height={fullSize ? 220 : 140}
              className="mt-1"
            />
          </div>
        ) : null}
        <br />
        <br />
        <br />
      </div>
      <div className="px-6 py-4 space-y-3 print:hidden">
        <button
          type="button"
          disabled={saving}
          className="w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50"
          onClick={() => void handlePrint()}
        >
          <FaPrint className="mr-2" /> {saving ? "Saving…" : "Print"}
        </button>

        <button
          type="button"
          className="w-full py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold flex items-center justify-center transition-colors"
          onClick={() => setFullSize((value) => !value)}
        >
          {fullSize ? "Receipt size (58mm)" : "Full size"}
        </button>

        {bill.method === "CASH/UPI" ? (
          <button
            type="button"
            className="w-full py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold flex items-center justify-center transition-colors"
            onClick={() => setShowPaymentQr((value) => !value)}
          >
            {showPaymentQr ? "Hide payment QR" : "Show payment QR"}
          </button>
        ) : null}

        <button
          type="button"
          className="w-full py-3 rounded-lg bg-black hover:bg-gray-800 text-white text-sm font-bold flex items-center justify-center transition-colors"
          onClick={onClickCloseTable}
        >
          <FaCheck className="mr-2" /> Close table
        </button>
      </div>
      {saveFailureOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 print:hidden">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="px-5 py-4 border-b">
              <h2 className="text-lg font-bold">Bill could not be saved</h2>
              <p className="text-sm text-gray-600 mt-2">
                We could not save this bill after 3 attempts. Print two copies
                and keep one copy for your records.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setSaveFailureOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrintFallbackCopies}
                className="rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white"
              >
                Print 2 copies
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Receipt;
