"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Heart,
  ListPlus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from "lucide-react";

import type { Product } from "@/lib/product";
import { notify } from "@/lib/notifications";
import { buildProductPath } from "@/lib/product-path";
import {
  formatCharacteristicValue,
  groupRenderableCharacteristicsBySection,
  readProductCharacteristicsFromMetadata,
} from "@/lib/product-characteristics";
import { useCart } from "@/lib/store-cart";
import { useCustomerSession } from "@/lib/customer-auth";
import { upsertCustomerProductHistory } from "@/lib/customer-product-history";
import { ApiHttpError } from "@/lib/store-client";
import {
  normalizeStoreMediaUrlList,
  toStoreMediaProxyUrl,
} from "@/lib/store-media-url";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
  sanitizeUserFacingMessage,
} from "@/lib/user-facing-errors";
import {
  estimateStoreDeliveryWindow,
  formatStoreDeliveryWindow,
  useStoreShippingSettings,
} from "@/lib/store-shipping";
import { trackStoreTelemetry } from "@/lib/store-telemetry";
import {
  useStoreProduct,
  useStoreProducts,
  useStoreRelatedProducts,
} from "@/lib/store-catalog";
import {
  createStoreAccountList,
  fetchStoreAccountLists,
  fetchStoreProductListSelection,
  saveStoreProductListSelection,
  type StoreProductListItem,
} from "@/lib/store-lists";
import {
  createStoreProductQuestion,
  useStoreProductQuestions,
} from "@/lib/store-product-questions";

import { ProductCard } from "@/components/products/product-card";
import { HorizontalProductsRail } from "@/components/shared/horizontal-products-rail";
import { QuantityControl } from "@/components/shared/quantity-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColorSwatchSelector } from "@/components/ui/color-swatch-selector";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyAmount } from "@/components/ui/money-amount";
import {
  ProductDetailSkeleton,
  ProductMediaGallery,
} from "./product-detail-page.components";
import {
  CONDITION_ORDER,
  RELATED_TARGET_COUNT,
  clearPendingProductQuestion,
  formatQuestionShortDate,
  getStockCopy,
  hasPersistedCharacteristics,
  mapQuestionFormError,
  readPendingProductQuestion,
  uniqStrings,
  writePendingProductQuestion,
} from "./product-detail-page.helpers";
import styles from "./product-detail-page.module.css";

const BUY_NOW_INTENT_KEY = "store:checkout:buy-now:v1";
const PRODUCT_QUESTION_MIN_CHARS = 8;
const PRODUCT_QUESTION_MAX_CHARS = 120;
type ProductSelectionState = {
  scopeId: string;
  variantId: string | null;
  color: string | null;
  size: string | null;
};

type ListsModalMode = "select" | "create";

type ListsSelectionSnapshot = {
  favorite: boolean;
  listIds: string[];
};

type ListsSelectionChange = "added" | "removed" | "none";

function normalizeSearchText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampProductQuestionDraft(input: string) {
  return input.slice(0, PRODUCT_QUESTION_MAX_CHARS);
}

function normalizeProductQuestionForSubmit(input: string) {
  return clampProductQuestionDraft(input).trim();
}

