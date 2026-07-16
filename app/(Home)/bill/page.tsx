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
import {
  CUSTOMER_PHONE_DIGITS,
  isValidCustomerPhone,
} from "@/src/utils/order_utils";
import localforage from "localforage";
import { ConfirmModalActions, LoadingSpinner } from "@/components/ui/touch-controls";
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

async function saveWithRetry<T>(
  operation: () => Promise<T>,
  onAttempt?: (attempt: number) => void
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BILL_SAVE_ATTEMPTS; attempt += 1) {
    onAttempt?.(attempt);
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
  const preRoundPayable = roundCurrency(
    taxableAmount + cgst + sgst + staffWelfare
  );
  const payable = Math.ceil(preRoundPayable);
  const roundOff = roundCurrency(payable - preRoundPayable);

  return {
    discount,
    cgst,
    sgst,
    roundOff,
    payable,
  };
};

const Divider = () => {
  return <div className="my-2 border-t border-solid border-black" />;
};

function CustomerPhoneModal({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [visibleViewport, setVisibleViewport] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const isValid = isValidCustomerPhone(value);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const updateVisibleViewport = () => {
      setVisibleViewport({
        top: viewport.offsetTop,
        height: viewport.height,
      });
    };

    updateVisibleViewport();
    viewport.addEventListener("resize", updateVisibleViewport);
    viewport.addEventListener("scroll", updateVisibleViewport);
    return () => {
      viewport.removeEventListener("resize", updateVisibleViewport);
      viewport.removeEventListener("scroll", updateVisibleViewport);
    };
  }, []);

  return (
    <div
      className="fixed left-0 right-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-4 transition-[top,height] duration-150 print:hidden"
      style={
        visibleViewport
          ? {
              top: `${visibleViewport.top}px`,
              height: `${visibleViewport.height}px`,
            }
          : { top: 0, bottom: 0 }
      }
      onClick={onCancel}
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-bold">Customer phone</h2>
          <p className="text-sm text-gray-600 mt-2">
            Enter a 10-digit Indian mobile number.
          </p>
          <label htmlFor="customer-phone" className="sr-only">
            Customer phone
          </label>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">+91</span>
            <input
              id="customer-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              autoFocus
              maxLength={CUSTOMER_PHONE_DIGITS}
              value={value}
              onChange={(event) =>
                onChange(
                  event.target.value.replace(/\D/g, "").slice(0, CUSTOMER_PHONE_DIGITS)
                )
              }
              placeholder="10-digit phone"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm touch-manipulation"
            />
          </div>
          {value.length > 0 && !isValid ? (
            <p className="text-xs text-red-600 mt-2">
              Enter exactly {CUSTOMER_PHONE_DIGITS} digits.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Optional — used as customer ID when saving the bill.
            </p>
          )}
        </div>
        <ConfirmModalActions
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={value ? "Save phone" : "Clear phone"}
          confirmDisabled={value.length > 0 && !isValid}
        />
      </div>
    </div>
  );
}

