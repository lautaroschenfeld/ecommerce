"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Landmark,
  Lock,
  MapPin,
  Percent,
  ShieldCheck,
  Store,
  Truck,
  Upload,
} from "lucide-react";

import { useCart, type CartItem } from "@/lib/store-cart";
import {
  useCustomerSession,
} from "@/lib/customer-auth";
import { trackStoreTelemetry } from "@/lib/store-telemetry";
import { validateStoreCoupon, type ValidatedCoupon } from "@/lib/store-coupons";
import {
  ApiHttpError,
  fetchJson,
  STORE_BACKEND_URL,
} from "@/lib/store-client";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
} from "@/lib/user-facing-errors";
import {
  markStoreBackendUnavailable,
  useStoreBackendStatus,
} from "@/lib/store-backend-status";
import {
  STANDARD_SHIPPING_AMOUNT,
  useStoreShippingSettings,
} from "@/lib/store-shipping";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription as UiDialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyAmount } from "@/components/ui/money-amount";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AR_PROVINCES,
  BUY_NOW_INTENT_KEY,
  DEFAULT_DRAFT,
  STEPS,
  clampQty,
  computeShippingArs,
  digitsOnly,
  getPasswordStrengthError,
  normalizeEmailInput,
  safeReadDraft,
  safeWriteDraft,
  sanitizeIntentItems,
  validateEmail,
  type CheckoutDraft,
} from "./checkout-page.helpers";
import styles from "./checkout-page.module.css";

type CompletedCheckoutSummary = {
  shippingArs: number;
  totalArs: number;
  deliveryMethod: CheckoutDraft["deliveryMethod"];
  paymentMethod: CheckoutDraft["paymentMethod"];
};