export function ProductDetailPage({ productId }: { productId: string }) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const { addItem } = useCart();
  const {
    hydrated: customerHydrated,
    isLoggedIn,
    customer,
    sessionUnavailable,
    sessionError,
  } = useCustomerSession();
  const { settings: shippingSettings } = useStoreShippingSettings();
  const [qty, setQty] = useState(1);
  const [selectionState, setSelectionState] = useState<ProductSelectionState>({
    scopeId: "",
    variantId: null,
    color: null,
    size: null,
  });
  const [questionDraft, setQuestionDraft] = useState("");
  const [questionSending, setQuestionSending] = useState(false);
  const [questionFormError, setQuestionFormError] = useState<string | null>(null);
  const [questionFormMessage, setQuestionFormMessage] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [listsModalOpen, setListsModalOpen] = useState(false);
  const [listsModalLoading, setListsModalLoading] = useState(false);
  const [listsModalSaving, setListsModalSaving] = useState(false);
  const [, setListsModalError] = useState<string | null>(null);
  const [listsModalFavorite, setListsModalFavorite] = useState(false);
  const [listsModalListIds, setListsModalListIds] = useState<string[]>([]);
  const [listsModalLists, setListsModalLists] = useState<StoreProductListItem[]>([]);
  const [listsModalPreviewById, setListsModalPreviewById] = useState<
    Record<string, string>
  >({});
  const [listsModalMode, setListsModalMode] = useState<ListsModalMode>("select");
  const [listsModalInitialSelection, setListsModalInitialSelection] =
    useState<ListsSelectionSnapshot | null>(null);
  const [createListName, setCreateListName] = useState("");
  const [createListSaving, setCreateListSaving] = useState(false);
  const [createListError, setCreateListError] = useState<string | null>(null);
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const trackedProductViewsRef = useRef(new Set<string>());
  const recoveredQuestionRef = useRef(false);

  const { product, loading, error, notFound, refetch } = useStoreProduct(productId);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [productId]);

  const { products: groupVariants } = useStoreProducts({
    groupId: product?.variantGroupId,
    limit: 50,
    offset: 0,
    sort: "relevancia",
    skip: !product?.variantGroupId,
  });

  const variants = useMemo<Product[]>(() => {
    const set = new Map<string, Product>();
    if (product) {
      set.set(product.id, product);
    }
    for (const item of groupVariants) {
      if (item.id) set.set(item.id, item);
    }
    return Array.from(set.values()).sort(
      (a, b) => CONDITION_ORDER[a.condition] - CONDITION_ORDER[b.condition]
    );
  }, [groupVariants, product]);

  const selectionScopeId = product?.id ?? "";

  const scopedSelection = useMemo<ProductSelectionState>(() => {
    if (selectionState.scopeId === selectionScopeId) return selectionState;

    return {
      scopeId: selectionScopeId,
      variantId: product?.id ?? null,
      color: product?.color ?? null,
      size: product?.size ?? null,
    };
  }, [
    product?.color,
    product?.id,
    product?.size,
    selectionScopeId,
    selectionState,
  ]);

  const activeProduct = useMemo<Product | null>(() => {
    if (!variants.length) return product ?? null;
    const found = variants.find((v) => v.id === scopedSelection.variantId);
    return found || product || variants[0] || null;
  }, [product, scopedSelection.variantId, variants]);

  const colorOptions = useMemo(() => {
    const uniq = new Map<string, Product>();
    for (const v of variants) {
      if (v.color) {
        const key = v.color.toLowerCase();
        if (!uniq.has(key)) uniq.set(key, v);
      }
    }
    return Array.from(uniq.values());
  }, [variants]);

  const selectedColor = useMemo(() => {
    const fromSelection = scopedSelection.color?.trim();
    if (fromSelection) return fromSelection;

    const fromActive = activeProduct?.color?.trim();
    if (fromActive) return fromActive;

    const fromProduct = product?.color?.trim();
    if (fromProduct) return fromProduct;

    const fromOptions = colorOptions[0]?.color?.trim();
    if (fromOptions) return fromOptions;

    return null;
  }, [activeProduct?.color, colorOptions, product?.color, scopedSelection.color]);

  const sizeOptions = useMemo(() => {
    if (activeProduct?.category !== "Indumentaria") return [] as string[];

    const normalizedColor = selectedColor?.trim().toLowerCase();
    const pool =
      normalizedColor && variants.length
        ? variants.filter((v) => v.color?.toLowerCase() === normalizedColor)
        : variants;
    const uniq = Array.from(
      new Set(pool.map((v) => v.size).filter((s): s is string => Boolean(s)))
    );
    return uniq;
  }, [activeProduct?.category, selectedColor, variants]);

  const selectedSize = useMemo(() => {
    if (!sizeOptions.length) return null;

    const normalizedSelection = scopedSelection.size?.trim().toLowerCase();
    if (normalizedSelection) {
      const matchedSelection = sizeOptions.find(
        (size) => size.toLowerCase() === normalizedSelection
      );
      if (matchedSelection) return matchedSelection;
    }

    const normalizedActiveSize = activeProduct?.size?.trim().toLowerCase();
    if (normalizedActiveSize) {
      const matchedActiveSize = sizeOptions.find(
        (size) => size.toLowerCase() === normalizedActiveSize
      );
      if (matchedActiveSize) return matchedActiveSize;
    }

    return sizeOptions[0] ?? null;
  }, [activeProduct?.size, scopedSelection.size, sizeOptions]);

  const resolveVariantByOptions = useCallback(
    (color?: string | null, size?: string | null) => {
      const normalizedColor = color?.toLowerCase();
      const normalizedSize = size?.toLowerCase();
      const candidates = variants.filter((v) => {
        const matchColor = normalizedColor
          ? v.color?.toLowerCase() === normalizedColor
          : true;
        const matchSize = normalizedSize
          ? v.size?.toLowerCase() === normalizedSize
          : true;
        return matchColor && matchSize;
      });
      return candidates[0] ?? variants[0] ?? null;
    },
    [variants]
  );

  const handleColorSelect = (color?: string | null) => {
    if (!color) return;
    const normalizedColor = color.trim();
    if (!normalizedColor) return;

    const next = resolveVariantByOptions(
      normalizedColor,
      sizeOptions.includes(selectedSize ?? "") ? selectedSize : null
    );

    let nextSize: string | null = selectedSize;
    if (activeProduct?.category === "Indumentaria") {
      const nextSizes = variants
        .filter((v) => v.color?.toLowerCase() === normalizedColor.toLowerCase())
        .map((v) => v.size)
        .filter((s): s is string => Boolean(s));
      if (nextSizes.length) {
        const normalized = (selectedSize ?? "").toLowerCase();
        if (!nextSizes.some((s) => s.toLowerCase() === normalized)) {
          nextSize = nextSizes[0] ?? null;
        } else {
          nextSize =
            nextSizes.find((s) => s.toLowerCase() === normalized) ?? selectedSize;
        }
      } else {
        nextSize = null;
      }
    } else {
      nextSize = null;
    }

    setSelectionState({
      scopeId: selectionScopeId,
      variantId: next?.id ?? null,
      color: normalizedColor,
      size: nextSize,
    });
  };

  const handleSizeSelect = (size: string) => {
    const normalizedSize = size.trim();
    if (!normalizedSize) return;

    const next = resolveVariantByOptions(selectedColor, normalizedSize);
    setSelectionState({
      scopeId: selectionScopeId,
      variantId: next?.id ?? null,
      color: selectedColor,
      size: normalizedSize,
    });
  };

  const currentProduct = activeProduct ?? product;
  const deliveryWindow = useMemo(() => estimateStoreDeliveryWindow(), []);
  const {
    products: related,
    loading: relatedLoading,
    error: relatedError,
  } = useStoreRelatedProducts({
    productId: product?.id ?? "",
    limit: RELATED_TARGET_COUNT,
    skip: !product,
  });
  const {
    questions: previewProductQuestions,
    count: previewProductQuestionsCount,
    error: previewProductQuestionsError,
    refetch: refetchPreviewProductQuestions,
  } = useStoreProductQuestions({
    productId: product?.id ?? "",
    limit: 3,
    offset: 0,
    skip: !product?.id,
  });
  const {
    questions: allProductQuestions,
    loading: allProductQuestionsLoading,
    error: allProductQuestionsError,
    refetch: refetchAllProductQuestions,
  } = useStoreProductQuestions({
    productId: product?.id ?? "",
    limit: 100,
    offset: 0,
    skip: !product?.id || !questionsModalOpen,
  });

  useEffect(() => {
    if (!currentProduct) return;
    if (trackedProductViewsRef.current.has(currentProduct.id)) return;
    trackedProductViewsRef.current.add(currentProduct.id);

    void trackStoreTelemetry("product_view", {
      product_id: currentProduct.id,
      product_name: currentProduct.name,
      brand: currentProduct.brand,
      category: currentProduct.category,
      condition: currentProduct.condition,
      price_ars: currentProduct.priceArs,
      in_stock:
        typeof currentProduct.inStock === "boolean"
          ? currentProduct.inStock
          : null,
      });

    if (customerHydrated && isLoggedIn && customer?.id) {
      upsertCustomerProductHistory(customer.id, currentProduct);
    }
  }, [currentProduct, customerHydrated, isLoggedIn, customer?.id]);

  useEffect(() => {
    setQuestionDraft("");
    setQuestionFormError(null);
    setQuestionFormMessage(null);
    setAccountActionError(null);
    setListsModalOpen(false);
    setListsModalLoading(false);
    setListsModalSaving(false);
    setListsModalError(null);
    setListsModalFavorite(false);
    setListsModalListIds([]);
    setListsModalLists([]);
    setListsModalPreviewById({});
    setListsModalMode("select");
    setListsModalInitialSelection(null);
    setCreateListName("");
    setCreateListSaving(false);
    setCreateListError(null);
    setQuestionsModalOpen(false);
    recoveredQuestionRef.current = false;
  }, [product?.id]);

  const submitQuestion = useCallback(
    async (questionRaw: string, source: "manual" | "recovered" = "manual") => {
      const question = normalizeProductQuestionForSubmit(questionRaw);
      if (question.length < PRODUCT_QUESTION_MIN_CHARS) {
        setQuestionFormError(
          `Escribe una pregunta de al menos ${PRODUCT_QUESTION_MIN_CHARS} caracteres.`
        );
        setQuestionFormMessage(null);
        return false;
      }
      if (!product?.id) return false;

      try {
        setQuestionSending(true);
        setQuestionFormError(null);
        setQuestionFormMessage(null);
        await createStoreProductQuestion(product.id, { question });
        setQuestionDraft("");
        setQuestionFormMessage(
          source === "recovered"
            ? "Tu pregunta guardada se envió correctamente."
            : "Tu pregunta fue enviada. Te responderemos en cuanto la revisemos."
        );
        if (questionsModalOpen) {
          await Promise.all([
            refetchPreviewProductQuestions(),
            refetchAllProductQuestions(),
          ]);
        } else {
          await refetchPreviewProductQuestions();
        }
        return true;
      } catch (submitError) {
        if (
          submitError instanceof ApiHttpError &&
          (submitError.status === 401 || submitError.status === 403)
        ) {
          writePendingProductQuestion({
            productId: product.id,
            question,
            createdAt: Date.now(),
          });
          setQuestionFormError(null);
          setQuestionFormMessage("Inicia sesión para enviar tu pregunta.");
          const redirectPath =
            pathname && pathname.startsWith("/")
              ? pathname
              : buildProductPath(product.id, product.name);
          router.push(`/ingresar?redirect=${encodeURIComponent(redirectPath)}`);
          return false;
        }
        setQuestionFormError(
          mapQuestionFormError(
            submitError,
            "No pudimos enviar tu pregunta. Intenta nuevamente."
          )
        );
        setQuestionFormMessage(null);
        if (source === "recovered") {
          setQuestionDraft(question);
        }
        return false;
      } finally {
        setQuestionSending(false);
      }
    },
    [
      pathname,
      product?.name,
      product?.id,
      questionsModalOpen,
      refetchAllProductQuestions,
      refetchPreviewProductQuestions,
      router,
    ]
  );

  useEffect(() => {
    if (!customerHydrated || !isLoggedIn || !product?.id) return;
    if (recoveredQuestionRef.current) return;

    const pending = readPendingProductQuestion();
    if (!pending || pending.productId !== product.id) return;

    recoveredQuestionRef.current = true;
    clearPendingProductQuestion();
    setQuestionDraft(clampProductQuestionDraft(pending.question));
    void submitQuestion(pending.question, "recovered");
  }, [customerHydrated, isLoggedIn, product?.id, submitQuestion]);

  const galleryImages = (() => {
    return normalizeStoreMediaUrlList([
      ...(activeProduct?.images ?? []),
      ...(activeProduct?.imageUrl ? [activeProduct.imageUrl] : []),
    ]);
  })();
  const characteristicSections = useMemo(
    () => {
      if (!hasPersistedCharacteristics(currentProduct?.metadata)) return [];
      return groupRenderableCharacteristicsBySection(
        readProductCharacteristicsFromMetadata(currentProduct?.metadata, {
          category: currentProduct?.category,
          hints: {
            brand: currentProduct?.brand,
            model: currentProduct?.name,
            color: currentProduct?.color,
          },
        })
      );
    },
    [
      currentProduct?.metadata,
      currentProduct?.category,
      currentProduct?.brand,
      currentProduct?.name,
      currentProduct?.color,
    ]
  );
  const hasCharacteristics = characteristicSections.length > 0;

  if (loading) {
    return <ProductDetailSkeleton />;
  }

  if (error) {
    const safeError = sanitizeUserFacingMessage(
      error,
      "No pudimos cargar el producto. Intenta nuevamente."
    );

    if (safeError === FRIENDLY_ERROR_MESSAGES.serviceUnavailable) {
      return <ProductDetailSkeleton />;
    }

    return (
      <div className={styles.page}>
        <Card className={styles.notFoundCard}>
          <CardHeader>
            <CardTitle>No pudimos cargar el producto</CardTitle>
            <CardDescription>{safeError}</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardPad}>
            <div className={styles.linksRow}>
              <Button onClick={() => void refetch()}>Reintentar</Button>
              <Button asChild variant="outline">
                <Link href="/productos">
                  <ArrowLeft size={16} />
                  Volver al catálogo
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!product || notFound) {
    return (
      <div className={styles.page}>
        <Card className={styles.notFoundCard}>
          <CardHeader>
            <CardTitle>Producto no encontrado</CardTitle>
            <CardDescription>
              El producto no existe o ya no está disponible.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.cardPad}>
            <Button asChild>
              <Link href="/productos">
                <ArrowLeft size={16} />
                Volver al catálogo
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasStockData =
    currentProduct?.stockAvailable !== undefined || currentProduct?.inStock !== undefined;
  const stockAvailable = hasStockData
    ? Math.max(0, Math.trunc(currentProduct?.stockAvailable ?? 0))
    : 999;
  const hasValidPrice =
    currentProduct !== null &&
    Number.isFinite(currentProduct?.priceArs) &&
    (currentProduct?.priceArs ?? 0) > 0;
  const inStock = hasStockData ? (currentProduct?.inStock ?? stockAvailable > 0) : true;
  const description = currentProduct?.description?.trim() ?? "";
  const hasDescription = description.length > 0;
  const categoryHref = currentProduct
    ? `/productos?categoria=${encodeURIComponent(currentProduct.category)}`
    : "/productos";
  const ctaDisabled = !hasValidPrice || (hasStockData && !inStock);
  const clampedQty = Math.max(1, Math.min(qty, stockAvailable || qty));
  const stockCopy = hasStockData && inStock ? getStockCopy(stockAvailable) : null;
  const deliveryWindowLabel = formatStoreDeliveryWindow(deliveryWindow);
  const qualifiesForFreeShipping =
    hasValidPrice &&
    currentProduct &&
    (shippingSettings.freeShippingThresholdArs <= 0 ||
      currentProduct.priceArs >= shippingSettings.freeShippingThresholdArs);
  const deliveryEtaMessage = qualifiesForFreeShipping
    ? `Llega gratis entre el ${deliveryWindowLabel}`
    : `Llega entre el ${deliveryWindowLabel}`;
  const normalizedName = currentProduct?.name
    ? normalizeSearchText(currentProduct.name)
    : "";
  const normalizedBrand = currentProduct?.brand
    ? normalizeSearchText(currentProduct.brand)
    : "";
  const showBrandLine = Boolean(
    normalizedBrand &&
      (!normalizedName || !normalizedName.includes(normalizedBrand))
  );

  const addCurrentQty = () => {
    if (!currentProduct) return;
    addItem(currentProduct, clampedQty);
  };

  const accountUnavailableMessage =
    sessionError || FRIENDLY_ERROR_MESSAGES.serviceUnavailable;

  const resolveAccountRedirectPath = () => {
    if (pathname && pathname.startsWith("/")) return pathname;
    if (currentProduct) {
      return buildProductPath(currentProduct.id, currentProduct.name);
    }
    if (product?.id) {
      return buildProductPath(product.id, product.name);
    }
    return "/productos";
  };

  const loadListsSelection = async () => {
    if (!currentProduct?.id) return;

    setListsModalLoading(true);
    setListsModalError(null);
    try {
      const [selection, allLists] = await Promise.all([
        fetchStoreProductListSelection(currentProduct.id),
        fetchStoreAccountLists(),
      ]);
      const normalizedLists = selection.lists.filter(
        (item) => item.id.trim() && item.name.trim()
      );
      const allowedIds = new Set(normalizedLists.map((item) => item.id));
      const normalizedSelectedIds = uniqStrings(
        selection.listIds.filter((listId) => allowedIds.has(listId))
      );
      const nextPreviewById: Record<string, string> = {};
      for (const list of allLists.lists) {
        const listId = list.id.trim();
        const previewUrl = toStoreMediaProxyUrl(list.previewImageUrl);
        if (!listId || !previewUrl) continue;
        nextPreviewById[listId] = previewUrl;
      }

      setListsModalFavorite(selection.favorite);
      setListsModalLists(normalizedLists);
      setListsModalPreviewById(nextPreviewById);
      setListsModalListIds(normalizedSelectedIds);
      setListsModalInitialSelection({
        favorite: selection.favorite,
        listIds: normalizedSelectedIds,
      });
    } catch (loadError) {
      setListsModalError(
        mapFriendlyError(loadError, "No pudimos cargar tus listas.", "login")
      );
      setListsModalFavorite(false);
      setListsModalLists([]);
      setListsModalPreviewById({});
      setListsModalListIds([]);
      setListsModalInitialSelection(null);
    } finally {
      setListsModalLoading(false);
    }
  };

  const resolveListsSelectionChange = (
    initial: ListsSelectionSnapshot | null,
    next: ListsSelectionSnapshot
  ): ListsSelectionChange => {
    if (!initial) return "none";

    const initialIds = uniqStrings(initial.listIds.map((id) => id.trim()).filter(Boolean));
    const nextIds = uniqStrings(next.listIds.map((id) => id.trim()).filter(Boolean));
    const initialSet = new Set(initialIds);

    const hasAdded =
      (!initial.favorite && next.favorite) ||
      nextIds.some((listId) => !initialSet.has(listId));
    const hasRemoved =
      (initial.favorite && !next.favorite) ||
      initialIds.some((listId) => !nextIds.includes(listId));

    if (hasAdded) return "added";
    if (hasRemoved) return "removed";
    return "none";
  };

  const showListsSelectionToast = (change: ListsSelectionChange) => {
    if (change === "added") {
      notify("Agregaste el producto a la lista", undefined, "success");
      return;
    }
    if (change === "removed") {
      notify("Quitaste el producto de la lista", undefined, "info");
    }
  };

  const handleOpenListsModal = async () => {
    if (!currentProduct?.id || !customerHydrated || listsModalLoading) return;

    if (sessionUnavailable) {
      setAccountActionError(accountUnavailableMessage);
      return;
    }

    if (!isLoggedIn) {
      const redirectPath = resolveAccountRedirectPath();
      router.push(`/ingresar?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    setAccountActionError(null);
    setListsModalOpen(true);
    setListsModalError(null);
    setListsModalMode("select");
    setListsModalInitialSelection(null);
    setCreateListName("");
    setCreateListError(null);
    await loadListsSelection();
  };

  const handleOpenCreateListDialog = () => {
    setCreateListName("");
    setCreateListError(null);
    setListsModalError(null);
    setListsModalMode("create");
  };

  const toggleListsModalList = (listIdRaw: string, checked?: boolean) => {
    const listId = listIdRaw.trim();
    if (!listId) return;

    setListsModalListIds((current) => {
      const exists = current.includes(listId);
      const shouldSelect = typeof checked === "boolean" ? checked : !exists;
      if (shouldSelect && !exists) return [...current, listId];
      if (!shouldSelect && exists) return current.filter((id) => id !== listId);
      return current;
    });
  };

  const handleCreateListFromModal = async () => {
    if (!currentProduct?.id || !customerHydrated) return;

    const name = createListName.trim();
    if (!name) {
      setCreateListError("Escribe un nombre para la lista.");
      return;
    }
    if (sessionUnavailable) {
      setCreateListError(accountUnavailableMessage);
      return;
    }
    if (!isLoggedIn) return;

    setCreateListSaving(true);
    setCreateListError(null);
    setListsModalError(null);
    try {
      const created = await createStoreAccountList(name);
      const createdPreviewUrl = toStoreMediaProxyUrl(created.previewImageUrl);
      const nextItem = { id: created.id, name: created.name };
      setListsModalLists((current) => {
        const next = [nextItem, ...current.filter((item) => item.id !== nextItem.id)];
        return uniqStrings(next.map((item) => item.id))
          .map((id) => next.find((item) => item.id === id) || null)
          .filter((item): item is StoreProductListItem => Boolean(item));
      });
      setListsModalPreviewById((current) => {
        if (current[created.id] || !createdPreviewUrl) return current;
        return {
          ...current,
          [created.id]: createdPreviewUrl,
        };
      });

      const nextListIds = uniqStrings([...listsModalListIds, created.id]);
      const saved = await saveStoreProductListSelection(currentProduct.id, {
        favorite: listsModalFavorite,
        listIds: nextListIds,
      });

      const allowedIds = new Set(saved.lists.map((item) => item.id));
      const normalizedSavedListIds = uniqStrings(
        saved.listIds.filter((listId) => allowedIds.has(listId))
      );
      const nextSelection: ListsSelectionSnapshot = {
        favorite: saved.favorite,
        listIds: normalizedSavedListIds,
      };
      const selectionChange = resolveListsSelectionChange(
        listsModalInitialSelection,
        nextSelection
      );
      const nextToastChange =
        selectionChange === "none" ? ("added" as const) : selectionChange;

      setListsModalFavorite(saved.favorite);
      setListsModalListIds(normalizedSavedListIds);
      setListsModalLists(saved.lists);
      setListsModalInitialSelection(nextSelection);
      setListsModalPreviewById((current) => {
        const next: Record<string, string> = {};
        for (const [id, url] of Object.entries(current)) {
          if (!allowedIds.has(id)) continue;
          if (!url.trim()) continue;
          next[id] = url;
        }
        return next;
      });

      setCreateListName("");
      setListsModalMode("select");
      setCreateListError(null);
      setListsModalOpen(false);
      showListsSelectionToast(nextToastChange);
    } catch (createError) {
      setCreateListError(
        mapFriendlyError(
          createError,
          "No pudimos crear la lista y guardar el producto.",
          "login"
        )
      );
    } finally {
      setCreateListSaving(false);
    }
  };

  const handleConfirmListsModal = async () => {
    if (!currentProduct?.id || !customerHydrated) return;
    if (sessionUnavailable) {
      setListsModalError(accountUnavailableMessage);
      return;
    }
    if (!isLoggedIn) return;

    setListsModalSaving(true);
    setListsModalError(null);
    try {
      const saved = await saveStoreProductListSelection(currentProduct.id, {
        favorite: listsModalFavorite,
        listIds: listsModalListIds,
      });
      const allowedIds = new Set(saved.lists.map((item) => item.id));
      const normalizedSavedListIds = uniqStrings(
        saved.listIds.filter((listId) => allowedIds.has(listId))
      );
      const nextSelection: ListsSelectionSnapshot = {
        favorite: saved.favorite,
        listIds: normalizedSavedListIds,
      };
      const selectionChange = resolveListsSelectionChange(
        listsModalInitialSelection,
        nextSelection
      );

      setListsModalFavorite(saved.favorite);
      setListsModalListIds(normalizedSavedListIds);
      setListsModalLists(saved.lists);
      setListsModalInitialSelection(nextSelection);
      setListsModalPreviewById((current) => {
        const next: Record<string, string> = {};
        for (const [id, url] of Object.entries(current)) {
          if (!allowedIds.has(id)) continue;
          if (!url.trim()) continue;
          next[id] = url;
        }
        return next;
      });
      setListsModalMode("select");
      setListsModalOpen(false);
      showListsSelectionToast(selectionChange);
    } catch (saveError) {
      setListsModalError(
        mapFriendlyError(
          saveError,
          "No pudimos guardar la selección de listas.",
          "login"
        )
      );
    } finally {
      setListsModalSaving(false);
    }
  };

  const handleListsDialogOpenChange = (open: boolean) => {
    if (!open && (listsModalSaving || createListSaving)) return;

    setListsModalOpen(open);
    if (!open) {
      setListsModalMode("select");
      setListsModalInitialSelection(null);
      setCreateListName("");
      setCreateListError(null);
      setListsModalError(null);
    }
  };

  const handleGoToMyLists = () => {
    if (!customerHydrated) return;
    if (sessionUnavailable) {
      setListsModalError(accountUnavailableMessage);
      return;
    }
    if (!isLoggedIn) {
      const redirectPath = resolveAccountRedirectPath();
      router.push(`/ingresar?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    setListsModalMode("select");
    setListsModalOpen(false);
    router.push("/cuenta/listas");
  };

  const handleBuyNow = () => {
    if (ctaDisabled || !currentProduct) return;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          BUY_NOW_INTENT_KEY,
          JSON.stringify({
            items: [
              {
                id: currentProduct.id,
                name: currentProduct.name,
                brand: currentProduct.brand,
                category: currentProduct.category,
                priceArs: currentProduct.priceArs,
                imageUrl: galleryImages[0] || undefined,
                imageUrls: galleryImages.length ? galleryImages : undefined,
                qty: clampedQty,
              },
            ],
            createdAt: Date.now(),
          })
        );
      } catch {
        // best effort; if it fails, fallback will show flujo de compra vacio
      }
    }
    router.push("/checkout?intent=buy-now");
  };

  const handleAddToCart = () => {
    if (ctaDisabled) return;
    addCurrentQty();
    if (currentProduct) {
      void trackStoreTelemetry("add_to_cart", {
        source: "product_detail",
        product_id: currentProduct.id,
        product_name: currentProduct.name,
        brand: currentProduct.brand,
        category: currentProduct.category,
        unit_price_ars: currentProduct.priceArs,
        quantity: clampedQty,
      });
    }
  };
  const hasQuestionsForModal = previewProductQuestionsCount > 0;
  const hasQuestionsForModalResolved =
    hasQuestionsForModal || previewProductQuestions.length > 0;
  const showQuestionsError =
    Boolean(previewProductQuestionsError) && previewProductQuestions.length === 0;
  const accountActionFeedback = accountActionError;

  const handleQuestionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const question = normalizeProductQuestionForSubmit(questionDraft);
    if (question.length < PRODUCT_QUESTION_MIN_CHARS) {
      setQuestionFormError(
        `Escribe una pregunta de al menos ${PRODUCT_QUESTION_MIN_CHARS} caracteres.`
      );
      setQuestionFormMessage(null);
      return;
    }
    if (!product?.id) return;
    if (!customerHydrated) {
      setQuestionFormError("Estamos validando tu sesión. Intenta nuevamente.");
      setQuestionFormMessage(null);
      return;
    }
    if (!isLoggedIn) {
      writePendingProductQuestion({
        productId: product.id,
        question,
        createdAt: Date.now(),
      });
      setQuestionFormError(null);
      setQuestionFormMessage("Inicia sesión para enviar tu pregunta.");
      const redirectPath =
        pathname && pathname.startsWith("/")
          ? pathname
          : buildProductPath(product.id, product.name);
      router.push(`/ingresar?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    await submitQuestion(question, "manual");
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Inicio</Link>
        <span>/</span>
        <Link href="/productos">Productos</Link>
        <span>/</span>
        <Link href={categoryHref}>{currentProduct?.category}</Link>
        <span>/</span>
        <strong>{currentProduct?.name}</strong>
      </nav>

      <div className={styles.layout}>
        <motion.div
          className={styles.mediaWrap}
          initial={reduceMotion ? undefined : { y: 8 }}
          animate={reduceMotion ? undefined : { y: 0 }}
          transition={reduceMotion ? undefined : { duration: 0.2 }}
        >
          <ProductMediaGallery
            key={currentProduct?.id ?? product.id}
            productName={currentProduct?.name ?? ""}
            productCategory={currentProduct?.category}
            images={galleryImages}
            reduceMotion={Boolean(reduceMotion)}
          />
        </motion.div>

        <motion.div
          className={styles.infoCol}
          initial={reduceMotion ? undefined : { y: 8 }}
          animate={reduceMotion ? undefined : { y: 0 }}
          transition={reduceMotion ? undefined : { duration: 0.2, delay: 0.04 }}
        >
          <div className={styles.deliveryEtaBanner} aria-live="polite">
            <Truck size={15} className={styles.deliveryEtaIcon} />
            <span
              className={`${styles.deliveryEtaText} ${qualifiesForFreeShipping ? styles.deliveryEtaTextFree : ""}`}
            >
              {deliveryEtaMessage}
            </span>
          </div>

          <div className={styles.infoCardWrap}>
            <Card className={styles.infoCard}>
              <CardContent className={`${styles.cardPad} ${styles.infoCardPad}`}>
                <div className={styles.headerBlock}>
                  <div className={styles.titleRow}>
                    {currentProduct ? (
                      <Badge variant="secondary" className={styles.conditionBadge}>
                        {currentProduct.condition === "nuevo"
                          ? "Nuevo"
                          : currentProduct.condition === "reacondicionado"
                            ? "Reacondicionado"
                            : "Usado"}
                      </Badge>
                    ) : null}
                  </div>
                  <h1 className={styles.title}>{currentProduct?.name}</h1>
                  {showBrandLine ? (
                    <p className={styles.brandLine}>Marca: {currentProduct?.brand}</p>
                  ) : null}
                  <p className={styles.price}>
                    {hasValidPrice && currentProduct ? (
                      <MoneyAmount
                        value={currentProduct.priceArs}
                        currencyClassName={styles.priceCurrency}
                      />
                    ) : (
                      "Sin precio disponible"
                    )}
                  </p>
                  {accountActionFeedback ? (
                    <p className={styles.favoriteFeedback}>{accountActionFeedback}</p>
                  ) : null}
                </div>

                {colorOptions.length > 1 ? (
                  <div className={styles.selectorBlock}>
                    <p className={styles.selectorLabel}>Color</p>
                    <ColorSwatchSelector
                      ariaLabel="Elegí color"
                      size="lg"
                      appearance="detail"
                      className={styles.colorRail}
                      value={selectedColor}
                      options={colorOptions
                        .map((variant) => variant.color?.trim())
                        .filter((color): color is string => Boolean(color))
                        .map((color) => ({
                          value: color,
                          label: color,
                        }))}
                      onChange={handleColorSelect}
                    />
                  </div>
                ) : null}

                {sizeOptions.length > 1 ? (
                  <div className={styles.selectorBlock}>
                    <p className={styles.selectorLabel}>Talle</p>
                    <div className={styles.sizeGrid} role="group" aria-label="Elegí talle">
                      {sizeOptions.map((size) => {
                        const isActive = selectedSize?.toLowerCase() === size.toLowerCase();
                        return (
                          <button
                            key={size}
                            type="button"
                            className={`${styles.sizeChip} ${isActive ? styles.sizeChipActive : ""}`}
                            onClick={() => handleSizeSelect(size)}
                            aria-pressed={isActive}
                          >
                            {size}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {hasStockData && inStock ? (
                  <p className={`${styles.inCartInfo} ${styles.stockInfo}`}>
                    {stockCopy?.kind === "last" ? (
                      <strong>{stockCopy.text}</strong>
                    ) : stockCopy ? (
                      <span className={styles.stockBlock}>
                        <strong className={styles.stockTitle}>Stock disponible</strong>
                        <span className={styles.stockQty}>{stockCopy.text}</span>
                      </span>
                    ) : null}
                  </p>
                ) : hasStockData ? (
                  <p className={styles.inCartInfo}>
                    <strong>Sin stock temporalmente.</strong>
                  </p>
                ) : null}

                <div className={styles.quantityRow}>
                  <QuantityControl
                    value={qty}
                    max={hasStockData ? Math.min(99, Math.max(1, stockAvailable)) : 99}
                    disabled={ctaDisabled}
                    onChange={setQty}
                  />
                </div>

                <div className={styles.ctaStack}>
                  <Button
                    size="lg"
                    className={styles.fullButton}
                    onClick={handleBuyNow}
                    disabled={ctaDisabled}
                  >
                    Comprar ahora
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className={`${styles.fullButton} ${styles.addToCartButton}`}
                    onClick={handleAddToCart}
                    disabled={ctaDisabled}
                  >
                    <ShoppingCart size={18} />
                    Agregar al carrito
                  </Button>
                </div>

                <div className={styles.trustList}>
                  <div className={styles.trustItem}>
                    <span className={styles.trustIcon}>
                      <Truck size={16} />
                    </span>
                    Envíos a todo el país.
                  </div>
                  <div className={styles.trustItem}>
                    <span className={styles.trustIcon}>
                      <ShieldCheck size={16} />
                    </span>
                    Compra protegida y soporte.
                  </div>
                  <div className={styles.trustItem}>
                    <span className={styles.trustIcon}>
                      <CheckCircle2 size={16} />
                    </span>
                    Garantía de fabricante.
                  </div>
                </div>

                <div className={styles.listLinkRow}>
                  <button
                    type="button"
                    className={styles.addToListLink}
                    onClick={() => void handleOpenListsModal()}
                    disabled={!currentProduct?.id || !customerHydrated || listsModalLoading}
                  >
                    <ListPlus size={16} />
                    Agregar a una lista
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      {hasCharacteristics || hasDescription ? (
        <Card>
          <CardContent className={styles.descriptionSection}>
            {hasCharacteristics ? (
              <div className={styles.descriptionBlock}>
                <div className={styles.characteristicsGrid}>
                  {characteristicSections.map((section) => (
                    <section key={section.key} className={styles.characteristicsSection}>
                      <h3 className={styles.characteristicsSectionTitle}>{section.label}</h3>
                      <div className={styles.characteristicsTable}>
                        {section.items.map((item) => (
                          <div key={item.id} className={styles.characteristicsRow}>
                            <span className={styles.characteristicsKey}>{item.label}</span>
                            <span className={styles.characteristicsValue}>
                              {formatCharacteristicValue(item)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
            {hasCharacteristics && hasDescription ? (
              <hr className={styles.descriptionDivider} aria-hidden />
            ) : null}
            {hasDescription ? (
              <div className={styles.descriptionBlock}>
                <h2 className={styles.descriptionTitle}>Descripcion</h2>
                <p className={styles.descriptionBody}>{description}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className={styles.questionsSection} aria-labelledby="preguntas_respuestas_titulo">
        <Card>
          <CardContent className={styles.questionsBody}>
            <h2 id="preguntas_respuestas_titulo" className={styles.questionsTitle}>
              Preguntas y respuestas
            </h2>

            <form className={styles.questionsFormRow} onSubmit={handleQuestionSubmit}>
              <Input
                value={questionDraft}
                onChange={(event) =>
                  setQuestionDraft(clampProductQuestionDraft(event.target.value))
                }
                placeholder="Escribe tu pregunta"
                className={styles.questionsInput}
                disabled={questionSending}
                maxLength={PRODUCT_QUESTION_MAX_CHARS}
              />
              <Button
                type="submit"
                className={styles.questionsSubmit}
                disabled={questionSending}
              >
                {questionSending ? "Enviando..." : "Preguntar"}
              </Button>
            </form>

            {questionFormError ? (
              <p className={`${styles.questionsFeedback} ${styles.questionsFeedbackError}`}>
                {questionFormError}
              </p>
            ) : questionFormMessage ? (
              <p className={`${styles.questionsFeedback} ${styles.questionsFeedbackOk}`}>
                {questionFormMessage}
              </p>
            ) : null}

            {hasQuestionsForModalResolved ? (
              <div className={styles.questionsAllRow}>
                <button
                  type="button"
                  className={styles.questionsAllLink}
                  onClick={() => setQuestionsModalOpen(true)}
                >
                  Ver todas las preguntas
                </button>
              </div>
            ) : null}

            {showQuestionsError ? (
              <p className={`${styles.questionsFeedback} ${styles.questionsFeedbackError}`}>
                {previewProductQuestionsError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Dialog open={questionsModalOpen} onOpenChange={setQuestionsModalOpen}>
        <DialogContent className={styles.questionsDialog}>
          <DialogHeader className={styles.questionsDialogHeader}>
            <DialogTitle>Preguntas y respuestas</DialogTitle>
          </DialogHeader>

          {allProductQuestionsError ? (
            <p className={`${styles.questionsFeedback} ${styles.questionsFeedbackError}`}>
              {allProductQuestionsError}
            </p>
          ) : allProductQuestionsLoading ? (
            <p className={styles.questionsMuted}>Cargando preguntas...</p>
          ) : allProductQuestions.length > 0 ? (
            <div className={styles.questionsDialogList}>
              {allProductQuestions.map((question) => {
                const hasAnswer =
                  question.status === "answered" && question.answer.trim().length > 0;
                const answerDate = hasAnswer
                  ? formatQuestionShortDate(question.answeredAt ?? question.createdAt)
                  : "";

                return (
                  <article key={question.id} className={styles.questionsDialogItem}>
                    <p className={styles.questionsDialogQuestion}>{question.question}</p>
                    {hasAnswer ? (
                      <p className={styles.questionsDialogAnswer}>
                        {question.answer}
                        {answerDate ? (
                          <span className={styles.questionsDialogDate}>
                            {answerDate}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={listsModalOpen} onOpenChange={handleListsDialogOpenChange}>
        <DialogContent className={styles.addToListDialog}>
          <DialogHeader className={styles.addToListHeader}>
            <DialogTitle>
              {listsModalMode === "create"
                ? "Crear lista de productos"
                : "Agregar a una lista"}
            </DialogTitle>
          </DialogHeader>

          <div className={styles.addToListDialogBody}>
            {listsModalLoading ? null : listsModalMode === "create" ? (
              <div className={styles.addToListCreateModePanel}>
                <Input
                  value={createListName}
                  onChange={(event) => setCreateListName(event.target.value)}
                  placeholder="Nombre de la lista"
                  maxLength={80}
                  disabled={createListSaving || listsModalSaving}
                  autoFocus
                />

                {createListError ? (
                  <p className={styles.addToListError}>{createListError}</p>
                ) : null}

                <div className={styles.addToListCreateActions}>
                  <Button
                    type="button"
                    onClick={() => void handleCreateListFromModal()}
                    disabled={createListSaving || listsModalSaving}
                  >
                    {createListSaving ? "Creando..." : "Crear lista"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.addToListRows}>
                  <button
                    type="button"
                    className={`${styles.addToListRow} ${styles.addToListCreateItem}`}
                    onClick={handleOpenCreateListDialog}
                    disabled={listsModalSaving || createListSaving}
                  >
                    <span className={styles.addToListRowMain}>
                      <span
                        className={`${styles.addToListMedia} ${styles.addToListMediaPlus}`}
                        aria-hidden
                      >
                        <Plus size={18} />
                      </span>
                      <span className={styles.addToListText}>
                        <span className={styles.addToListRowLabel}>
                          Crear nueva lista
                        </span>
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.addToListRow}
                    onClick={() => setListsModalFavorite((current) => !current)}
                    disabled={listsModalSaving || createListSaving}
                  >
                    <span className={styles.addToListRowMain}>
                      <span
                        className={`${styles.addToListMedia} ${styles.addToListMediaHeart}`}
                        aria-hidden
                      >
                        <Heart size={18} fill="currentColor" />
                      </span>
                      <span className={styles.addToListText}>
                        <span className={styles.addToListRowLabel}>Mis favoritos</span>
                        <span className={styles.addToListRowHint}>Predeterminada</span>
                      </span>
                    </span>
                    <Checkbox
                      checked={listsModalFavorite}
                      onCheckedChange={(checked) => setListsModalFavorite(checked)}
                      onClick={(event) => event.stopPropagation()}
                      size="lg"
                      className={styles.addToListCheckbox}
                      disabled={listsModalSaving || createListSaving}
                      aria-label="Seleccionar Mis favoritos"
                    />
                  </button>

                  {listsModalLists.map((list) => {
                    const selected = listsModalListIds.includes(list.id);
                    const previewUrl = toStoreMediaProxyUrl(
                      listsModalPreviewById[list.id]
                    );
                    return (
                      <button
                        key={list.id}
                        type="button"
                        className={styles.addToListRow}
                        onClick={() => toggleListsModalList(list.id)}
                        disabled={listsModalSaving || createListSaving}
                      >
                        <span className={styles.addToListRowMain}>
                          <span className={styles.addToListMedia} aria-hidden>
                            {previewUrl ? (
                              <Image
                                src={previewUrl}
                                alt=""
                                width={40}
                                height={40}
                                className={styles.addToListMediaImage}
                              />
                            ) : (
                              <ListPlus
                                size={18}
                                className={styles.addToListMediaPlaceholder}
                              />
                            )}
                          </span>
                          <span className={styles.addToListText}>
                            <span className={styles.addToListRowLabel}>{list.name}</span>
                          </span>
                        </span>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) =>
                            toggleListsModalList(list.id, checked)
                          }
                          onClick={(event) => event.stopPropagation()}
                          size="lg"
                          className={styles.addToListCheckbox}
                          disabled={listsModalSaving || createListSaving}
                          aria-label={`Seleccionar lista ${list.name}`}
                        />
                      </button>
                    );
                  })}
                </div>

              </>
            )}

            {listsModalMode === "select" ? (
              <div className={styles.addToListActions}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoToMyLists}
                  disabled={listsModalSaving || createListSaving}
                >
                  Ir a mis listas
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleConfirmListsModal()}
                  disabled={listsModalLoading || listsModalSaving || createListSaving}
                >
                  {listsModalSaving ? "Guardando..." : "Confirmar"}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {!relatedLoading && !relatedError && related.length > 0 ? (
        <section className={styles.relatedSection}>
          <div className={styles.relatedHeader}>
            <h2 className={styles.relatedTitle}>También te puede interesar</h2>
          </div>

          <HorizontalProductsRail ariaLabel="Productos recomendados">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </HorizontalProductsRail>
        </section>
      ) : null}
    </div>
  );
}