const Receipt = () => {
  const router = useRouter();
  const [bill, setBill] = useState<TBill | null>(null);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(1);
  const [busyMessage, setBusyMessage] = useState("Saving bill…");
  const [saveFailureOpen, setSaveFailureOpen] = useState(false);
  const [fallbackAction, setFallbackAction] = useState<"print" | "close">(
    "print"
  );
  const [fullSize, setFullSize] = useState(false);
  const [showPaymentQr, setShowPaymentQr] = useState(true);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const isBusy = saving || processing;
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
    if (isBusy) {
      return;
    }
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
    if (isBusy) {
      return;
    }
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
    if (isBusy) {
      return;
    }
    void updateBill({
      ...bill,
      method,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
  };

  const openPhoneModal = () => {
    if (isBusy) {
      return;
    }
    setPhoneDraft(bill.customerPhone ?? "");
    setPhoneModalOpen(true);
  };

  const handleSaveCustomerPhone = () => {
    const trimmed = phoneDraft.trim();
    if (trimmed && !isValidCustomerPhone(trimmed)) {
      return;
    }
    void updateBill({
      ...bill,
      customerPhone: trimmed || undefined,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
    setPhoneModalOpen(false);
  };

  const persistBillToBackend = async (
    billToSave: TBill,
    context: BillingContext
  ): Promise<TBill> => {
    const savingBill = {
      ...billToSave,
      backendStatus: "saving" as const,
      updatedAt: Date.now(),
    };
    await updateBill(savingBill);
    const stored = await saveWithRetry(
      () => saveBillToBackend(savingBill, context),
      (attempt) => {
        setSaveAttempt(attempt);
        setBusyMessage(
          attempt === 1
            ? "Saving bill…"
            : `Retrying save… attempt ${attempt} of ${BILL_SAVE_ATTEMPTS}`
        );
      }
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
    await saveBillingSession(context, savedBill.cart, savedBill);
    await notifyOrderOpsChange("billing");
    return savedBill;
  };

  const handleSaveAndGoBack = async () => {
    if (!billingContext || isBusy) {
      return;
    }
    const needsSave =
      !bill.backendBillId || bill.backendSavedAt !== bill.updatedAt;
    if (!needsSave) {
      router.push("/cart");
      return;
    }
    setBusyMessage("Saving bill…");
    setSaveAttempt(1);
    setSaving(true);
    try {
      await persistBillToBackend(bill, billingContext);
      router.push("/cart");
    } catch {
      const failedBill: TBill = {
        ...bill,
        billNumber: bill.backendBillId
          ? bill.billNumber
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

  const handlePrint = async () => {
    if (!billingContext || isBusy) {
      return;
    }
    if (bill.backendBillId) {
      window.print();
      return;
    }
    setBusyMessage("Saving bill…");
    setSaveAttempt(1);
    setSaving(true);
    try {
      await persistBillToBackend(bill, billingContext);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      window.print();
    } catch {
      const failedBill: TBill = {
        ...bill,
        billNumber: bill.backendBillId
          ? bill.billNumber
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
    `flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      active
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const finalizeCloseTable = async (
    context: BillingContext,
    closedBill: TBill = bill
  ) => {
    const billSummary = {
      subtotal: closedBill.subtotal,
      cgst: closedBill.cgst,
      sgst: closedBill.sgst,
      roundOff: closedBill.roundOff ?? 0,
      payable: closedBill.payable,
      ...(closedBill.backendBillId || closedBill.billNumber !== "Pending"
        ? { billNumber: closedBill.backendBillId ?? closedBill.billNumber }
        : {}),
    };

    await localforage.setItem("cart", { items: [] });
    await localforage.setItem("bill", null);
    await localforage.removeItem(BILLING_CONTEXT_KEY);
    await removeBillingSession(context.sessionId);
    await notifyOrderOpsChange("billing");

    if (context.source === "orders") {
      await closeTableFromBilling(context, billSummary);
      router.push("/order");
      return;
    }
    router.push("/freeflow");
  };

  const onClickCloseTable = async () => {
    if (isBusy) {
      return;
    }
    setBusyMessage("Closing table…");
    setSaveAttempt(1);
    setProcessing(true);
    try {
      const context =
        await localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY);
      if (!context) {
        alert("Billing session is missing.");
        return;
      }

      let closedBill = bill;
      if (!bill.backendBillId || bill.backendSavedAt !== bill.updatedAt) {
        setBusyMessage("Saving bill…");
        closedBill = await persistBillToBackend(bill, context);
        setBusyMessage("Closing table…");
      }
      await finalizeCloseTable(context, closedBill);
    } catch {
      setFallbackAction("close");
      setSaveFailureOpen(true);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintFallbackCopies = () => {
    if (isBusy) {
      return;
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="ops-sticky-header bg-white border-b px-6 pb-4 print:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={isBusy}
            className="text-sm font-semibold text-gray-600 hover:text-black disabled:opacity-40 disabled:cursor-not-allowed"
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
              disabled={isBusy}
              className={tabClass(membership === "monthly")}
              onClick={() => handleMembershipSelect("monthly")}
            >
              Monthly (10% off)
            </button>
            <button
              type="button"
              disabled={isBusy}
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
                disabled={isBusy}
                onClick={() => handlePaymentMethod(method.value)}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Customer phone (optional)
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={openPhoneModal}
            className={`w-full rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              bill.customerPhone
                ? "border-green-500 bg-green-100 text-green-900"
                : "border-gray-200 bg-white hover:bg-gray-50 text-gray-800"
            }`}
          >
            {bill.customerPhone
              ? `📱 +91 ${bill.customerPhone}`
              : "📱 Add customer phone"}
          </button>
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
        {(bill.roundOff ?? 0) > 0 && (
          <div className="flex justify-between">
            <span>Round off</span>
            <span>{formatCurrency(bill.roundOff ?? 0)}</span>
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
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isBusy}
            className="basis-[70%] py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void handleSaveAndGoBack()}
          >
            {saving ? "Saving…" : "Save & go back"}
          </button>
          <button
            type="button"
            disabled={isBusy}
            className="basis-[30%] py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void handlePrint()}
          >
            <FaPrint className="mr-2" /> Print
          </button>
        </div>

        <button
          type="button"
          disabled={isBusy}
          className="w-full py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setFullSize((value) => !value)}
        >
          {fullSize ? "Receipt size (58mm)" : "Full size"}
        </button>

        {bill.method === "CASH/UPI" ? (
          <button
            type="button"
            disabled={isBusy}
            className="w-full py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setShowPaymentQr((value) => !value)}
          >
            {showPaymentQr ? "Hide payment QR" : "Show payment QR"}
          </button>
        ) : null}

        <button
          type="button"
          disabled={isBusy}
          className="w-full py-3 rounded-lg bg-black hover:bg-gray-800 text-white text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void onClickCloseTable()}
        >
          <FaCheck className="mr-2" />{" "}
          {processing ? "Closing…" : "Close table"}
        </button>
      </div>
      {phoneModalOpen ? (
        <CustomerPhoneModal
          value={phoneDraft}
          onChange={setPhoneDraft}
          onCancel={() => setPhoneModalOpen(false)}
          onConfirm={handleSaveCustomerPhone}
        />
      ) : null}
      {isBusy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 print:hidden">
          <div className="w-full max-w-sm rounded-xl bg-white px-6 py-8 shadow-xl text-center">
            <LoadingSpinner className="h-8 w-8 mx-auto text-black" />
            <p className="mt-4 text-base font-semibold text-gray-900">
              {busyMessage}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Please wait. Do not tap other buttons.
            </p>
            {saving || busyMessage.startsWith("Saving") || busyMessage.startsWith("Retrying") ? (
              <p className="mt-1 text-xs text-gray-500">
                Attempt {saveAttempt} of {BILL_SAVE_ATTEMPTS}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
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