export function CheckoutPage() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const beginCheckoutTrackedRef = useRef(false);
  const suppressEmptyCartRedirectRef = useRef(false);
  const buyNowIntent = searchParams.get("intent") === "buy-now";
  const [intentItems, setIntentItems] = useState<CartItem[] | null>(null);
  const {
    hydrated,
    items: cartItems,
    setItemQty,
    removeItem,
    clear,
  } = useCart();
  const { settings: shippingSettings } = useStoreShippingSettings();
  const {
    hydrated: customerHydrated,
    customer,
    addresses,
    isLoggedIn,
    sessionUnavailable,
    register,
    syncSession,
    setNotifications,
    updateProfile,
    addAddress,
  } = useCustomerSession();
  const { unavailable } = useStoreBackendStatus();

  const mercadoPagoReturnSummary = useMemo(() => {
    const rawStatus = (
      searchParams.get("collection_status") ||
      searchParams.get("status") ||
      searchParams.get("payment_status") ||
      ""
    )
      .trim()
      .toLowerCase();
    const rawResult = (searchParams.get("mp_result") || "").trim().toLowerCase();
    const paymentId =
      searchParams.get("payment_id") ||
      searchParams.get("collection_id") ||
      "";
    const preferenceId = searchParams.get("preference_id") || "";
    const externalReference =
      searchParams.get("external_reference") ||
      searchParams.get("order_id") ||
      "";
    const hasReturnFlag = searchParams.get("mp_return") === "1";
    const hasAnySignal = Boolean(
      hasReturnFlag || rawStatus || rawResult || paymentId || preferenceId || externalReference
    );

    if (!hasAnySignal) return null;

    const signal = rawStatus || rawResult;
    const isApproved =
      signal.includes("approve") ||
      signal.includes("paid") ||
      signal.includes("accredit");
    const isPending =
      signal.includes("pending") ||
      signal.includes("in_process") ||
      signal.includes("inprocess");

    const tone = isApproved ? "ok" : isPending ? "pending" : "failed";
    const title =
      tone === "ok"
        ? "Mercado Pago reporto el pago como aprobado"
        : tone === "pending"
          ? "Mercado Pago reporto el pago como pendiente"
          : "Mercado Pago reporto que el pago no fue aprobado";

    const message =
      tone === "ok"
        ? "Tu pedido ya quedo registrado y estamos validando la acreditacion final por webhook."
        : tone === "pending"
          ? "El pago todavia esta en proceso. En cuanto se acredite, el estado de la orden se actualizara automaticamente."
          : "No se pudo acreditar el pago. Puedes reintentar desde la finalizacion de compra.";

    return {
      tone,
      title,
      message,
      paymentId: paymentId.trim(),
      preferenceId: preferenceId.trim(),
      externalReference: externalReference.trim(),
      status: (rawStatus || rawResult).trim(),
    };
  }, [searchParams]);

  useEffect(() => {
    if (!buyNowIntent) {
      setIntentItems(null);
      return;
    }
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(BUY_NOW_INTENT_KEY);
      if (!raw) {
        setIntentItems([]);
        return;
      }
      const data: unknown = JSON.parse(raw);
      const parsed = sanitizeIntentItems(
        data && typeof data === "object" ? (data as Record<string, unknown>).items : null
      );
      setIntentItems(parsed);
    } catch {
      setIntentItems([]);
    }
  }, [buyNowIntent]);

  const usingIntent = buyNowIntent && intentItems !== null;
  const items = useMemo(
    () => (usingIntent ? intentItems ?? [] : cartItems),
    [usingIntent, intentItems, cartItems]
  );
  const itemCount = useMemo(
    () => items.reduce((acc, it) => acc + it.qty, 0),
    [items]
  );
  const subtotalArs = useMemo(
    () => items.reduce((acc, it) => acc + it.qty * it.priceArs, 0),
    [items]
  );
  const persistIntentItems = (list: CartItem[]) => {
    if (!usingIntent || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        BUY_NOW_INTENT_KEY,
        JSON.stringify({ items: list, updatedAt: Date.now() })
      );
    } catch {
      // ignore persistence errors
    }
  };

  const changeQty = (productId: string, qty: number) => {
    if (usingIntent) {
      setIntentItems((prev) => {
        if (!prev) return prev;
        const next = prev
          .map((it) =>
            it.id === productId ? { ...it, qty: clampQty(qty, 0, 99) } : it
          )
          .filter((it) => it.qty > 0);
        persistIntentItems(next);
        return next;
      });
      return;
    }
    setItemQty(productId, qty);
  };

  const removeLine = (productId: string) => {
    if (usingIntent) {
      setIntentItems((prev) => {
        const next = prev?.filter((it) => it.id !== productId) ?? [];
        persistIntentItems(next);
        return next;
      });
      return;
    }
    removeItem(productId);
  };

  const [step, setStep] = useState(0);
  const [paymentStage, setPaymentStage] = useState<"method" | "details">("method");
  const [draft, setDraft] = useState<CheckoutDraft>(DEFAULT_DRAFT);
  const [draftRestored, setDraftRestored] = useState(false);
  const [restoredDraftOwnerKey, setRestoredDraftOwnerKey] = useState<string | null>(
    null
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [promoInput, setPromoInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<ValidatedCoupon | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const couponDiscountArs = useMemo(() => {
    if (!appliedCoupon) return 0;
    return Math.max(0, Math.trunc((subtotalArs * appliedCoupon.percentageTenths) / 1000));
  }, [appliedCoupon, subtotalArs]);

  const shippingArs = useMemo(() => {
    return computeShippingArs(
      subtotalArs,
      draft.deliveryMethod,
      shippingSettings.freeShippingThresholdArs
    );
  }, [subtotalArs, draft.deliveryMethod, shippingSettings.freeShippingThresholdArs]);

  const totalArs = useMemo(() => {
    return Math.max(0, subtotalArs + shippingArs - couponDiscountArs);
  }, [subtotalArs, shippingArs, couponDiscountArs]);

  const [summaryOpen, setSummaryOpen] = useState(false);

  const [placeOrderOpen, setPlaceOrderOpen] = useState(false);
  const [createAccountAfterBuy, setCreateAccountAfterBuy] = useState(true);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyByWhatsapp, setNotifyByWhatsapp] = useState(false);
  const [postCheckoutMessage, setPostCheckoutMessage] = useState<string | null>(
    null
  );
  const [postCheckoutBusy, setPostCheckoutBusy] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{
    id: string;
    orderNumber: string;
    trackingCode: string | null;
    totalArs: number;
    transferProofToken?: string | null;
    transferProofExpiresAt?: string | null;
  } | null>(null);
  const [completedCheckout, setCompletedCheckout] = useState<CompletedCheckoutSummary | null>(
    null
  );
  const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
  const [transferProofBusy, setTransferProofBusy] = useState(false);
  const [transferProofMessage, setTransferProofMessage] = useState<string | null>(null);
  const currentDraftOwnerKey =
    customerHydrated && !sessionUnavailable && isLoggedIn && customer?.id
      ? `account:${customer.id}`
      : customerHydrated && !sessionUnavailable
        ? "guest"
        : null;

  useEffect(() => {
    if (beginCheckoutTrackedRef.current) return;
    if (usingIntent) {
      if (intentItems === null) return;
    } else if (!hydrated) {
      return;
    }
    if (items.length === 0) return;

    beginCheckoutTrackedRef.current = true;
    void trackStoreTelemetry("begin_checkout", {
      intent: usingIntent ? "buy_now" : "cart",
      item_count: itemCount,
      subtotal_ars: subtotalArs,
      total_ars: totalArs,
      coupon_code: appliedCoupon?.code || null,
      item_ids: items.slice(0, 10).map((item) => item.id),
    });
  }, [
    appliedCoupon?.code,
    hydrated,
    intentItems,
    itemCount,
    items,
    subtotalArs,
    totalArs,
    usingIntent,
  ]);

  useEffect(() => {
    setTransferProofFile(null);
    setTransferProofBusy(false);
    setTransferProofMessage(null);
  }, [placedOrder?.id]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const loaded = safeReadDraft();
      setRestoredDraftOwnerKey(loaded.ownerKey);
      setDraft((prev) => ({ ...prev, ...loaded.draft }));
      setDraftRestored(true);
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!draftRestored || !currentDraftOwnerKey) return;

    const id = window.setTimeout(
      () => safeWriteDraft(draft, currentDraftOwnerKey),
      120
    );
    return () => window.clearTimeout(id);
  }, [currentDraftOwnerKey, draft, draftRestored]);

  useEffect(() => {
    if (items.length > 0) return;
    setAppliedCoupon(null);
    setPromoError(null);
  }, [items.length]);

  useEffect(() => {
    if (!hydrated) return;
    if (buyNowIntent && intentItems === null) return;
    if (items.length > 0) return;
    if (suppressEmptyCartRedirectRef.current) return;
    if (placeOrderOpen || mercadoPagoReturnSummary) return;
    router.replace("/productos");
  }, [
    buyNowIntent,
    hydrated,
    intentItems,
    items.length,
    mercadoPagoReturnSummary,
    placeOrderOpen,
    router,
  ]);

  useEffect(() => {
    if (!draftRestored || !customerHydrated || !isLoggedIn || !customer) return;

    const defaultAddress = addresses.find((entry) => entry.isDefault) ?? addresses[0];
    const accountOwnerKey = `account:${customer.id}`;
    const keepExistingAddressDraft = restoredDraftOwnerKey === accountOwnerKey;

    setDraft((prev) => {
      const next: CheckoutDraft = {
        ...prev,
        firstName: customer.firstName || "",
        lastName: customer.lastName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        dni: customer.documentNumber || "",
        address1: keepExistingAddressDraft
          ? prev.address1 || defaultAddress?.line1 || ""
          : defaultAddress?.line1 || "",
        addressNumber: keepExistingAddressDraft
          ? prev.addressNumber || defaultAddress?.streetNumber || ""
          : defaultAddress?.streetNumber || "",
        address2: keepExistingAddressDraft
          ? prev.address2 || defaultAddress?.line2 || ""
          : defaultAddress?.line2 || "",
        city: keepExistingAddressDraft
          ? prev.city || defaultAddress?.city || ""
          : defaultAddress?.city || "",
        province: keepExistingAddressDraft
          ? prev.province || defaultAddress?.province || prev.province
          : defaultAddress?.province || DEFAULT_DRAFT.province,
        postalCode: keepExistingAddressDraft
          ? prev.postalCode || defaultAddress?.postalCode || ""
          : defaultAddress?.postalCode || "",
      };

      if (!keepExistingAddressDraft) {
        next.notes = DEFAULT_DRAFT.notes;
        next.billingSameAsShipping = DEFAULT_DRAFT.billingSameAsShipping;
        next.billingAddress1 = DEFAULT_DRAFT.billingAddress1;
        next.billingCity = DEFAULT_DRAFT.billingCity;
        next.billingProvince = DEFAULT_DRAFT.billingProvince;
        next.billingPostalCode = DEFAULT_DRAFT.billingPostalCode;
        next.invoiceType = DEFAULT_DRAFT.invoiceType;
        next.cuit = DEFAULT_DRAFT.cuit;
        next.razonSocial = DEFAULT_DRAFT.razonSocial;
        next.acceptTerms = DEFAULT_DRAFT.acceptTerms;
      }

      const changed = (Object.keys(DEFAULT_DRAFT) as Array<keyof CheckoutDraft>).some(
        (key) => prev[key] !== next[key]
      );
      return changed ? next : prev;
    });

    if (restoredDraftOwnerKey !== accountOwnerKey) {
      setRestoredDraftOwnerKey(accountOwnerKey);
    }
  }, [
    addresses,
    customer,
    customerHydrated,
    draftRestored,
    isLoggedIn,
    restoredDraftOwnerKey,
  ]);

  useEffect(() => {
    if (!draftRestored || !customerHydrated || isLoggedIn || sessionUnavailable) return;
    if (!restoredDraftOwnerKey || restoredDraftOwnerKey === "guest") return;

    setDraft((prev) => {
      const next: CheckoutDraft = {
        ...prev,
        firstName: DEFAULT_DRAFT.firstName,
        lastName: DEFAULT_DRAFT.lastName,
        email: DEFAULT_DRAFT.email,
        phone: DEFAULT_DRAFT.phone,
        dni: DEFAULT_DRAFT.dni,
        address1: DEFAULT_DRAFT.address1,
        addressNumber: DEFAULT_DRAFT.addressNumber,
        address2: DEFAULT_DRAFT.address2,
        city: DEFAULT_DRAFT.city,
        province: DEFAULT_DRAFT.province,
        postalCode: DEFAULT_DRAFT.postalCode,
        notes: DEFAULT_DRAFT.notes,
        billingSameAsShipping: DEFAULT_DRAFT.billingSameAsShipping,
        billingAddress1: DEFAULT_DRAFT.billingAddress1,
        billingCity: DEFAULT_DRAFT.billingCity,
        billingProvince: DEFAULT_DRAFT.billingProvince,
        billingPostalCode: DEFAULT_DRAFT.billingPostalCode,
        invoiceType: DEFAULT_DRAFT.invoiceType,
        cuit: DEFAULT_DRAFT.cuit,
        razonSocial: DEFAULT_DRAFT.razonSocial,
        acceptTerms: DEFAULT_DRAFT.acceptTerms,
      };

      const changed = (Object.keys(DEFAULT_DRAFT) as Array<keyof CheckoutDraft>).some(
        (key) => prev[key] !== next[key]
      );
      return changed ? next : prev;
    });
    setRestoredDraftOwnerKey("guest");
  }, [
    customerHydrated,
    draftRestored,
    isLoggedIn,
    restoredDraftOwnerKey,
    sessionUnavailable,
  ]);

  useEffect(() => {
    if (step === STEPS.length - 1) return;
    if (paymentStage === "method") return;
    setPaymentStage("method");
  }, [step, paymentStage]);

  const touch = (key: string) =>
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

  const isTouched = (key: string) => Boolean(touched[key]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};

    if (!draft.firstName.trim()) out.firstName = "Ingresá tu nombre.";
    if (!draft.lastName.trim()) out.lastName = "Ingresá tu apellido.";
    if (!validateEmail(draft.email)) out.email = "Ingresá un correo electrónico válido.";

    const phoneDigits = digitsOnly(draft.phone);
    if (phoneDigits.length < 8) out.phone = "Ingresá un teléfono válido.";

    const dniDigits = digitsOnly(draft.dni);
    if (!dniDigits) {
      out.dni = "Ingresá DNI o CUIT.";
    } else {
      const validDni = dniDigits.length === 7 || dniDigits.length === 8;
      const validCuit = dniDigits.length === 11;
      if (!validDni && !validCuit) {
        out.dni = "Ingresá un DNI o CUIT válido.";
      }
    }

    if (!draft.address1.trim()) out.address1 = "Ingresá la calle.";
    if (!draft.addressNumber.trim()) out.addressNumber = "Ingresá el número.";
    if (!draft.city.trim()) out.city = "Ingresá la localidad.";
    if (!draft.province.trim()) out.province = "Elegí la provincia.";
    if (!draft.postalCode.trim()) out.postalCode = "Ingresá el código postal.";

    if (!draft.billingSameAsShipping) {
      if (!draft.billingAddress1.trim())
        out.billingAddress1 = "Ingresá la dirección de facturación.";
      if (!draft.billingCity.trim())
        out.billingCity = "Ingresá la localidad de facturación.";
      if (!draft.billingProvince.trim())
        out.billingProvince = "Elegí la provincia de facturación.";
      if (!draft.billingPostalCode.trim())
        out.billingPostalCode = "Ingresá el CP de facturación.";
    }

    if (draft.invoiceType === "factura_a") {
      const cuitDigits = digitsOnly(draft.cuit);
      if (cuitDigits.length < 11)
        out.cuit = "Ingresá un CUIT válido (11 dígitos).";
      if (!draft.razonSocial.trim()) out.razonSocial = "Ingresá la razón social.";
    }

    if (!draft.acceptTerms) out.acceptTerms = "Tenés que aceptar los términos.";

    return out;
  }, [draft]);

  const stepValid = useMemo(() => {
    const datosOk =
      !errors.firstName && !errors.lastName && !errors.email && !errors.phone;

    const entregaOk =
      !errors.address1 &&
      !errors.addressNumber &&
      !errors.city &&
      !errors.province &&
      !errors.postalCode &&
      !errors.dni;

    const envioOk = Boolean(draft.deliveryMethod);

    const pagoOk =
      !errors.billingAddress1 &&
      !errors.billingCity &&
      !errors.billingProvince &&
      !errors.billingPostalCode &&
      !errors.cuit &&
      !errors.razonSocial &&
      !errors.acceptTerms;

    return [datosOk, entregaOk, envioOk, pagoOk];
  }, [errors, draft.deliveryMethod]);

  const canGoToStep = (idx: number) => {
    if (idx <= step) return true;
    for (let i = 0; i < idx; i++) {
      if (!stepValid[i]) return false;
    }
    return true;
  };

  const markStepTouched = (idx: number) => {
    const keysByStep: Record<number, string[]> = {
      0: ["firstName", "lastName", "email", "phone"],
      1: ["dni", "address1", "addressNumber", "city", "province", "postalCode"],
      2: [],
      3: [
        "billingAddress1",
        "billingCity",
        "billingProvince",
        "billingPostalCode",
        "cuit",
        "razonSocial",
        "acceptTerms",
      ],
    };

    setTouched((prev) => {
      const next = { ...prev };
      for (const k of keysByStep[idx] ?? []) next[k] = true;
      return next;
    });
  };

  const goNext = () => {
    if (step === STEPS.length - 1 && paymentStage === "method") {
      setPaymentStage("details");
      return;
    }

    if (stepValid[step]) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      return;
    }

    markStepTouched(step);
  };

  const goPrev = () => {
    if (step === STEPS.length - 1 && paymentStage === "details") {
      setPaymentStage("method");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const stepTitle =
    step === STEPS.length - 1 && paymentStage === "method"
      ? "Metodo de pago"
      : STEPS[step]?.label ?? "Finalizar compra";

  const loginHref = "/ingresar?redirect=%2Fcheckout";
  const publishableKey = process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";

  const applyCoupon = async () => {
    const code = promoInput.trim();
    if (!code) return;

    setPromoError(null);
    try {
      setPromoLoading(true);
      const result = await validateStoreCoupon({
        code,
        subtotalArs,
        items,
      });
      setAppliedCoupon(result);
      setPromoInput(result.code);
    } catch (error) {
      setAppliedCoupon(null);
      if (error instanceof ApiHttpError && error.status === 404) {
        setPromoError("Cupón inválido o inactivo.");
      } else {
        setPromoError(
          mapFriendlyError(error, "No pudimos validar el cupon. Intenta nuevamente.")
        );
      }
    } finally {
      setPromoLoading(false);
    }
  };

  const saveGuestPostPurchasePreferences = async () => {
    setPostCheckoutMessage(null);

    if (createAccountAfterBuy) {
      const passwordError = getPasswordStrengthError(accountPassword);
      if (passwordError) {
        setPostCheckoutMessage(passwordError);
        return;
      }

      if (accountPassword !== accountPasswordConfirm) {
        setPostCheckoutMessage("Las contraseñas no coinciden.");
        return;
      }
    } else {
      setPostCheckoutMessage(
        "Pedido listo como invitado. Si luego creás cuenta, podrás activar avisos."
      );
      return;
    }

    try {
      setPostCheckoutBusy(true);

      const result = await register({
        email: draft.email,
        password: accountPassword,
        firstName: draft.firstName,
        lastName: draft.lastName,
        documentNumber: draft.dni,
        phone: draft.phone,
        whatsapp: notifyByWhatsapp ? draft.phone : "",
      });

      if (!result.ok) {
        setPostCheckoutMessage(result.error ?? "No se pudo crear la cuenta.");
        return;
      }

      await setNotifications({
        email: notifyByEmail,
        whatsapp: notifyByWhatsapp,
      });

      const bestWhatsapp = notifyByWhatsapp
        ? draft.phone.trim() || customer?.phone || ""
        : "";
      await updateProfile({
        firstName: draft.firstName,
        lastName: draft.lastName,
        documentNumber: draft.dni,
        phone: draft.phone,
        whatsapp: bestWhatsapp,
      });

      await addAddress({
        label: "Principal",
        recipient: `${draft.firstName} ${draft.lastName}`.trim(),
        phone: draft.phone,
        line1: draft.address1,
        streetNumber: draft.addressNumber,
        line2: draft.address2,
        city: draft.city,
        province: draft.province,
        postalCode: draft.postalCode,
        isDefault: true,
      });

      await syncSession();
      await trackStoreTelemetry("guest_conversion", {
        checkout: true,
        order_id: placedOrder?.id || null,
      });

      setPostCheckoutMessage("Cuenta creada y notificaciones activadas.");
    } catch (err) {
      setPostCheckoutMessage(mapFriendlyError(err));
    } finally {
      setPostCheckoutBusy(false);
    }
  };

  const saveLoggedPostPurchasePreferences = async () => {
    try {
      setPostCheckoutBusy(true);

      await setNotifications({
        email: notifyByEmail,
        whatsapp: notifyByWhatsapp,
      });

      if (notifyByWhatsapp) {
        const bestWhatsapp = draft.phone.trim() || customer?.phone || "";
        await updateProfile({
          phone: draft.phone,
          whatsapp: bestWhatsapp,
        });
      }

      await trackStoreTelemetry("checkout_notifications_updated", {
        order_id: placedOrder?.id || null,
        email: notifyByEmail,
        whatsapp: notifyByWhatsapp,
      });

      setPostCheckoutMessage("Preferencias actualizadas.");
    } catch (err) {
      setPostCheckoutMessage(mapFriendlyError(err));
    } finally {
      setPostCheckoutBusy(false);
    }
  };

  const createOrder = async () => {
    if (!publishableKey) {
      throw new Error(FRIENDLY_ERROR_MESSAGES.serviceUnavailable);
    }

    let reservationId = "";
    try {
      const reservationData = await fetchJson<{
        reservation?: { id?: string };
      }>("/store/catalog/checkout/reservations", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-publishable-api-key": publishableKey,
        },
        body: JSON.stringify({
          email: draft.email,
          items,
          hold_minutes: 15,
        }),
      });
      reservationId =
        reservationData.reservation &&
        typeof reservationData.reservation.id === "string"
          ? reservationData.reservation.id
          : "";

      if (!reservationId) {
        throw new Error("No se pudo reservar stock para el pedido.");
      }

      const data = await fetchJson<{
        order?: Record<string, unknown>;
        transfer_proof_upload?: { token?: string; expires_at?: string };
        checkout_pro?: {
          provider?: string;
          preference_id?: string;
          init_point?: string;
          sandbox_init_point?: string;
          redirect_url?: string;
          external_reference?: string;
        };
      }>(
        "/store/catalog/checkout/orders",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "x-publishable-api-key": publishableKey,
          },
          body: JSON.stringify({
            reservation_id: reservationId,
            email: draft.email,
            first_name: draft.firstName,
            last_name: draft.lastName,
            document_number: draft.dni,
            dni: draft.dni,
            cuit: draft.cuit,
            phone: draft.phone,
            address1: draft.address1,
            address_number: draft.addressNumber,
            address2: draft.address2,
            city: draft.city,
            province: draft.province,
            postal_code: draft.postalCode,
            items,
            delivery_method: draft.deliveryMethod,
            payment_method: draft.paymentMethod,
            shipping_ars: shippingArs,
            coupon_code: appliedCoupon?.code || undefined,
            discount_ars: couponDiscountArs,
            total_ars: totalArs,
          }),
        }
      );

      const order = data.order && typeof data.order === "object"
        ? (data.order as Record<string, unknown>)
        : null;
      if (!order) {
        throw new Error("Respuesta inválida al crear el pedido.");
      }

      const transferProofUpload =
        data.transfer_proof_upload && typeof data.transfer_proof_upload === "object"
          ? data.transfer_proof_upload
          : null;
      const checkoutPro =
        data.checkout_pro && typeof data.checkout_pro === "object"
          ? data.checkout_pro
          : null;
      const checkoutRedirectUrl =
        typeof checkoutPro?.redirect_url === "string"
          ? checkoutPro.redirect_url.trim()
          : "";

      if (draft.paymentMethod === "mercadopago" && !checkoutRedirectUrl) {
        throw new Error("No se pudo iniciar el proceso de pago de Mercado Pago.");
      }

      setPlacedOrder({
        id: String(order.id || ""),
        orderNumber: String(order.order_number || order.id || ""),
        trackingCode:
          typeof order.tracking_code === "string" ? order.tracking_code : null,
        totalArs:
          typeof order.total_ars === "number"
            ? order.total_ars
            : Number(order.total_ars) || totalArs,
        transferProofToken:
          typeof transferProofUpload?.token === "string"
            ? transferProofUpload.token
            : null,
        transferProofExpiresAt:
          typeof transferProofUpload?.expires_at === "string"
            ? transferProofUpload.expires_at
            : null,
      });

      await trackStoreTelemetry("checkout_finalized", {
        order_id: String(order.id || ""),
        order_number: String(order.order_number || ""),
        total_ars:
          typeof order.total_ars === "number"
            ? order.total_ars
            : Number(order.total_ars) || totalArs,
        guest: !isLoggedIn,
      });

      await trackStoreTelemetry("purchase", {
        order_id: String(order.id || ""),
        order_number: String(order.order_number || ""),
        total_ars:
          typeof order.total_ars === "number"
            ? order.total_ars
            : Number(order.total_ars) || totalArs,
        currency: "ARS",
        item_count: items.reduce((sum, item) => sum + item.qty, 0),
        item_ids: items.slice(0, 10).map((item) => item.id),
        payment_method: draft.paymentMethod,
        delivery_method: draft.deliveryMethod,
      });

      return {
        redirectUrl: checkoutRedirectUrl || null,
      };
    } catch (error) {
      if (reservationId) {
        try {
          await fetchJson(
            `/store/catalog/checkout/reservations/${encodeURIComponent(
              reservationId
            )}`,
            {
              method: "DELETE",
              credentials: "include",
              headers: {
                "x-publishable-api-key": publishableKey,
                ...(draft.email.trim()
                  ? { "x-reservation-email": draft.email.trim().toLowerCase() }
                  : {}),
              },
            }
          );
        } catch {
          // best-effort release
        }
      }
      throw error;
    }
  };

  const buildTransferProofLink = () => {
    if (!placedOrder?.id || !placedOrder.transferProofToken) return "";
    return `${window.location.origin}/comprobante?order=${encodeURIComponent(
      placedOrder.id
    )}&token=${encodeURIComponent(placedOrder.transferProofToken)}`;
  };

  const copyTransferProofLink = async () => {
    const link = buildTransferProofLink();
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setTransferProofMessage("Link copiado.");
    } catch {
      setTransferProofMessage("No se pudo copiar el link.");
    }
  };

  const uploadTransferProof = async () => {
    setTransferProofMessage(null);

    if (!placedOrder?.id || !placedOrder.transferProofToken) {
      setTransferProofMessage("No se encontro el link para subir el comprobante.");
      return;
    }

    if (!transferProofFile) {
      setTransferProofMessage("Selecciona un archivo primero.");
      return;
    }

    if (!publishableKey) {
      setTransferProofMessage(FRIENDLY_ERROR_MESSAGES.serviceUnavailable);
      return;
    }

    try {
      setTransferProofBusy(true);

      const form = new FormData();
      form.append("token", placedOrder.transferProofToken);
      form.append("files", transferProofFile);

      const res = await fetch(
        `${STORE_BACKEND_URL}/store/catalog/checkout/orders/${encodeURIComponent(
          placedOrder.id
        )}/transfer-proof`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "x-publishable-api-key": publishableKey,
          },
          body: form,
        }
      );

      if (!res.ok) {
        let message = "";
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const data: unknown = await res.json().catch(() => null);
          const rec =
            data && typeof data === "object"
              ? (data as Record<string, unknown>)
              : null;
          if (rec && typeof rec.message === "string" && rec.message.trim()) {
            message = rec.message.trim();
          }
        } else {
          const text = await res.text().catch(() => "");
          if (text.trim()) message = text.trim();
        }

        throw new Error(message || FRIENDLY_ERROR_MESSAGES.actionFailed);
      }

      setTransferProofFile(null);
      setTransferProofMessage("Comprobante recibido. Queda pendiente de aprobacion.");
    } catch (err) {
      setTransferProofMessage(
        mapFriendlyError(err, "No pudimos subir el comprobante. Intenta nuevamente.")
      );
    } finally {
      setTransferProofBusy(false);
    }
  };

  const clearSuccessfulCheckoutItems = () => {
    beginCheckoutTrackedRef.current = false;

    if (usingIntent) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(BUY_NOW_INTENT_KEY);
      }
      setIntentItems([]);
      return;
    }

    clear();
  };

  const openPlaceOrderDialog = async () => {
    if (unavailable) {
      markStoreBackendUnavailable("checkout_temporarily_unavailable");
      return;
    }
    if (!stepValid[step]) {
      markStepTouched(step);
      return;
    }

    setPlacingOrder(true);
    setPlaceOrderError(null);
    setPostCheckoutMessage(null);
    setPlacedOrder(null);

    try {
      const created = await createOrder();
      setCompletedCheckout({
        shippingArs,
        totalArs,
        deliveryMethod: draft.deliveryMethod,
        paymentMethod: draft.paymentMethod,
      });
      if (created.redirectUrl) {
        suppressEmptyCartRedirectRef.current = true;
      }
      clearSuccessfulCheckoutItems();
      if (created.redirectUrl) {
        window.location.assign(created.redirectUrl);
        return;
      }
      setPlaceOrderOpen(true);
    } catch (error) {
      suppressEmptyCartRedirectRef.current = false;
      let message = "No pudimos completar la acción. Intenta nuevamente.";
      let shouldMarkUnavailable = true;
      if (error instanceof ApiHttpError) {
        if (error.status === 429) {
          message =
            "Hay muchas solicitudes ahora mismo. Espera unos segundos y reintenta.";
        } else if (error.status === 401) {
          message = FRIENDLY_ERROR_MESSAGES.sessionExpired;
        } else if (
          error.code === "STOCK_OUT_OF_STOCK" ||
          error.code === "STOCK_RESERVATION_EXPIRED" ||
          error.code === "STOCK_RESERVATION_NOT_ACTIVE"
        ) {
          shouldMarkUnavailable = false;
          const payload =
            error.payload && typeof error.payload === "object"
              ? (error.payload as Record<string, unknown>)
              : null;
          const items = Array.isArray(payload?.items)
            ? (payload?.items as Array<Record<string, unknown>>)
            : [];
          if (items.length) {
            const summary = items
              .slice(0, 3)
              .map((item) => {
                const name =
                  typeof item.name === "string" ? item.name : "Producto";
                const available =
                  typeof item.available_qty === "number"
                    ? item.available_qty
                    : Number(item.available_qty || 0);
                return `${name} (disp: ${Math.max(0, Math.trunc(available))})`;
              })
              .join(", ");
            message = `Sin stock suficiente: ${summary}.`;
          } else {
            message =
              error.code === "STOCK_RESERVATION_EXPIRED"
                ? "Se venció la reserva de stock. Reintenta la finalizacion de compra."
                : "Algunos productos ya no tienen stock suficiente.";
          }
        } else {
          message = mapFriendlyError(error, message);
        }
      } else {
        message = mapFriendlyError(error, message);
      }

      setPlaceOrderError(message);
      setPlaceOrderOpen(true);
      if (shouldMarkUnavailable) {
        markStoreBackendUnavailable("checkout_order_create_failed");
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const onPlaceOrderDialogChange = (open: boolean) => {
    setPlaceOrderOpen(open);
    if (!open) {
      setCompletedCheckout(null);
      return;
    }

    setPlaceOrderError(null);
    setPostCheckoutMessage(null);
    setAccountPassword("");
    setAccountPasswordConfirm("");

    if (isLoggedIn && customer) {
      setCreateAccountAfterBuy(false);
      setNotifyByEmail(customer.notifications.email);
      setNotifyByWhatsapp(customer.notifications.whatsapp);
      return;
    }

    setCreateAccountAfterBuy(true);
    setNotifyByEmail(true);
    setNotifyByWhatsapp(false);
  };

  const placeOrderSummary = completedCheckout ?? {
    shippingArs,
    totalArs,
    deliveryMethod: draft.deliveryMethod,
    paymentMethod: draft.paymentMethod,
  };

  const placeOrderDialog = (
    <Dialog open={placeOrderOpen} onOpenChange={onPlaceOrderDialogChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {placedOrder ? "Pedido creado" : "No se pudo crear el pedido"}
          </DialogTitle>
          <UiDialogDescription>
            {placedOrder
              ? "Pedido registrado satisfactoriamente. Ya queda visible en Mi cuenta > Pedidos."
              : "No pudimos confirmar el pedido en este momento."}
          </UiDialogDescription>
        </DialogHeader>

      {placeOrderError ? (
        <div className={styles.placeOrderError}>
          {placeOrderError}
        </div>
      ) : null}

      <div className={styles.promoBox}>
        <p className={styles.promoHint}>
          <strong>Total:</strong> <MoneyAmount value={placeOrderSummary.totalArs} />{" / "}<strong>Envio:</strong>{" "}
          {placeOrderSummary.deliveryMethod === "pickup"
            ? "Retiro"
            : placeOrderSummary.shippingArs === 0
              ? "Gratis"
              : <MoneyAmount value={placeOrderSummary.shippingArs} />}{" "}
          {" / "}<strong>Pago:</strong>{" "}
          {placeOrderSummary.paymentMethod === "mercadopago"
            ? "Mercado Pago"
            : "Transferencia"}
        </p>

        {placedOrder ? (
          <p className={styles.promoHint}>
            <strong>Orden:</strong> {placedOrder.orderNumber}
            {placedOrder.trackingCode
              ? ` / Tracking: ${placedOrder.trackingCode}`
              : ""}
          </p>
        ) : null}
      </div>

      {placedOrder?.transferProofToken ? (
        <div className={styles.postPurchaseBox}>
          <div className={styles.postPurchaseHead}>
            <h3>Comprobante de transferencia</h3>
            <p>
              Subilo ahora o guardá el link seguro para subirlo más
              tarde.
            </p>
          </div>

          <div className={styles.field}>
            <Label htmlFor="transfer_proof_file">
              Archivo (foto o PDF)
            </Label>
            <FilePicker
              id="transfer_proof_file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={transferProofBusy}
              value={transferProofFile ? [transferProofFile] : []}
              onFiles={(files) => setTransferProofFile(files[0] ?? null)}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void uploadTransferProof()}
            disabled={transferProofBusy || !transferProofFile}
          >
            {transferProofBusy ? "Subiendo..." : "Subir comprobante"}
            <Upload size={16} />
          </Button>

          <div className={styles.field}>
            <Label htmlFor="transfer_proof_link">
              Link seguro para subir más tarde
            </Label>
            <div className={styles.transferLinkRow}>
              <div className={styles.transferLinkField}>
                <Input
                  id="transfer_proof_link"
                  readOnly
                  value={buildTransferProofLink()}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void copyTransferProofLink()}
                title="Copiar link"
                aria-label="Copiar link"
              >
                <Copy size={16} />
              </Button>
            </div>
          </div>

          {transferProofMessage ? (
            <p className={styles.postPurchaseMessage}>
              {transferProofMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {!isLoggedIn && placedOrder ? (
        <div className={styles.postPurchaseBox}>
          <div className={styles.postPurchaseHead}>
            <h3>Despues de comprar</h3>
            <p>
              Compra invitada habilitada. Si queres, crea tu cuenta ahora
              y guarda tus notificaciones.
            </p>
          </div>

          <label className={styles.postPurchaseCheck}>
            <Checkbox
              checked={createAccountAfterBuy}
              onCheckedChange={(checked) =>
                setCreateAccountAfterBuy(checked)
              }
            />
            <span>Crear cuenta con este correo electrónico al finalizar</span>
          </label>

          {createAccountAfterBuy ? (
            <div className={styles.grid2}>
              <div className={styles.field}>
                <Label htmlFor="post_password">Contraseña</Label>
                <PasswordInput
                  id="post_password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  placeholder="Mínimo 8, mayúscula, minúscula y número"
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="post_password_confirm">
                  Repetir contraseña
                </Label>
                <PasswordInput
                  id="post_password_confirm"
                  value={accountPasswordConfirm}
                  onChange={(e) =>
                    setAccountPasswordConfirm(e.target.value)
                  }
                />
              </div>
            </div>
          ) : null}

          <div className={styles.postPurchaseChecks}>
            <label className={styles.postPurchaseCheck}>
              <Checkbox
                checked={notifyByEmail}
                onCheckedChange={(checked) =>
                  setNotifyByEmail(checked)
                }
              />
              <span>Recibir estado del pedido por correo electrónico</span>
            </label>

            <label className={styles.postPurchaseCheck}>
              <Checkbox
                checked={notifyByWhatsapp}
                onCheckedChange={(checked) =>
                  setNotifyByWhatsapp(checked)
                }
              />
              <span>Recibir estado del pedido por WhatsApp</span>
            </label>
          </div>

          {postCheckoutMessage ? (
            <p className={styles.postPurchaseMessage}>
              {postCheckoutMessage}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={() => void saveGuestPostPurchasePreferences()}
            disabled={postCheckoutBusy}
          >
            {postCheckoutBusy
              ? "Guardando..."
              : createAccountAfterBuy
                ? "Crear cuenta y guardar preferencias"
                : "Guardar preferencias"}
          </Button>
        </div>
      ) : isLoggedIn && placedOrder ? (
        <div className={styles.postPurchaseBox}>
          <div className={styles.postPurchaseHead}>
            <h3>Notificaciones</h3>
            <p>
              Activa avisos de estado por correo electrónico o WhatsApp para este pedido.
            </p>
          </div>

          <div className={styles.postPurchaseChecks}>
            <label className={styles.postPurchaseCheck}>
              <Checkbox
                checked={notifyByEmail}
                onCheckedChange={(checked) =>
                  setNotifyByEmail(checked)
                }
              />
              <span>Recibir estado del pedido por correo electrónico</span>
            </label>
            <label className={styles.postPurchaseCheck}>
              <Checkbox
                checked={notifyByWhatsapp}
                onCheckedChange={(checked) =>
                  setNotifyByWhatsapp(checked)
                }
              />
              <span>Recibir estado del pedido por WhatsApp</span>
            </label>
          </div>

          {postCheckoutMessage ? (
            <p className={styles.postPurchaseMessage}>
              {postCheckoutMessage}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={() => void saveLoggedPostPurchasePreferences()}
            disabled={postCheckoutBusy}
          >
            {postCheckoutBusy
              ? "Guardando..."
              : "Guardar notificaciones"}
          </Button>
        </div>
      ) : null}

      <DialogFooter>
        <Button asChild variant="outline">
          <Link href="/productos">Volver al catálogo</Link>
        </Button>
        <Button type="button" onClick={() => setPlaceOrderOpen(false)}>
          Cerrar
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!hydrated) {
    return (
      <div className={styles.page}>
        <div className={styles.topRow}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Finalizar compra</h1>
          </div>
        </div>

        <Card>
          <CardContent className={styles.cardPad}>
            <div className={styles.grid2}>
              <Skeleton className={styles.skeletonField} />
              <Skeleton className={styles.skeletonField} />
              <Skeleton className={styles.skeletonField} />
              <Skeleton className={styles.skeletonField} />
            </div>
            <div className={styles.skeletonSpacer} />
            <Skeleton className={styles.skeletonPanel} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (items.length === 0 && !mercadoPagoReturnSummary) {
    return <>{placeOrderDialog}</>;
  }

  const Summary = (
    <Card>
      <CardHeader>
        <div className={styles.sectionTitleRow}>
          <CardTitle>Resumen</CardTitle>
          <Badge variant="secondary">
            {itemCount} ítem{itemCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={styles.cardPad}>
        <div className={styles.summaryList}>
          <div className={styles.summaryList}>
            <AnimatePresence mode="popLayout">
              {items.map((it, idx) => (
                <CartLineItem
                  key={it.id}
                  item={it}
                  index={idx}
                  variant="compact"
                  onChangeQty={(qty) => changeQty(it.id, qty)}
                  onRemove={() => removeLine(it.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className={styles.promoBox}>
            <div className={styles.promoTitle}>
              <Percent size={16} /> Cupón
            </div>
            <div className={styles.promoRow}>
              <Input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Código de cupón"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void applyCoupon()}
                disabled={!promoInput.trim() || promoLoading}
              >
                {promoLoading ? "Validando..." : "Aplicar"}
              </Button>
            </div>

            {appliedCoupon ? (
              <>
                <p className={styles.promoMsgOk}>
                  Cupón aplicado · {appliedCoupon.percentage}% OFF
                </p>
                <div className={styles.promoActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPromoInput("");
                      setAppliedCoupon(null);
                      setPromoError(null);
                    }}
                  >
                    Quitar
                  </Button>
                </div>
              </>
            ) : promoError ? (
              <p className={styles.promoMsgBad}>{promoError}</p>
            ) : (
              <p className={styles.promoHint}>
                Ingresá un cupón válido para aplicar descuento.
              </p>
            )}
          </div>

          <div className={styles.summaryRows}>
            <div className={styles.sumRow}>
              <span className={styles.muted}>Subtotal</span>
              <strong><MoneyAmount value={subtotalArs} /></strong>
            </div>
            <div className={styles.sumRow}>
              <span className={styles.muted}>Envío</span>
              <strong>{shippingArs === 0 ? "Gratis" : <MoneyAmount value={shippingArs} />}</strong>
            </div>
            {appliedCoupon ? (
              <div className={styles.sumRow}>
                <span className={styles.muted}>
                  Cupón <span className="mono">{appliedCoupon.code}</span>
                </span>
                <strong className={styles.discount}>
                  -<MoneyAmount value={couponDiscountArs} />
                </strong>
              </div>
            ) : null}
            <Separator />
            <div className={styles.sumRow}>
              <span>Total</span>
              <strong className={styles.sumTotal}><MoneyAmount value={totalArs} /></strong>
            </div>
          </div>

          <div className={styles.trustStrip}>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>
                <Lock size={16} />
              </span>
              <span>Pago seguro.</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>
                <ShieldCheck size={16} />
              </span>
              <span>Protección de compra y garantía.</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Finalizar compra</h1>
        </div>

        <div className={styles.topActions}>
          {!isLoggedIn ? (
            <Link href={loginHref} className={styles.inlineLoginLink}>
              ¿Ya tenés cuenta? Ingresar
            </Link>
          ) : null}

          <Button asChild variant="outline">
            <Link href="/carrito">
              <ArrowLeft size={16} />
              Volver al carrito
            </Link>
          </Button>
        </div>
      </div>

      {mercadoPagoReturnSummary ? (
        <Card>
          <CardContent className={styles.cardPad}>
            <div className={styles.promoBox}>
              <p
                className={
                  mercadoPagoReturnSummary.tone === "ok"
                    ? styles.promoMsgOk
                    : mercadoPagoReturnSummary.tone === "pending"
                      ? styles.promoHint
                      : styles.promoMsgBad
                }
              >
                <strong>{mercadoPagoReturnSummary.title}</strong>
              </p>
              <p className={styles.promoHint}>{mercadoPagoReturnSummary.message}</p>
              {mercadoPagoReturnSummary.externalReference ? (
                <p className={styles.promoHint}>
                  <strong>Referencia:</strong> {mercadoPagoReturnSummary.externalReference}
                </p>
              ) : null}
              {mercadoPagoReturnSummary.paymentId ? (
                <p className={styles.promoHint}>
                  <strong>Pago:</strong> {mercadoPagoReturnSummary.paymentId}
                </p>
              ) : null}
              <div className={styles.postPurchaseChecks}>
                <Button asChild type="button" variant="outline">
                  <Link
                    href={
                      mercadoPagoReturnSummary.externalReference
                        ? `/cuenta/pedidos?orderId=${encodeURIComponent(
                            mercadoPagoReturnSummary.externalReference
                          )}`
                        : "/cuenta/pedidos"
                    }
                  >
                    Ver mis pedidos
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <button
        type="button"
        className={styles.summaryToggle}
        onClick={() => setSummaryOpen((v) => !v)}
        aria-expanded={summaryOpen}
        aria-controls="checkout-summary-mobile"
      >
        <div className={styles.summaryToggleLeft}>
          <span className={styles.trustIcon} aria-hidden>
            <Truck size={16} />
          </span>
          <div className={styles.summaryToggleTitle}>
            <strong>Resumen</strong>
            <span>
              {itemCount} ítem{itemCount === 1 ? "" : "s"} · Total{" "}
              <MoneyAmount value={totalArs} />
            </span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`${styles.chev} ${summaryOpen ? styles.chevOpen : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {summaryOpen ? (
          <motion.div
            id="checkout-summary-mobile"
            initial={reduceMotion ? undefined : { height: 0 }}
            animate={reduceMotion ? undefined : { height: "auto" }}
            exit={reduceMotion ? undefined : { height: 0 }}
            transition={reduceMotion ? undefined : { duration: 0.2 }}
            className={styles.summaryCollapse}
          >
            {Summary}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.stepper}>
            {STEPS.map((s, idx) => {
              const active = idx === step;
              const done = idx < step && stepValid[idx];

              return (
                <button
                  key={s.key}
                  type="button"
                  className={[
                    styles.stepBtn,
                    active ? styles.stepActive : "",
                    done ? styles.stepDone : "",
                  ].join(" ")}
                  disabled={!canGoToStep(idx)}
                  onClick={() => {
                    if (idx === STEPS.length - 1) {
                      setPaymentStage("method");
                    }
                    setStep(idx);
                  }}
                >
                  <span className={styles.stepDot}>
                    {done ? <Check size={16} /> : idx + 1}
                  </span>
                  <span className={styles.stepMeta}>
                    <span className={styles.stepLabel}>{s.label}</span>
                    <span className={styles.stepHint}>{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduceMotion ? undefined : { y: 10 }}
              animate={reduceMotion ? undefined : { y: 0 }}
              exit={reduceMotion ? undefined : { y: 6 }}
              transition={reduceMotion ? undefined : { duration: 0.18 }}
            >
              <Card>
                <CardHeader>
                  <div className={styles.sectionTitleRow}>
                    <CardTitle>{stepTitle}</CardTitle>
                    {draft.deliveryMethod === "pickup" ? (
                      <Badge variant="secondary">Retiro</Badge>
                    ) : subtotalArs >= shippingSettings.freeShippingThresholdArs ? (
                      <Badge variant="secondary">Envío estándar gratis</Badge>
                    ) : (
                      <Badge variant="outline">
                        Envío desde <MoneyAmount value={STANDARD_SHIPPING_AMOUNT} />
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    {step === 0
                      ? "Usamos estos datos para enviarte el estado del pedido."
                      : step === 1
                        ? "Elegi donde queres recibir tu compra."
                        : step === 2
                          ? "Selecciona la velocidad de entrega."
                          : paymentStage === "method"
                            ? "Elegi como queres pagar. Al continuar te pedimos los datos."
                            : "Completá los datos del método elegido y confirmá el pedido."}
                  </CardDescription>
                </CardHeader>

                <CardContent className={styles.cardPad}>
                  {step === 0 ? (
                    <div className={styles.grid2}>
                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_firstName">Nombre</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_firstName"
                          value={draft.firstName}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, firstName: e.target.value }))
                          }
                          onBlur={() => touch("firstName")}
                          placeholder="Juan"
                        />
                        {isTouched("firstName") && errors.firstName ? (
                          <div className={styles.error}>{errors.firstName}</div>
                        ) : null}
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_lastName">Apellido</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_lastName"
                          value={draft.lastName}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, lastName: e.target.value }))
                          }
                          onBlur={() => touch("lastName")}
                          placeholder="Pérez"
                        />
                        {isTouched("lastName") && errors.lastName ? (
                          <div className={styles.error}>{errors.lastName}</div>
                        ) : null}
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_email">Correo electrónico</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_email"
                          value={draft.email}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              email: normalizeEmailInput(e.target.value),
                            }))
                          }
                          onBlur={() => touch("email")}
                          placeholder="correo@ejemplo.com"
                          inputMode="email"
                          autoComplete="email"
                        />
                        {isTouched("email") && errors.email ? (
                          <div className={styles.error}>{errors.email}</div>
                        ) : null}
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_phone">Teléfono</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_phone"
                          value={draft.phone}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, phone: e.target.value }))
                          }
                          onBlur={() => touch("phone")}
                          placeholder="343 123 4567"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                        {isTouched("phone") && errors.phone ? (
                          <div className={styles.error}>{errors.phone}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : step === 1 ? (
                    <div className={styles.grid2}>
                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_dni">DNI o CUIT</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_dni"
                          value={draft.dni}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, dni: e.target.value }))
                          }
                          onBlur={() => touch("dni")}
                          placeholder="12345678 o 20301234567"
                          inputMode="numeric"
                        />
                        {isTouched("dni") && errors.dni ? (
                          <div className={styles.error}>{errors.dni}</div>
                        ) : null}
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_postal">Código postal</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_postal"
                          value={draft.postalCode}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, postalCode: e.target.value }))
                          }
                          onBlur={() => touch("postalCode")}
                          placeholder="3100"
                          autoComplete="postal-code"
                        />
                        {isTouched("postalCode") && errors.postalCode ? (
                          <div className={styles.error}>{errors.postalCode}</div>
                        ) : null}
                      </div>

                      <div className={styles.addressInlineRow}>
                        <div className={styles.field}>
                          <div className={styles.fieldLabelRow}>
                            <Label htmlFor="checkout_address1">Dirección</Label>
                            <span className={styles.help}>Obligatorio</span>
                          </div>
                          <Input
                            id="checkout_address1"
                            value={draft.address1}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, address1: e.target.value }))
                            }
                            onBlur={() => touch("address1")}
                            placeholder="Alameda de la Federación"
                            autoComplete="street-address"
                          />
                          {isTouched("address1") && errors.address1 ? (
                            <div className={styles.error}>{errors.address1}</div>
                          ) : null}
                        </div>

                        <div className={styles.field}>
                          <div className={styles.fieldLabelRow}>
                            <Label htmlFor="checkout_address_number">Número</Label>
                            <span className={styles.help}>Obligatorio</span>
                          </div>
                          <Input
                            id="checkout_address_number"
                            value={draft.addressNumber}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, addressNumber: e.target.value }))
                            }
                            onBlur={() => touch("addressNumber")}
                            placeholder="3000"
                            autoComplete="address-line2"
                          />
                          {isTouched("addressNumber") && errors.addressNumber ? (
                            <div className={styles.error}>{errors.addressNumber}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_address2">Depto / piso (opcional)</Label>
                          <span className={styles.help}>Detalle</span>
                        </div>
                        <Input
                          id="checkout_address2"
                          value={draft.address2}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, address2: e.target.value }))
                          }
                          placeholder="Depto B, Timbre 2"
                        />
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_city">Localidad</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Input
                          id="checkout_city"
                          value={draft.city}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, city: e.target.value }))
                          }
                          onBlur={() => touch("city")}
                          placeholder="Paraná"
                          autoComplete="address-level2"
                        />
                        {isTouched("city") && errors.city ? (
                          <div className={styles.error}>{errors.city}</div>
                        ) : null}
                      </div>

                      <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_province">Provincia</Label>
                          <span className={styles.help}>Obligatorio</span>
                        </div>
                        <Select
                          id="checkout_province"
                          value={draft.province}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, province: e.target.value }))
                          }
                          onBlur={() => touch("province")}
                        >
                          {AR_PROVINCES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </Select>
                        {isTouched("province") && errors.province ? (
                          <div className={styles.error}>{errors.province}</div>
                        ) : null}
                      </div>

                      <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                        <div className={styles.fieldLabelRow}>
                          <Label htmlFor="checkout_notes">Indicaciones (opcional)</Label>
                          <span className={styles.help}>Entregas</span>
                        </div>
                        <Textarea
                          id="checkout_notes"
                          value={draft.notes}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, notes: e.target.value }))
                          }
                          placeholder="Ej: Portón negro, llamar antes de llegar."
                          rows={3}
                        />
                      </div>
                    </div>
                  ) : step === 2 ? (
                    <div className={styles.radioGrid}>
                      <button
                        type="button"
                        className={[
                          styles.radioCard,
                          draft.deliveryMethod === "standard" ? styles.radioCardActive : "",
                          draft.deliveryMethod === "standard"
                            ? styles.deliveryCardActive
                            : "",
                        ].join(" ")}
                        aria-pressed={draft.deliveryMethod === "standard"}
                        onClick={() =>
                          setDraft((d) => ({ ...d, deliveryMethod: "standard" }))
                        }
                      >
                        <span className={styles.radioLeft}>
                          <span className={styles.radioIcon} aria-hidden>
                            <Truck size={18} />
                          </span>
                          <span className={styles.radioInfo}>
                            <span className={styles.radioTitle}>Envío estándar</span>
                            <span className={styles.radioSub}>
                              2 a 5 días hábiles · Seguimiento incluido
                            </span>
                          </span>
                        </span>
                        <span className={styles.radioRight}>
                          <span className={styles.pill}>
                            {subtotalArs >= shippingSettings.freeShippingThresholdArs
                              ? "Gratis"
                              : <MoneyAmount value={STANDARD_SHIPPING_AMOUNT} />}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className={[
                          styles.radioCard,
                          draft.deliveryMethod === "express" ? styles.radioCardActive : "",
                          draft.deliveryMethod === "express"
                            ? styles.deliveryCardActive
                            : "",
                        ].join(" ")}
                        aria-pressed={draft.deliveryMethod === "express"}
                        onClick={() =>
                          setDraft((d) => ({ ...d, deliveryMethod: "express" }))
                        }
                      >
                        <span className={styles.radioLeft}>
                          <span className={styles.radioIcon} aria-hidden>
                            <Truck size={18} />
                          </span>
                          <span className={styles.radioInfo}>
                            <span className={styles.radioTitle}>Envío express</span>
                            <span className={styles.radioSub}>
                              24 a 48 hs · Prioridad en despacho
                            </span>
                          </span>
                        </span>
                        <span className={styles.radioRight}>
                          <span className={styles.pill}>
                            <MoneyAmount value={computeShippingArs(subtotalArs, "express", shippingSettings.freeShippingThresholdArs)} />
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className={[
                          styles.radioCard,
                          draft.deliveryMethod === "pickup" ? styles.radioCardActive : "",
                          draft.deliveryMethod === "pickup"
                            ? styles.deliveryCardActive
                            : "",
                        ].join(" ")}
                        aria-pressed={draft.deliveryMethod === "pickup"}
                        onClick={() =>
                          setDraft((d) => ({ ...d, deliveryMethod: "pickup" }))
                        }
                      >
                        <span className={styles.radioLeft}>
                          <span className={styles.radioIcon} aria-hidden>
                            <Store size={18} />
                          </span>
                          <span className={styles.radioInfo}>
                            <span className={styles.radioTitle}>Retiro en tienda</span>
                            <span className={styles.radioSub}>
                              Coordiná por WhatsApp · Sin costo de envío
                            </span>
                          </span>
                        </span>
                        <span className={styles.radioRight}>
                          <span className={styles.pill}>Gratis</span>
                        </span>
                      </button>

                      <div className={styles.trustItem}>
                        <span className={styles.trustIcon} aria-hidden>
                          <MapPin size={16} />
                        </span>
                        <span>
                          Envios a todo el pais. Gratis desde{" "}
                          <strong><MoneyAmount value={shippingSettings.freeShippingThresholdArs} /></strong> (estándar).
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.radioGrid}>
                      <div className={styles.radioGrid}>
                        <button
                          type="button"
                          className={[
                            styles.radioCard,
                            draft.paymentMethod === "mercadopago"
                              ? styles.radioCardActive
                              : "",
                            draft.paymentMethod === "mercadopago"
                              ? styles.deliveryCardActive
                              : "",
                          ].join(" ")}
                          onClick={() =>
                            setDraft((d) => ({ ...d, paymentMethod: "mercadopago" }))
                          }
                        >
                          <span className={styles.radioLeft}>
                            <span className={styles.radioIcon} aria-hidden>
                              <ShieldCheck size={18} />
                            </span>
                            <span className={styles.radioInfo}>
                              <span className={styles.radioTitle}>Mercado Pago</span>
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          className={[
                            styles.radioCard,
                            draft.paymentMethod === "transfer" ? styles.radioCardActive : "",
                            draft.paymentMethod === "transfer"
                              ? styles.deliveryCardActive
                              : "",
                          ].join(" ")}
                          onClick={() =>
                            setDraft((d) => ({ ...d, paymentMethod: "transfer" }))
                          }
                        >
                          <span className={styles.radioLeft}>
                            <span className={styles.radioIcon} aria-hidden>
                              <Landmark size={18} />
                            </span>
                            <span className={styles.radioInfo}>
                              <span className={styles.radioTitle}>Transferencia</span>
                              <span className={styles.radioSub}>
                                Alias/CBU · Subí comprobante
                              </span>
                            </span>
                          </span>
                        </button>
                      </div>

                      {paymentStage === "method" ? (
                        <div className={styles.promoBox}>
                          <p className={styles.promoHint}>
                            Elegí el método y presioná Continuar para completar los datos de
                            pago.
                          </p>
                        </div>
                      ) : null}

                      <div
                        className={
                          paymentStage === "details" ? undefined : styles.hiddenSection
                        }
                      >
                      <div className={styles.paymentDetailsWrap}>
                        <AnimatePresence mode="wait" initial={false}>
                          {draft.paymentMethod === "transfer" ? (
                            <motion.div
                              key="payment_method_transfer"
                              className={styles.paymentDetailsPanel}
                              initial={
                                reduceMotion
                                  ? undefined
                                  : { x: 10, filter: "blur(2px)" }
                              }
                              animate={
                                reduceMotion
                                  ? undefined
                                  : { x: 0, filter: "blur(0px)" }
                              }
                              exit={
                                reduceMotion
                                  ? undefined
                                  : { x: -10, filter: "blur(2px)" }
                              }
                              transition={{ duration: 0.18 }}
                            >
                              <div className={styles.promoBox}>
                                <p className={styles.promoHint}>
                                  <strong>Alias:</strong> TIENDA.AR - <strong>CBU:</strong>{" "}
                                  0000003100000000000000
                                </p>
                                <p className={styles.promoHint}>
                                  En la integracion real, aca se sube el comprobante y se
                                  valida el pago.
                                </p>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                      <Separator />

                      <div className={styles.grid2}>
                        <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                          <div className={styles.fieldLabelRow}>
                            <Label>Facturación</Label>
                            <span className={styles.help}>Opcional</span>
                          </div>

                          <div className={styles.radioGrid}>
                            <button
                              type="button"
                              className={[
                                styles.radioCard,
                                draft.invoiceType === "consumidor_final"
                                  ? styles.radioCardActive
                                  : "",
                                draft.invoiceType === "consumidor_final"
                                  ? styles.deliveryCardActive
                                  : "",
                              ].join(" ")}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  invoiceType: "consumidor_final",
                                }))
                              }
                            >
                              <span className={styles.radioLeft}>
                                <span className={styles.radioIcon} aria-hidden>
                                  <ShieldCheck size={18} />
                                </span>
                                <span className={styles.radioInfo}>
                                  <span className={styles.radioTitle}>
                                    Consumidor final
                                  </span>
                                  <span className={styles.radioSub}>
                                    Factura B / Ticket
                                  </span>
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              className={[
                                styles.radioCard,
                                draft.invoiceType === "factura_a"
                                  ? styles.radioCardActive
                                  : "",
                                draft.invoiceType === "factura_a"
                                  ? styles.deliveryCardActive
                                  : "",
                              ].join(" ")}
                              onClick={() =>
                                setDraft((d) => ({ ...d, invoiceType: "factura_a" }))
                              }
                            >
                              <span className={styles.radioLeft}>
                                <span className={styles.radioIcon} aria-hidden>
                                  <Landmark size={18} />
                                </span>
                                <span className={styles.radioInfo}>
                                  <span className={styles.radioTitle}>Factura A</span>
                                  <span className={styles.radioSub}>
                                    Requiere CUIT y razón social
                                  </span>
                                </span>
                              </span>
                              <span className={styles.radioRight}>
                                <span className={styles.pill}>Empresas</span>
                              </span>
                            </button>
                          </div>
                        </div>

                        {draft.invoiceType === "factura_a" ? (
                          <>
                            <div className={styles.field}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_cuit">CUIT</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Input
                                id="checkout_cuit"
                                value={draft.cuit}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, cuit: e.target.value }))
                                }
                                onBlur={() => touch("cuit")}
                                placeholder="20123456789"
                                inputMode="numeric"
                              />
                              {isTouched("cuit") && errors.cuit ? (
                                <div className={styles.error}>{errors.cuit}</div>
                              ) : null}
                            </div>

                            <div className={styles.field}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_razon">Razón social</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Input
                                id="checkout_razon"
                                value={draft.razonSocial}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    razonSocial: e.target.value,
                                  }))
                                }
                                onBlur={() => touch("razonSocial")}
                                placeholder="Tu Empresa SRL"
                              />
                              {isTouched("razonSocial") && errors.razonSocial ? (
                                <div className={styles.error}>{errors.razonSocial}</div>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                          <div className={styles.fieldLabelRow}>
                            <Label>Dirección de facturación</Label>
                            <span className={styles.help}>Opcional</span>
                          </div>

                          <div className={styles.trustItem}>
                            <span className={styles.trustIcon} aria-hidden>
                              <MapPin size={16} />
                            </span>
                            <span>
                              Usar la misma dirección que entrega
                              <span className={styles.inlineCheckbox}>
                                <Checkbox
                                  checked={draft.billingSameAsShipping}
                                  onCheckedChange={(checked) =>
                                    setDraft((d) => ({
                                      ...d,
                                      billingSameAsShipping: checked,
                                    }))
                                  }
                                />
                              </span>
                            </span>
                          </div>
                        </div>

                        {!draft.billingSameAsShipping ? (
                          <>
                            <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_bill_addr">Dirección</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Input
                                id="checkout_bill_addr"
                                value={draft.billingAddress1}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    billingAddress1: e.target.value,
                                  }))
                                }
                                onBlur={() => touch("billingAddress1")}
                                placeholder="Alameda de la Federación 3000"
                              />
                              {isTouched("billingAddress1") && errors.billingAddress1 ? (
                                <div className={styles.error}>{errors.billingAddress1}</div>
                              ) : null}
                            </div>

                            <div className={styles.field}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_bill_city">Localidad</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Input
                                id="checkout_bill_city"
                                value={draft.billingCity}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    billingCity: e.target.value,
                                  }))
                                }
                                onBlur={() => touch("billingCity")}
                                placeholder="Paraná"
                              />
                              {isTouched("billingCity") && errors.billingCity ? (
                                <div className={styles.error}>{errors.billingCity}</div>
                              ) : null}
                            </div>

                            <div className={styles.field}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_bill_prov">Provincia</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Select
                                id="checkout_bill_prov"
                                value={draft.billingProvince}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    billingProvince: e.target.value,
                                  }))
                                }
                                onBlur={() => touch("billingProvince")}
                              >
                                {AR_PROVINCES.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </Select>
                              {isTouched("billingProvince") && errors.billingProvince ? (
                                <div className={styles.error}>{errors.billingProvince}</div>
                              ) : null}
                            </div>

                            <div className={styles.field}>
                              <div className={styles.fieldLabelRow}>
                                <Label htmlFor="checkout_bill_cp">CP</Label>
                                <span className={styles.help}>Obligatorio</span>
                              </div>
                              <Input
                                id="checkout_bill_cp"
                                value={draft.billingPostalCode}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    billingPostalCode: e.target.value,
                                  }))
                                }
                                onBlur={() => touch("billingPostalCode")}
                                placeholder="3100"
                              />
                              {isTouched("billingPostalCode") && errors.billingPostalCode ? (
                                <div className={styles.error}>{errors.billingPostalCode}</div>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                          <div className={styles.trustItem}>
                            <span className={styles.trustIcon} aria-hidden>
                              <Lock size={16} />
                            </span>
                            <span>
                              Acepto términos y condiciones
                              <span className={styles.inlineCheckbox}>
                                <Checkbox
                                  checked={draft.acceptTerms}
                                  onCheckedChange={(checked) =>
                                    setDraft((d) => ({ ...d, acceptTerms: checked }))
                                  }
                                />
                              </span>
                            </span>
                          </div>
                          {isTouched("acceptTerms") && errors.acceptTerms ? (
                            <div className={styles.error}>{errors.acceptTerms}</div>
                          ) : null}
                        </div>

                        <div className={`${styles.field} ${styles.fieldFullSpan}`}>
                          <div className={styles.trustItem}>
                            <span className={styles.trustIcon} aria-hidden>
                              <ShieldCheck size={16} />
                            </span>
                            <span>
                              Quiero recibir novedades y ofertas
                              <span className={styles.inlineCheckbox}>
                                <Checkbox
                                  checked={draft.subscribe}
                                  onCheckedChange={(checked) =>
                                    setDraft((d) => ({ ...d, subscribe: checked }))
                                  }
                                />
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter>
                  <div className={styles.actionsBar}>
                    <div className={styles.actionsLeft}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={goPrev}
                        disabled={step === 0}
                      >
                        <ArrowLeft size={16} />
                        Volver
                      </Button>
                    </div>

                    <div className={styles.actionsRight}>
                      {step < STEPS.length - 1 ||
                      (step === STEPS.length - 1 && paymentStage === "method") ? (
                        <Button type="button" onClick={goNext}>
                          Continuar <ArrowRight size={16} />
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="lg"
                            onClick={() => void openPlaceOrderDialog()}
                            disabled={placingOrder}
                          >
                            {placingOrder
                              ? "Creando pedido..."
                              : (
                                <>
                                  Confirmar pedido - <MoneyAmount value={totalArs} />
                                </>
                              )}
                          </Button>

                          {placeOrderDialog}
                          {/*
                          <Dialog open={placeOrderOpen} onOpenChange={onPlaceOrderDialogChange}>
                            <DialogContent>
                            <DialogHeader>
                              <DialogTitle>
                                {placedOrder ? "Pedido creado" : "No se pudo crear el pedido"}
                              </DialogTitle>
                              <UiDialogDescription>
                                {placedOrder
                                  ? "Pedido registrado satisfactoriamente. Ya queda visible en Mi cuenta > Pedidos."
                                  : "No pudimos confirmar el pedido en este momento."}
                              </UiDialogDescription>
                            </DialogHeader>

                            {placeOrderError ? (
                              <div className={styles.placeOrderError}>
                                {placeOrderError}
                              </div>
                            ) : null}

                            <div className={styles.promoBox}>
                              <p className={styles.promoHint}>
                                <strong>Total:</strong> <MoneyAmount value={totalArs} /> · <strong>Envío:</strong>{" "}
                                {draft.deliveryMethod === "pickup"
                                  ? "Retiro"
                                  : shippingArs === 0
                                    ? "Gratis"
                                    : <MoneyAmount value={shippingArs} />}{" "}
                                · <strong>Pago:</strong>{" "}
                                {draft.paymentMethod === "mercadopago"
                                  ? "Mercado Pago"
                                  : "Transferencia"}
                              </p>

                              {placedOrder ? (
                                <p className={styles.promoHint}>
                                  <strong>Orden:</strong> {placedOrder.orderNumber}
                                  {placedOrder.trackingCode
                                    ? ` · Tracking: ${placedOrder.trackingCode}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>

                            {placedOrder?.transferProofToken ? (
                              <div className={styles.postPurchaseBox}>
                                <div className={styles.postPurchaseHead}>
                                  <h3>Comprobante de transferencia</h3>
                                  <p>
                                    Subilo ahora o guardá el link seguro para subirlo más
                                    tarde.
                                  </p>
                                </div>

                                <div className={styles.field}>
                                  <Label htmlFor="transfer_proof_file">
                                    Archivo (foto o PDF)
                                  </Label>
                                  <FilePicker
                                    id="transfer_proof_file"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    disabled={transferProofBusy}
                                    value={transferProofFile ? [transferProofFile] : []}
                                    onFiles={(files) => setTransferProofFile(files[0] ?? null)}
                                  />
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void uploadTransferProof()}
                                  disabled={transferProofBusy || !transferProofFile}
                                >
                                  {transferProofBusy ? "Subiendo..." : "Subir comprobante"}
                                  <Upload size={16} />
                                </Button>

                                <div className={styles.field}>
                                  <Label htmlFor="transfer_proof_link">
                                    Link seguro para subir más tarde
                                  </Label>
                                  <div className={styles.transferLinkRow}>
                                    <div className={styles.transferLinkField}>
                                      <Input
                                        id="transfer_proof_link"
                                        readOnly
                                        value={buildTransferProofLink()}
                                      />
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void copyTransferProofLink()}
                                      title="Copiar link"
                                      aria-label="Copiar link"
                                    >
                                      <Copy size={16} />
                                    </Button>
                                  </div>
                                </div>

                                {transferProofMessage ? (
                                  <p className={styles.postPurchaseMessage}>
                                    {transferProofMessage}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}

                            {!isLoggedIn && placedOrder ? (
                              <div className={styles.postPurchaseBox}>
                                <div className={styles.postPurchaseHead}>
                                  <h3>Después de comprar</h3>
                                  <p>
                                    Compra invitada habilitada. Si queres, crea tu cuenta ahora
                                    y guarda tus notificaciones.
                                  </p>
                                </div>

                                <label className={styles.postPurchaseCheck}>
                                  <Checkbox
                                    checked={createAccountAfterBuy}
                                    onCheckedChange={(checked) =>
                                      setCreateAccountAfterBuy(checked)
                                    }
                                  />
                                  <span>Crear cuenta con este correo electrónico al finalizar</span>
                                </label>

                                {createAccountAfterBuy ? (
                                  <div className={styles.grid2}>
                                    <div className={styles.field}>
                                      <Label htmlFor="post_password">Contraseña</Label>
                                      <PasswordInput
                                        id="post_password"
                                        value={accountPassword}
                                        onChange={(e) => setAccountPassword(e.target.value)}
                                        placeholder="Mínimo 8, mayúscula, minúscula y número"
                                      />
                                    </div>
                                    <div className={styles.field}>
                                      <Label htmlFor="post_password_confirm">
                                        Repetir contraseña
                                      </Label>
                                      <PasswordInput
                                        id="post_password_confirm"
                                        value={accountPasswordConfirm}
                                        onChange={(e) =>
                                          setAccountPasswordConfirm(e.target.value)
                                        }
                                      />
                                    </div>
                                  </div>
                                ) : null}

                                <div className={styles.postPurchaseChecks}>
                                  <label className={styles.postPurchaseCheck}>
                                    <Checkbox
                                      checked={notifyByEmail}
                                      onCheckedChange={(checked) =>
                                        setNotifyByEmail(checked)
                                      }
                                    />
                                    <span>Recibir estado del pedido por correo electrónico</span>
                                  </label>

                                  <label className={styles.postPurchaseCheck}>
                                    <Checkbox
                                      checked={notifyByWhatsapp}
                                      onCheckedChange={(checked) =>
                                        setNotifyByWhatsapp(checked)
                                      }
                                    />
                                    <span>Recibir estado del pedido por WhatsApp</span>
                                  </label>
                                </div>

                                {postCheckoutMessage ? (
                                  <p className={styles.postPurchaseMessage}>
                                    {postCheckoutMessage}
                                  </p>
                                ) : null}

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void saveGuestPostPurchasePreferences()}
                                  disabled={postCheckoutBusy}
                                >
                                  {postCheckoutBusy
                                    ? "Guardando..."
                                    : createAccountAfterBuy
                                      ? "Crear cuenta y guardar preferencias"
                                      : "Guardar preferencias"}
                                </Button>
                              </div>
                            ) : isLoggedIn && placedOrder ? (
                              <div className={styles.postPurchaseBox}>
                                <div className={styles.postPurchaseHead}>
                                  <h3>Notificaciones</h3>
                                  <p>
                                    Activa avisos de estado por correo electrónico o WhatsApp para este pedido.
                                  </p>
                                </div>

                                <div className={styles.postPurchaseChecks}>
                                  <label className={styles.postPurchaseCheck}>
                                    <Checkbox
                                      checked={notifyByEmail}
                                      onCheckedChange={(checked) =>
                                        setNotifyByEmail(checked)
                                      }
                                    />
                                    <span>Recibir estado del pedido por correo electrónico</span>
                                  </label>
                                  <label className={styles.postPurchaseCheck}>
                                    <Checkbox
                                      checked={notifyByWhatsapp}
                                      onCheckedChange={(checked) =>
                                        setNotifyByWhatsapp(checked)
                                      }
                                    />
                                    <span>Recibir estado del pedido por WhatsApp</span>
                                  </label>
                                </div>

                                {postCheckoutMessage ? (
                                  <p className={styles.postPurchaseMessage}>
                                    {postCheckoutMessage}
                                  </p>
                                ) : null}

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void saveLoggedPostPurchasePreferences()}
                                  disabled={postCheckoutBusy}
                                >
                                  {postCheckoutBusy
                                    ? "Guardando..."
                                    : "Guardar notificaciones"}
                                </Button>
                              </div>
                            ) : null}

                            <DialogFooter>
                              <Button asChild variant="outline">
                                <Link href="/productos">Volver al catálogo</Link>
                              </Button>
                              <Button type="button" onClick={() => setPlaceOrderOpen(false)}>
                                Cerrar
                              </Button>
                            </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          */}
                        </>
                      )}
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={styles.aside}>
          <div className={styles.sticky}>{Summary}</div>
        </div>
      </div>
    </div>
  );
}
