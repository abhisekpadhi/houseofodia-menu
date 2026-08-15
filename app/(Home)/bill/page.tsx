"use client";
import {
	BillingContext,
	BILLING_CONTEXT_KEY,
	TBill,
	TMenuApiItem,
	formatOrderKindLabel,
	isCounterOrderKind,
} from "@/src/models/common";
import {
  closeTableFromBilling,
  CUSTOMER_PHONE_DIGITS,
  formatTableGroupLabel,
  getGroupCustomerDetails,
  getOrdersStore,
  groupOrdersByTable,
  isValidCustomerPhone,
  orderBelongsToBillingGroup,
} from "@/src/utils/order_utils";
import {
  getBillingSession,
  removeBillingSession,
  saveBillingSession,
} from "@/src/utils/billing_state";
import { ORDER_OPS_EVENT } from "@/src/models/order_ops";
import {
  notifyOrderOpsChange,
  requestBillPrint,
} from "@/src/utils/order_ops_sync";
import { isBillPrinterOnline } from "@/src/utils/print_servers";
import { useOrderOpsSync } from "@/context/order-ops-sync";
import { buildDishInternalNameMap } from "@/src/utils/menu_utils";
import { saveBillToBackend } from "@/src/utils/tangify_api";
import localforage from "localforage";
import { ConfirmModalActions, LoadingSpinner } from "@/components/ui/touch-controls";
import { toPng } from "html-to-image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { flushSync } from "react-dom";
import {
  FaCheck,
  FaCompress,
  FaDownload,
  FaExpand,
  FaPrint,
  FaQrcode,
  FaSave,
  FaShareAlt,
} from "react-icons/fa";
import axios from "axios";

type Membership = "none" | "monthly" | "yearly" | "custom";
type CustomDiscountUnit = "rs" | "percent";

type CustomDiscountInput = {
  value: number;
  unit: CustomDiscountUnit;
};

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

const calculateDiscountAmount = (
  subtotal: number,
  membership: Membership,
  custom?: CustomDiscountInput | null,
  maxRupeeDiscount?: number
) => {
  if (membership === "monthly") {
    return roundCurrency(subtotal * 0.1);
  }
  if (membership === "yearly") {
    return roundCurrency(subtotal * 0.2);
  }
  if (membership === "custom" && custom) {
    const value = Math.max(0, custom.value);
    if (custom.unit === "percent") {
      const percent = Math.min(100, value);
      return roundCurrency((subtotal * percent) / 100);
    }
    const rupeeCap = Math.min(
      subtotal,
      maxRupeeDiscount != null && Number.isFinite(maxRupeeDiscount)
        ? Math.max(0, maxRupeeDiscount)
        : subtotal
    );
    return roundCurrency(Math.min(rupeeCap, value));
  }
  return 0;
};

const customDiscountFromBill = (
  bill: Pick<
    TBill,
    "customDiscountValue" | "customDiscountUnit" | "membership"
  >
): CustomDiscountInput | null => {
  if (bill.membership !== "custom") {
    return null;
  }
  return {
    value: bill.customDiscountValue ?? 0,
    unit: bill.customDiscountUnit === "percent" ? "percent" : "rs",
  };
};

const calculateBillAmounts = (
  subtotal: number,
  membership: Membership,
  staffWelfare = 0,
  custom?: CustomDiscountInput | null
) => {
  const undiscountedPayable = (() => {
    const taxableAmount = subtotal;
    const cgst = roundCurrency(taxableAmount * 0.025);
    const sgst = roundCurrency(taxableAmount * 0.025);
    const preRoundPayable = roundCurrency(
      taxableAmount + cgst + sgst + staffWelfare
    );
    return Math.ceil(preRoundPayable);
  })();
  const discount = calculateDiscountAmount(
    subtotal,
    membership,
    custom,
    undiscountedPayable
  );
  const taxableAmount = Math.max(0, subtotal - discount);
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

function CustomDiscountModal({
  amount,
  unit,
  reason,
  subtotal,
  maxPayable,
  canRemove,
  onAmountChange,
  onUnitChange,
  onReasonChange,
  onConfirm,
  onRemove,
  onCancel,
}: {
  amount: string;
  unit: CustomDiscountUnit;
  reason: string;
  subtotal: number;
  maxPayable: number;
  canRemove: boolean;
  onAmountChange: (value: string) => void;
  onUnitChange: (unit: CustomDiscountUnit) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [visibleViewport, setVisibleViewport] = useState<{
    top: number;
    height: number;
  } | null>(null);

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

  const maxRupees = Math.min(subtotal, Math.max(0, maxPayable));
  const maxAmount = unit === "percent" ? 100 : maxRupees;
  const parsedAmount = amount.trim() === "" ? 0 : Number(amount);
  const amountValid =
    amount.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    (unit === "percent"
      ? parsedAmount <= 100
      : parsedAmount <= maxRupees);
  const reasonValid = reason.trim().length > 0;
  const preview = amountValid
    ? calculateDiscountAmount(
        subtotal,
        "custom",
        {
          value: parsedAmount,
          unit,
        },
        maxRupees
      )
    : 0;

  const currentAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  const stepAmount = (delta: number) => {
    const next = Math.min(
      maxAmount,
      Math.max(0, Math.round((currentAmount + delta) * 100) / 100)
    );
    onAmountChange(next === 0 ? "" : String(next));
  };

  const scrollFieldIntoView = (
    event: FocusEvent<HTMLInputElement>
  ) => {
    const target = event.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
      panelRef.current?.scrollTo({
        top: panelRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 250);
  };

  return (
    <div
      className="fixed left-0 right-0 z-50 flex items-end sm:items-center justify-center overflow-y-auto bg-black/40 px-0 sm:px-4 py-0 sm:py-4 transition-[top,height] duration-150 print:hidden"
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
        ref={panelRef}
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-t-xl sm:rounded-xl bg-white shadow-xl pb-[env(safe-area-inset-bottom)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b space-y-4">
          <div>
            <h2 className="text-lg font-bold">Custom discount</h2>
            <p className="text-sm text-gray-600 mt-2">
              Applied on subtotal ₹{formatCurrency(subtotal)}. Max{" "}
              {unit === "percent"
                ? "100%"
                : `₹${formatCurrency(maxRupees)}`}
              .
            </p>
          </div>
          <div>
            <label
              htmlFor="custom-discount-amount"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Amount
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepAmount(-1)}
                disabled={currentAmount <= 0}
                className="w-11 h-11 flex shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 text-xl leading-none touch-manipulation disabled:opacity-40"
                aria-label="Decrease discount amount"
              >
                −
              </button>
              <input
                id="custom-discount-amount"
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onFocus={scrollFieldIntoView}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d.]/g, "");
                  const parts = next.split(".");
                  const normalized =
                    parts.length <= 1
                      ? next
                      : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
                  onAmountChange(normalized.slice(0, 8));
                }}
                placeholder="0"
                className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-base text-center touch-manipulation"
              />
              <button
                type="button"
                onClick={() => stepAmount(1)}
                disabled={currentAmount >= maxAmount}
                className="w-11 h-11 flex shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xl leading-none touch-manipulation disabled:opacity-40"
                aria-label="Increase discount amount"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => onUnitChange("rs")}
                className={`min-h-[44px] flex-1 px-3 text-sm font-bold touch-manipulation ${
                  unit === "rs"
                    ? "bg-black text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                Rs
              </button>
              <button
                type="button"
                onClick={() => onUnitChange("percent")}
                className={`min-h-[44px] flex-1 px-3 text-sm font-bold touch-manipulation border-l border-gray-300 ${
                  unit === "percent"
                    ? "bg-black text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                %
              </button>
            </div>
            {amount.trim() !== "" && !amountValid ? (
              <p className="text-xs text-red-600 mt-2">
                {unit === "percent"
                  ? "Enter a percent from 0.01 to 100."
                  : `Enter an amount up to ₹${formatCurrency(maxRupees)} (payable).`}
              </p>
            ) : preview > 0 ? (
              <p className="text-xs text-red-600 mt-2">
                Discount: ₹{formatCurrency(preview)}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="custom-discount-reason"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Discount reason
            </label>
            <input
              id="custom-discount-reason"
              type="text"
              value={reason}
              onFocus={scrollFieldIntoView}
              onChange={(event) => onReasonChange(event.target.value.slice(0, 80))}
              placeholder="e.g. Manager comp"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm touch-manipulation"
            />
            {!reasonValid ? (
              <p className="text-xs text-gray-500 mt-2">Required for custom discount.</p>
            ) : null}
          </div>
        </div>
        {canRemove ? (
          <div className="px-4 pt-4">
            <button
              type="button"
              onClick={onRemove}
              className="w-full min-h-[44px] rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-semibold touch-manipulation active:bg-red-100"
            >
              Remove discount
            </button>
          </div>
        ) : null}
        <ConfirmModalActions
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel="Apply discount"
          confirmDisabled={!amountValid || !reasonValid}
        />
      </div>
    </div>
  );
}

const Receipt = () => {
  const router = useRouter();
  const sync = useOrderOpsSync();
  const billPrinterOnline = isBillPrinterOnline(sync.memberDeviceNames);
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
  const [showPaymentQr, setShowPaymentQr] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [customDiscountModalOpen, setCustomDiscountModalOpen] = useState(false);
  const [customAmountDraft, setCustomAmountDraft] = useState("");
  const [customUnitDraft, setCustomUnitDraft] =
    useState<CustomDiscountUnit>("rs");
  const [customReasonDraft, setCustomReasonDraft] = useState("");
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [supportsShareImage, setSupportsShareImage] = useState(false);
  const [printServerState, setPrintServerState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [printServerError, setPrintServerError] = useState<string | null>(null);
  const [internalNameByBillName, setInternalNameByBillName] = useState<
    Record<string, string>
  >({});
  const billReceiptRef = useRef<HTMLDivElement>(null);
  const isBusy = saving || processing;
  const controlsDisabled = isBusy || downloadingImage;
  useEffect(() => {
    try {
      const probe = new File(
        [new Blob(["x"], { type: "image/png" })],
        "x.png",
        { type: "image/png" }
      );
      setSupportsShareImage(
        typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [probe] })
      );
    } catch {
      setSupportsShareImage(false);
    }
  }, []);
  useEffect(() => {
    axios
      .get<TMenuApiItem[]>("/api/menu", {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      })
      .then((response) => {
        setInternalNameByBillName(buildDishInternalNameMap(response.data));
      })
      .catch(() => {
        setInternalNameByBillName({});
      });
  }, []);
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
        const custom = customDiscountFromBill({ ...data, membership });
        const totals = calculateBillAmounts(
          data.subtotal,
          membership,
          data.staffWelfare,
          custom
        );
        const sessionId = data.sessionId || context?.sessionId || `legacy:${crypto.randomUUID()}`;

        let customerPhone = data.customerPhone?.trim() || undefined;
        if (
          !customerPhone &&
          context?.source === "orders" &&
          isCounterOrderKind(context.kind)
        ) {
          const store = await getOrdersStore();
          const group = groupOrdersByTable(store.orders).find(
            (entry) => entry.key === context.groupKey
          );
          customerPhone = group
            ? getGroupCustomerDetails(group).phone
            : undefined;
        }

        const updatedBill = {
          ...data,
          ...totals,
          membership,
          sessionId,
          stateKey: data.stateKey || `${sessionId}::checkout`,
          ...(customerPhone ? { customerPhone } : {}),
          updatedAt: data.updatedAt ?? Date.now(),
        };
        setBill(updatedBill);
        await localforage.setItem<TBill>("bill", updatedBill);
        if (context && customerPhone && !data.customerPhone) {
          await saveBillingSession(context, updatedBill.cart, updatedBill);
        }
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
  const customDiscount = customDiscountFromBill(bill);
  const { discount } = calculateBillAmounts(
    bill.subtotal,
    membership,
    staffWelfare,
    customDiscount
  );
  const discountLabel =
    membership === "custom" && bill.customDiscountReason?.trim()
      ? `Discount (${bill.customDiscountReason.trim()})`
      : membership === "monthly"
        ? "Discount (Monthly 10%)"
        : membership === "yearly"
          ? "Discount (Yearly 20%)"
          : "Discount";
  const upiAmount = Math.max(0, bill.payable);
  // const upiId = "q030249494@ybl"; // phonepe business
  const upiId = "tangify@slc"; // slice
  const upiAmountFixed = Number(upiAmount).toFixed(2);
  const upiPayload = `upi://pay?pa=${upiId}&pn=Tangify&am=${upiAmountFixed}&cu=INR`;
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

  const handleMembershipSelect = (value: "monthly" | "yearly") => {
    if (isBusy) {
      return;
    }
    const nextMembership = membership === value ? "none" : value;
    const totals = calculateBillAmounts(
      bill.subtotal,
      nextMembership,
      staffWelfare,
      null
    );
    void updateBill({
      ...bill,
      ...totals,
      membership: nextMembership,
      customDiscountValue: undefined,
      customDiscountUnit: undefined,
      customDiscountReason: undefined,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
  };

  const openCustomDiscountModal = () => {
    if (isBusy) {
      return;
    }
    const existing = customDiscountFromBill(bill);
    setCustomAmountDraft(
      existing && existing.value > 0 ? String(existing.value) : ""
    );
    setCustomUnitDraft(existing?.unit ?? "rs");
    setCustomReasonDraft(bill.customDiscountReason ?? "");
    setCustomDiscountModalOpen(true);
  };

  const handleApplyCustomDiscount = () => {
    const parsed = Number(customAmountDraft);
    const reason = customReasonDraft.trim();
    const maxRupees = Math.min(
      bill.subtotal,
      calculateBillAmounts(bill.subtotal, "none", staffWelfare, null).payable
    );
    if (
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      (customUnitDraft === "percent" && parsed > 100) ||
      (customUnitDraft === "rs" && parsed > maxRupees) ||
      !reason
    ) {
      return;
    }
    const custom: CustomDiscountInput = {
      value: roundCurrency(parsed),
      unit: customUnitDraft,
    };
    const totals = calculateBillAmounts(
      bill.subtotal,
      "custom",
      staffWelfare,
      custom
    );
    void updateBill({
      ...bill,
      ...totals,
      membership: "custom",
      customDiscountValue: custom.value,
      customDiscountUnit: custom.unit,
      customDiscountReason: reason,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
    setCustomDiscountModalOpen(false);
  };

  const handleRemoveCustomDiscount = () => {
    if (isBusy) {
      return;
    }
    const totals = calculateBillAmounts(
      bill.subtotal,
      "none",
      staffWelfare,
      null
    );
    void updateBill({
      ...bill,
      ...totals,
      membership: "none",
      customDiscountValue: undefined,
      customDiscountUnit: undefined,
      customDiscountReason: undefined,
      backendStatus: "idle",
      updatedAt: Date.now(),
    });
    setCustomDiscountModalOpen(false);
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

  const handleSave = async () => {
    if (!billingContext || isBusy) {
      return;
    }
    const needsSave =
      !bill.backendBillId || bill.backendSavedAt !== bill.updatedAt;
    if (!needsSave) {
      return;
    }
    setBusyMessage("Saving bill…");
    setSaveAttempt(1);
    setSaving(true);
    try {
      await persistBillToBackend(bill, billingContext);
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

  const sendBillToPrintServer = async () => {
    if (!billingContext || controlsDisabled || printServerState === "sending") {
      return;
    }
    if (bill.cart.items.length === 0) {
      setPrintServerState("error");
      setPrintServerError("No items to print");
      return;
    }

    setPrintServerState("sending");
    setPrintServerError(null);
    try {
      let billToPrint = bill;
      if (!bill.backendBillId || bill.backendSavedAt !== bill.updatedAt) {
        setBusyMessage("Saving bill…");
        setSaveAttempt(1);
        setSaving(true);
        try {
          billToPrint = await persistBillToBackend(bill, billingContext);
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
          setPrintServerState("error");
          setPrintServerError("Could not generate bill number");
          setFallbackAction("print");
          setSaveFailureOpen(true);
          return;
        } finally {
          setSaving(false);
        }
      }

      const printUpiAmount = Math.max(0, billToPrint.payable).toFixed(2);
      const printUpiPayload = `upi://pay?pa=${upiId}&pn=Tangify&am=${printUpiAmount}&cu=INR`;
      await requestBillPrint(billToPrint, billingContext, {
        discount,
        discountLabel,
        includePaymentQr: showPaymentQr,
        upiId,
        upiPayload: printUpiPayload,
      });
      setPrintServerState("sent");
    } catch (error) {
      setPrintServerState("error");
      setPrintServerError(
        error instanceof Error
          ? error.message
          : "Could not reach Bill Printer"
      );
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      active
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const resolveBillingContext = async (): Promise<BillingContext | null> => {
    const stored =
      await localforage.getItem<BillingContext>(BILLING_CONTEXT_KEY);
    return stored ?? billingContext;
  };

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

    // Finish local close first so retries still have billing context if this fails.
    if (context.source === "orders") {
      await closeTableFromBilling(context, billSummary);
    }

    await localforage.setItem("cart", { items: [] });
    await localforage.setItem("bill", null);
    await localforage.removeItem(BILLING_CONTEXT_KEY);
    await removeBillingSession(context.sessionId);
    await notifyOrderOpsChange("billing");

    router.push("/order");
  };

  const onClickCloseTable = async () => {
    if (isBusy) {
      return;
    }
    setBusyMessage("Closing table…");
    setSaveAttempt(1);
    setProcessing(true);
    try {
      const context = await resolveBillingContext();
      if (!context) {
        alert("Billing session is missing.");
        return;
      }

      if (context.source === "freeflow") {
        setBusyMessage("Clearing bill…");
        await finalizeCloseTable(context);
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

  const handleDownloadBillImage = async () => {
    if (!billReceiptRef.current || controlsDisabled) {
      return;
    }
    setDownloadingImage(true);
    try {
      const context = await resolveBillingContext();
      if (!context) {
        alert("Billing session is missing.");
        return;
      }

      let billForImage = bill;
      if (!bill.backendBillId || bill.backendSavedAt !== bill.updatedAt) {
        setBusyMessage("Saving bill…");
        setSaveAttempt(1);
        setSaving(true);
        try {
          billForImage = await persistBillToBackend(bill, context);
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
          alert("Could not generate bill number. Please try again.");
          return;
        } finally {
          setSaving(false);
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      }

      if (!billReceiptRef.current) {
        return;
      }

      const rawDataUrl = await toPng(billReceiptRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const padding = 48;
      const paddedDataUrl = await new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.width + padding * 2;
          canvas.height = image.height + padding * 2;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not create canvas context"));
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, padding, padding);
          resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = () => reject(new Error("Could not load bill image"));
        image.src = rawDataUrl;
      });

      const safeBillNo = String(billForImage.billNumber).replace(
        /[^\w.-]+/g,
        "_"
      );
      const filename = `bill-${safeBillNo}.png`;
      const blob = await (await fetch(paddedDataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });

      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: `Bill ${billForImage.billNumber}`,
          });
          return;
        } catch (shareError) {
          if (
            shareError instanceof DOMException &&
            shareError.name === "AbortError"
          ) {
            return;
          }
          // Fall through to download if share fails for another reason.
        }
      }

      const link = document.createElement("a");
      link.download = filename;
      link.href = paddedDataUrl;
      link.click();
    } catch (error) {
      console.error("Failed to download bill image:", error);
      alert("Could not download bill image. Please try again.");
    } finally {
      setDownloadingImage(false);
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
        void resolveBillingContext().then((context) => {
          if (context) {
            return finalizeCloseTable(context);
          }
        });
      }
    }, 500);
  };

  return (
    <div className="ops-app-screen">
      {!fullSize ? (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  size: 58mm auto;
                  margin: 0;
                }
                html, body {
                  width: 58mm;
                  max-width: 58mm;
                  margin: 0;
                  padding: 0;
                }
              }
            `,
          }}
        />
      ) : null}
      <div className="sticky top-0 z-20 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-transparent pointer-events-none print:hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleBack}
            disabled={controlsDisabled}
            aria-label="Back"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ←
          </button>
          <div className="flex justify-center min-w-0 px-1">
            <div className="rounded-full bg-white border border-gray-200/80 shadow-md px-4 py-2 min-h-[44px] max-w-full flex flex-col justify-center">
              <h1 className="text-sm font-bold text-gray-900 truncate text-center">
                Bill
              </h1>
            </div>
          </div>
          <div className="min-w-[44px]" aria-hidden />
        </div>
      </div>
      <div className="bg-white border-b px-6 py-4 space-y-4 print:hidden">
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Discount (optional)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={controlsDisabled}
              className={tabClass(membership === "monthly")}
              onClick={() => handleMembershipSelect("monthly")}
            >
              Monthly (10%)
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              className={tabClass(membership === "yearly")}
              onClick={() => handleMembershipSelect("yearly")}
            >
              Yearly (20%)
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              className={tabClass(membership === "custom")}
              onClick={openCustomDiscountModal}
            >
              Custom
            </button>
          </div>
          {membership === "custom" && discount > 0 ? (
            <p className="text-xs text-red-600 mt-2">
              {bill.customDiscountUnit === "percent"
                ? `${bill.customDiscountValue}%`
                : `₹${formatCurrency(bill.customDiscountValue ?? 0)}`}
              {bill.customDiscountReason?.trim()
                ? ` · ${bill.customDiscountReason.trim()}`
                : ""}
              {` · −₹${formatCurrency(discount)}`}
            </p>
          ) : discount > 0 ? (
            <p className="text-xs text-red-600 mt-2">
              −₹{formatCurrency(discount)}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Customer phone (optional)
          </p>
          <button
            type="button"
            disabled={controlsDisabled}
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
      <div className="flex w-full justify-center px-4 print:contents print:px-0">
      <div
        ref={billReceiptRef}
        className={
          fullSize
            ? "w-full max-w-3xl px-6 py-4 text-base print:max-w-none print:px-0 bg-white"
            : "w-full text-xs bg-white"
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
        {billingContext?.kind === "table" ? (
          <div className="flex justify-between">
            <span>Table</span>
            <span>
              {billingContext.label?.trim() ||
                (billingContext.tableNumbers.length > 0
                  ? formatTableGroupLabel(billingContext.tableNumbers)
                  : "Table order")}
            </span>
          </div>
        ) : billingContext && isCounterOrderKind(billingContext.kind) ? (
          <div className="flex justify-between">
            <span>Order</span>
            <span>
              {billingContext.label?.trim() ||
                formatOrderKindLabel(billingContext.kind)}
            </span>
          </div>
        ) : null}
        {bill.customerPhone?.trim() ? (
          <div className="flex justify-between">
            <span>Phone</span>
            <span>+91 {bill.customerPhone.trim()}</span>
          </div>
        ) : null}
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
          <div className="flex justify-between text-red-600">
            <span className="pr-2">{discountLabel}</span>
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
          <span>Payable</span>
          <span>₹{formatCurrency(bill.payable)}</span>
        </div>
        <p className="text-center mt-2">Thank you. Please visit again.</p>
        <p className="text-center mt-1">UPI: {upiId}</p>
        {showPaymentQr ? (
          <div className="mt-3 flex flex-col items-center">
            <p className="text-center font-semibold">Scan & Pay (UPI)</p>
            <img
              src={upiQrUrl}
              alt={`UPI QR for ₹${upiAmount}`}
              width={fullSize ? 220 : 140}
              height={fullSize ? 220 : 140}
              className="mt-1"
              crossOrigin="anonymous"
            />
          </div>
        ) : null}
        <br />
        <br />
        <br />
      </div>
      </div>
      <div className="h-48 print:hidden" aria-hidden />
      <div className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col-reverse items-end gap-2 print:hidden">
        {billPrinterOnline ? (
          <button
            type="button"
            disabled={controlsDisabled || printServerState === "sending"}
            aria-label="Send bill to Bill Printer"
            onClick={() => void sendBillToPrintServer()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-orange-500 px-4 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 touch-manipulation disabled:opacity-60"
          >
            <FaPrint className="h-4 w-4 shrink-0" />
            {printServerState === "sending" ? "Sending…" : "Bill Printer"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label={processing ? "Closing table" : "Close table"}
          title={processing ? "Closing…" : "Close table"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void onClickCloseTable()}
        >
          <FaCheck className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label={
            showPaymentQr ? "Hide payment QR" : "Show payment QR"
          }
          title={showPaymentQr ? "Hide payment QR" : "Show payment QR"}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border shadow-lg touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            showPaymentQr
              ? "border-black bg-black text-white hover:bg-gray-800"
              : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
          }`}
          onClick={() => setShowPaymentQr((value) => !value)}
        >
          <FaQrcode className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label={fullSize ? "Receipt size (58mm)" : "Full size"}
          title={fullSize ? "Receipt size (58mm)" : "Full size"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-gray-300 bg-white text-gray-800 shadow-lg hover:bg-gray-50 touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setFullSize((value) => !value)}
        >
          {fullSize ? (
            <FaCompress className="h-4 w-4" />
          ) : (
            <FaExpand className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label={
            supportsShareImage ? "Share image" : "Download image"
          }
          title={
            downloadingImage
              ? supportsShareImage
                ? "Preparing…"
                : "Downloading…"
              : supportsShareImage
                ? "Share image"
                : "Download image"
          }
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-gray-300 bg-white text-gray-800 shadow-lg hover:bg-gray-50 touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void handleDownloadBillImage()}
        >
          {supportsShareImage ? (
            <FaShareAlt className="h-4 w-4" />
          ) : (
            <FaDownload className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label="Print"
          title="Print"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black text-white shadow-lg hover:bg-gray-800 touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void handlePrint()}
        >
          <FaPrint className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-label={saving ? "Saving" : "Save"}
          title={saving ? "Saving…" : "Save"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-gray-300 bg-white text-gray-800 shadow-lg hover:bg-gray-50 touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void handleSave()}
        >
          <FaSave className="h-4 w-4" />
        </button>
        {printServerState === "error" && printServerError ? (
          <p className="max-w-[10rem] rounded-lg bg-white/95 px-2 py-1 text-xs text-red-600 shadow-md text-right">
            {printServerError}
          </p>
        ) : null}
      </div>
      {phoneModalOpen ? (
        <CustomerPhoneModal
          value={phoneDraft}
          onChange={setPhoneDraft}
          onCancel={() => setPhoneModalOpen(false)}
          onConfirm={handleSaveCustomerPhone}
        />
      ) : null}
      {customDiscountModalOpen ? (
        <CustomDiscountModal
          amount={customAmountDraft}
          unit={customUnitDraft}
          reason={customReasonDraft}
          subtotal={bill.subtotal}
          maxPayable={
            calculateBillAmounts(bill.subtotal, "none", staffWelfare, null)
              .payable
          }
          canRemove={membership === "custom"}
          onAmountChange={setCustomAmountDraft}
          onUnitChange={setCustomUnitDraft}
          onReasonChange={setCustomReasonDraft}
          onCancel={() => setCustomDiscountModalOpen(false)}
          onConfirm={handleApplyCustomDiscount}
          onRemove={handleRemoveCustomDiscount}
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
