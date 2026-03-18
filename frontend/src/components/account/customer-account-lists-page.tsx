"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Battery,
  Bike,
  Bolt,
  ChevronLeft,
  CircleDot,
  Disc3,
  Droplet,
  Filter,
  Fuel,
  Heart,
  Layers,
  Lightbulb,
  ListPlus,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  Shield,
  Shirt,
  Sparkles,
  Gauge,
  Wrench,
} from "lucide-react";

import type { Product } from "@/lib/product";
import type { Category } from "@/lib/catalog";
import { buildProductPath } from "@/lib/product-path";
import { useStoreFavorites } from "@/lib/store-favorites";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import {
  fetchStoreProductListSelection,
  saveStoreProductListSelection,
  type StoreProductListItem,
  useStoreAccountListDetail,
  useStoreAccountLists,
} from "@/lib/store-lists";

import { EntityActionsMenu } from "@/components/admin/products-admin-entity-actions-menu";
import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyAmount } from "@/components/ui/money-amount";
import styles from "./customer-account-lists-page.module.css";

type ListsTab = "favoritos" | "listas";
type ListsModalMode = "select" | "create";

type OpenSelectionModalHandler = (product: Product) => void;

type FavoritesPanelProps = {
  favorites: ReturnType<typeof useStoreFavorites>;
  onOpenSelectionModal: OpenSelectionModalHandler;
  selectionBusyProductId: string | null;
};

type ListsPanelProps = {
  lists: ReturnType<typeof useStoreAccountLists>;
  requestedListId: string | null;
  onOpenSelectionModal: OpenSelectionModalHandler;
  selectionBusyProductId: string | null;
  refreshToken: number;
};

function normalizeCategoryKey(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderCategoryIcon(category: Category) {
  const key = normalizeCategoryKey(String(category || ""));
  switch (key) {
    case "motor":
      return <Gauge size={24} />;
    case "transmision":
      return <Disc3 size={24} />;
    case "lubricantes":
      return <Droplet size={24} />;
    case "frenos":
      return <Shield size={24} />;
    case "electricidad":
      return <PlugZap size={24} />;
    case "ruedas":
      return <Bike size={24} />;
    case "accesorios":
      return <Sparkles size={24} />;
    case "indumentaria":
      return <Shirt size={24} />;
    case "filtros":
      return <Filter size={24} />;
    case "baterias":
      return <Battery size={24} />;
    case "iluminacion":
      return <Lightbulb size={24} />;
    case "juntas":
      return <Layers size={24} />;
    case "carburacion":
      return <Fuel size={24} />;
    case "embrague":
      return <Disc3 size={24} />;
    case "suspension":
      return <Wrench size={24} />;
    case "rodamientos":
      return <CircleDot size={24} />;
    case "tornilleria":
      return <Bolt size={24} />;
    default:
      return <Wrench size={24} />;
  }
}

function normalizeTab(raw: string | null | undefined): ListsTab {
  if (String(raw || "").trim().toLowerCase() === "listas") return "listas";
  return "favoritos";
}

function normalizeListId(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  return value || null;
}

function normalizeSearchText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function resolveProductImage(product: Product) {
  const fromGallery = (product.images ?? [])
    .map((entry) => toStoreMediaProxyUrl(entry.trim()))
    .find(Boolean);
  if (fromGallery) return fromGallery;
  return toStoreMediaProxyUrl(product.imageUrl?.trim() || "");
}

type AccountProductRowProps = {
  product: Product;
  removing: boolean;
  onAddToList: () => void;
  addToListBusy?: boolean;
  onRemove: () => void;
  removeLabel: string;
  removingLabel: string;
};

function AccountProductRow({
  product,
  removing,
  onAddToList,
  addToListBusy = false,
  onRemove,
  removeLabel,
  removingLabel,
}: AccountProductRowProps) {
  const detailHref = buildProductPath(product.id, product.name);
  const imageUrl = resolveProductImage(product);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasPrice = Number.isFinite(product.priceArs) && product.priceArs > 0;
  const categoryIcon = renderCategoryIcon(product.category);
  const normalizedName = normalizeSearchText(product.name || "");
  const normalizedBrand = normalizeSearchText(product.brand || "");
  const showBrandLine = Boolean(
    normalizedBrand && (!normalizedName || !normalizedName.includes(normalizedBrand))
  );
  const showImage = Boolean(imageUrl && failedImageSrc !== imageUrl);

  return (
    <article className={styles.productRow}>
      <Link href={detailHref} className={styles.productRowMedia} aria-label={`Ver ${product.name}`}>
        {showImage ? (
          <Image
            src={imageUrl}
            alt={product.name}
            width={220}
            height={220}
            className={styles.productRowImage}
            onError={() => setFailedImageSrc(imageUrl)}
            unoptimized
          />
        ) : (
          <span className={styles.productRowPlaceholder} aria-hidden>
            {categoryIcon}
          </span>
        )}
      </Link>

      <div className={styles.productRowInfo}>
        <Link href={detailHref} className={styles.productRowTitle}>
          {product.name}
        </Link>
        {showBrandLine ? <p className={styles.productRowMeta}>{product.brand}</p> : null}
        <p className={styles.productRowPrice}>
          {hasPrice ? <MoneyAmount value={product.priceArs} /> : "Sin precio"}
        </p>

        <div className={styles.productRowActions}>
          <EntityActionsMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            busy={removing || addToListBusy}
            triggerClassName={styles.productRowKebabTrigger}
            onEdit={onAddToList}
            editLabel="Agregar a lista"
            onDelete={onRemove}
            deleteLabel={removing ? removingLabel : removeLabel}
            showAddVariant={false}
            showDuplicate={false}
          />
          {removing ? <Loader2 size={14} className={styles.spin} aria-hidden /> : null}
        </div>
      </div>
    </article>
  );
}

function FavoritesPanel({
  favorites,
  onOpenSelectionModal,
  selectionBusyProductId,
}: FavoritesPanelProps) {
  const {
    products,
    count,
    loading,
    savingProductId,
    error,
    refetch,
    removeFavorite,
  } = favorites;

  if (loading && !error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>Cargando tus favoritos...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>{error}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            <RefreshCw size={16} />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (count === 0) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <span className={styles.emptyIcon} aria-hidden>
            <Heart size={36} />
          </span>
          <p className={styles.stateTitle}>Aun no tenes productos favoritos</p>
          <p className={styles.stateMessage}>
            Agregalos desde el boton Agregar a una lista de la pagina de producto.
          </p>
          <Button asChild>
            <Link href="/productos">Explorar productos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.productList}>
        {products.map((product) => (
          <AccountProductRow
            key={product.id}
            product={product}
            removing={savingProductId === product.id}
            onAddToList={() => onOpenSelectionModal(product)}
            addToListBusy={selectionBusyProductId === product.id}
            onRemove={() => void removeFavorite(product.id)}
            removeLabel="Eliminar"
            removingLabel="Eliminando..."
          />
        ))}
      </div>
    </div>
  );
}

function ListsPanel({
  lists,
  requestedListId,
  onOpenSelectionModal,
  selectionBusyProductId,
  refreshToken,
}: ListsPanelProps) {
  const [selectedListId, setSelectedListId] = useState<string | null>(
    requestedListId
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailSavingProductId, setDetailSavingProductId] = useState<string | null>(null);

  const listDetail = useStoreAccountListDetail(selectedListId || "", {
    skip: !selectedListId,
  });
  const refetchSelectedListDetail = listDetail.refetch;

  useEffect(() => {
    setSelectedListId(requestedListId);
  }, [requestedListId]);

  useEffect(() => {
    if (!selectedListId) return;
    void refetchSelectedListDetail();
  }, [refreshToken, selectedListId, refetchSelectedListDetail]);

  const handleRemoveFromSelectedList = async (productId: string) => {
    if (!selectedListId) return;

    setDetailSavingProductId(productId);
    try {
      const selection = await fetchStoreProductListSelection(productId);
      const nextListIds = selection.listIds.filter((listId) => listId !== selectedListId);
      await saveStoreProductListSelection(productId, {
        favorite: selection.favorite,
        listIds: nextListIds,
      });

      const previousCount = listDetail.detail?.count ?? 0;
      lists.updateListItemCount(selectedListId, Math.max(0, previousCount - 1));
      await listDetail.refetch();
    } catch {
      // Keep UI stable if the action fails; the user can retry.
    } finally {
      setDetailSavingProductId((current) => (current === productId ? null : current));
    }
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) {
      setCreateError("Escribe un nombre para la lista.");
      return;
    }

    setCreateError(null);
    try {
      const created = await lists.createList(name);
      setNewListName("");
      setCreateOpen(false);
      setSelectedListId(created.id);
    } catch {
      setCreateError("No pudimos crear la lista.");
    }
  };

  if (selectedListId) {
    if (listDetail.loading && !listDetail.error) {
      return (
        <Card>
          <CardContent className={styles.stateCard}>
            <p className={styles.stateMessage}>Cargando la lista...</p>
          </CardContent>
        </Card>
      );
    }

    if (listDetail.error || !listDetail.detail?.list) {
      return (
        <Card>
          <CardContent className={styles.stateCard}>
            <p className={styles.stateMessage}>
              {listDetail.error || "No pudimos cargar esta lista."}
            </p>
            <div className={styles.inlineActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void listDetail.refetch()}
              >
                Reintentar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedListId(null)}
              >
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    const detail = listDetail.detail;
    const detailList = detail?.list;
    if (!detailList) return null;

    return (
      <div className={styles.stack}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => setSelectedListId(null)}
        >
          <ChevronLeft size={16} />
          Volver a listas
        </button>

        <div className={styles.detailHeader}>
          <h3 className={styles.detailTitle}>{detailList.name}</h3>
          <p className={styles.sectionMuted}>
            {detail.count} producto{detail.count === 1 ? "" : "s"}
          </p>
        </div>

        {detail.products.length === 0 ? (
          <Card>
            <CardContent className={styles.stateCard}>
              <p className={styles.stateMessage}>
                Esta lista todavia no tiene productos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className={styles.productList}>
            {detail.products.map((product) => (
              <AccountProductRow
                key={product.id}
                product={product}
                removing={detailSavingProductId === product.id}
                onAddToList={() => onOpenSelectionModal(product)}
                addToListBusy={selectionBusyProductId === product.id}
                onRemove={() => void handleRemoveFromSelectedList(product.id)}
                removeLabel="Eliminar"
                removingLabel="Eliminando..."
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (lists.loading && !lists.error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>Cargando tus listas...</p>
        </CardContent>
      </Card>
    );
  }

  if (lists.error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>{lists.error}</p>
          <Button type="button" variant="outline" onClick={() => void lists.refetch()}>
            <RefreshCw size={16} />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      {lists.lists.length === 0 ? (
        <Card>
          <CardContent className={styles.stateCard}>
            <span className={styles.emptyIcon} aria-hidden>
              <ListPlus size={34} />
            </span>
            <p className={styles.stateMessage}>Todavia no creaste listas.</p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Crear lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={styles.listCardsGrid}>
          {lists.lists.map((list) => {
            const hasPreview = Boolean(list.previewImageUrl);

            return (
              <button
                key={list.id}
                type="button"
                className={styles.listCard}
                onClick={() => setSelectedListId(list.id)}
              >
                <div className={styles.listCardImageWrap}>
                  {hasPreview && list.previewImageUrl ? (
                    <Image
                      src={list.previewImageUrl}
                      alt=""
                      width={520}
                      height={300}
                      className={styles.listCardImage}
                    />
                  ) : (
                    <span className={styles.listCardPlaceholder} aria-hidden>
                      <ListPlus size={28} />
                    </span>
                  )}
                </div>
                <div className={styles.listCardBody}>
                  <strong className={styles.listCardTitle}>{list.name}</strong>
                  <span className={styles.listCardType}>Lista de productos</span>
                  <span className={styles.listCardCount}>
                    {list.itemCount} producto{list.itemCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={styles.createDialog}>
          <DialogHeader>
            <DialogTitle>Crear nueva lista</DialogTitle>
          </DialogHeader>
          <div className={styles.createDialogBody}>
            <Input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="Nombre de la lista"
              maxLength={80}
            />
            {createError ? <p className={styles.formError}>{createError}</p> : null}
            <div className={styles.dialogActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={lists.creating}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateList()}
                disabled={lists.creating}
              >
                {lists.creating ? "Creando..." : "Crear lista"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListsContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ListsTab>(() =>
    normalizeTab(searchParams.get("tab"))
  );
  const requestedListId = normalizeListId(searchParams.get("list"));
  const favorites = useStoreFavorites();
  const lists = useStoreAccountLists();
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionProduct, setSelectionProduct] = useState<Product | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectionFavorite, setSelectionFavorite] = useState(false);
  const [selectionListIds, setSelectionListIds] = useState<string[]>([]);
  const [selectionLists, setSelectionLists] = useState<StoreProductListItem[]>([]);
  const [selectionPreviewById, setSelectionPreviewById] = useState<
    Record<string, string>
  >({});
  const [selectionMode, setSelectionMode] = useState<ListsModalMode>("select");
  const [createSelectionName, setCreateSelectionName] = useState("");
  const [createSelectionSaving, setCreateSelectionSaving] = useState(false);
  const [createSelectionError, setCreateSelectionError] = useState<string | null>(null);
  const [selectionRefreshToken, setSelectionRefreshToken] = useState(0);

  useEffect(() => {
    setTab(normalizeTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (requestedListId) setTab("listas");
  }, [requestedListId]);

  const selectionBusyProductId =
    selectionProduct && (selectionLoading || selectionSaving || createSelectionSaving)
      ? selectionProduct.id
      : null;

  const refreshAllListData = async () => {
    await Promise.all([favorites.refetch(), lists.refetch()]);
    setSelectionRefreshToken((current) => current + 1);
  };

  const loadSelectionForProduct = async (product: Product) => {
    setSelectionLoading(true);
    setSelectionError(null);
    try {
      const selection = await fetchStoreProductListSelection(product.id);
      const normalizedLists = selection.lists.filter(
        (item) => item.id.trim() && item.name.trim()
      );
      const allowedIds = new Set(normalizedLists.map((item) => item.id));
      const normalizedSelectedIds = uniqStrings(
        selection.listIds.filter((listId) => allowedIds.has(listId))
      );
      const nextPreviewById: Record<string, string> = {};
      for (const list of lists.lists) {
        const listId = list.id.trim();
        if (!listId) continue;
        const previewUrl = toStoreMediaProxyUrl(list.previewImageUrl);
        if (!previewUrl) continue;
        nextPreviewById[listId] = previewUrl;
      }

      setSelectionFavorite(selection.favorite);
      setSelectionListIds(normalizedSelectedIds);
      setSelectionLists(normalizedLists);
      setSelectionPreviewById(nextPreviewById);
    } catch {
      setSelectionError("No pudimos cargar tus listas.");
      setSelectionFavorite(false);
      setSelectionListIds([]);
      setSelectionLists([]);
      setSelectionPreviewById({});
    } finally {
      setSelectionLoading(false);
    }
  };

  const openSelectionModal = (product: Product) => {
    setSelectionProduct(product);
    setSelectionOpen(true);
    setSelectionLoading(true);
    setSelectionSaving(false);
    setSelectionError(null);
    setSelectionFavorite(false);
    setSelectionListIds([]);
    setSelectionLists([]);
    setSelectionPreviewById({});
    setSelectionMode("select");
    setCreateSelectionName("");
    setCreateSelectionError(null);
    void loadSelectionForProduct(product);
  };

  const toggleSelectionList = (listIdRaw: string, checked?: boolean) => {
    const listId = listIdRaw.trim();
    if (!listId) return;
    setSelectionListIds((current) => {
      const exists = current.includes(listId);
      const shouldSelect = typeof checked === "boolean" ? checked : !exists;
      if (shouldSelect && !exists) return [...current, listId];
      if (!shouldSelect && exists) return current.filter((id) => id !== listId);
      return current;
    });
  };

  const handleCreateSelectionList = async () => {
    if (!selectionProduct) return;
    const name = createSelectionName.trim();
    if (!name) {
      setCreateSelectionError("Escribe un nombre para la lista.");
      return;
    }

    setCreateSelectionSaving(true);
    setCreateSelectionError(null);
    setSelectionError(null);
    try {
      const created = await lists.createList(name);
      const createdPreview = toStoreMediaProxyUrl(created.previewImageUrl);
      const nextListIds = uniqStrings([...selectionListIds, created.id]);
      const saved = await saveStoreProductListSelection(selectionProduct.id, {
        favorite: selectionFavorite,
        listIds: nextListIds,
      });

      const normalizedSavedLists = saved.lists.filter(
        (item) => item.id.trim() && item.name.trim()
      );
      const allowedIds = new Set(normalizedSavedLists.map((item) => item.id));
      const normalizedSavedIds = uniqStrings(
        saved.listIds.filter((listId) => allowedIds.has(listId))
      );

      setSelectionFavorite(saved.favorite);
      setSelectionListIds(normalizedSavedIds);
      setSelectionLists(normalizedSavedLists);
      setSelectionPreviewById((current) => {
        const next: Record<string, string> = {};
        for (const list of normalizedSavedLists) {
          const listId = list.id;
          const existing = current[listId];
          if (existing?.trim()) {
            next[listId] = existing;
            continue;
          }
          const fromCurrentLists = lists.listById.get(listId)?.previewImageUrl;
          const normalizedPreview = toStoreMediaProxyUrl(fromCurrentLists);
          if (normalizedPreview) next[listId] = normalizedPreview;
        }
        if (createdPreview) {
          next[created.id] = createdPreview;
        }
        return next;
      });

      setCreateSelectionName("");
      setSelectionMode("select");
      setSelectionOpen(false);
      await refreshAllListData();
    } catch {
      setCreateSelectionError("No pudimos crear la lista y guardar el producto.");
    } finally {
      setCreateSelectionSaving(false);
    }
  };

  const handleConfirmSelection = async () => {
    if (!selectionProduct) return;
    setSelectionSaving(true);
    setSelectionError(null);
    try {
      const saved = await saveStoreProductListSelection(selectionProduct.id, {
        favorite: selectionFavorite,
        listIds: selectionListIds,
      });
      const normalizedSavedLists = saved.lists.filter(
        (item) => item.id.trim() && item.name.trim()
      );
      const allowedIds = new Set(normalizedSavedLists.map((item) => item.id));
      const normalizedSavedIds = uniqStrings(
        saved.listIds.filter((listId) => allowedIds.has(listId))
      );
      setSelectionFavorite(saved.favorite);
      setSelectionListIds(normalizedSavedIds);
      setSelectionLists(normalizedSavedLists);
      setSelectionPreviewById((current) => {
        const next: Record<string, string> = {};
        for (const list of normalizedSavedLists) {
          const listId = list.id;
          const existing = current[listId];
          if (existing?.trim()) {
            next[listId] = existing;
            continue;
          }
          const fromCurrentLists = lists.listById.get(listId)?.previewImageUrl;
          const normalizedPreview = toStoreMediaProxyUrl(fromCurrentLists);
          if (normalizedPreview) next[listId] = normalizedPreview;
        }
        return next;
      });
      setSelectionMode("select");
      setSelectionOpen(false);
      await refreshAllListData();
    } catch {
      setSelectionError("No pudimos guardar la selección de listas.");
    } finally {
      setSelectionSaving(false);
    }
  };

  const handleSelectionDialogOpenChange = (open: boolean) => {
    if (!open && (selectionSaving || createSelectionSaving)) return;
    setSelectionOpen(open);
    if (open) return;
    setSelectionMode("select");
    setSelectionProduct(null);
    setSelectionLoading(false);
    setSelectionSaving(false);
    setSelectionError(null);
    setCreateSelectionName("");
    setCreateSelectionError(null);
  };

  return (
    <div className={styles.stack}>
      <div className={styles.tabsRow}>
        <button
          type="button"
          className={`${styles.topTab} ${tab === "favoritos" ? styles.topTabActive : ""}`}
          onClick={() => setTab("favoritos")}
        >
          Mis favoritos ({favorites.count})
        </button>
        <button
          type="button"
          className={`${styles.topTab} ${tab === "listas" ? styles.topTabActive : ""}`}
          onClick={() => setTab("listas")}
        >
          Listas ({lists.count})
        </button>
      </div>

      {tab === "favoritos" ? (
        <FavoritesPanel
          favorites={favorites}
          onOpenSelectionModal={openSelectionModal}
          selectionBusyProductId={selectionBusyProductId}
        />
      ) : (
        <ListsPanel
          lists={lists}
          requestedListId={requestedListId}
          onOpenSelectionModal={openSelectionModal}
          selectionBusyProductId={selectionBusyProductId}
          refreshToken={selectionRefreshToken}
        />
      )}

      <Dialog open={selectionOpen} onOpenChange={handleSelectionDialogOpenChange}>
        <DialogContent className={styles.addToListDialog}>
          <DialogHeader>
            <DialogTitle>
              {selectionMode === "create" ? "Crear lista de productos" : "Agregar a una lista"}
            </DialogTitle>
          </DialogHeader>
          <div className={styles.addToListDialogBody}>
            {selectionLoading ? (
              <p className={styles.sectionMuted}>Cargando listas...</p>
            ) : selectionMode === "create" ? (
              <div className={styles.addToListCreateModePanel}>
                <Input
                  value={createSelectionName}
                  onChange={(event) => setCreateSelectionName(event.target.value)}
                  placeholder="Nombre de la lista"
                  maxLength={80}
                  disabled={selectionSaving || createSelectionSaving}
                  autoFocus
                />
                {createSelectionError ? (
                  <p className={styles.formError}>{createSelectionError}</p>
                ) : null}
                <div className={styles.dialogActions}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectionMode("select")}
                    disabled={selectionSaving || createSelectionSaving}
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleCreateSelectionList()}
                    disabled={selectionSaving || createSelectionSaving}
                  >
                    {createSelectionSaving ? "Creando..." : "Crear lista"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.addToListRows}>
                  <button
                    type="button"
                    className={`${styles.addToListRow} ${styles.addToListCreateItem}`}
                    onClick={() => {
                      setSelectionMode("create");
                      setCreateSelectionName("");
                      setCreateSelectionError(null);
                    }}
                    disabled={selectionSaving || createSelectionSaving}
                  >
                    <span className={styles.addToListRowMain}>
                      <span
                        className={`${styles.addToListMedia} ${styles.addToListMediaPlus}`}
                        aria-hidden
                      >
                        <Plus size={18} />
                      </span>
                      <span className={styles.addToListText}>
                        <span className={styles.addToListRowLabel}>Crear nueva lista</span>
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.addToListRow}
                    onClick={() => setSelectionFavorite((current) => !current)}
                    disabled={selectionSaving || createSelectionSaving}
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
                      checked={selectionFavorite}
                      onCheckedChange={(checked) => setSelectionFavorite(checked)}
                      onClick={(event) => event.stopPropagation()}
                      size="lg"
                      className={styles.addToListCheckbox}
                      disabled={selectionSaving || createSelectionSaving}
                      aria-label="Seleccionar Mis favoritos"
                    />
                  </button>

                  {selectionLists.map((list) => {
                    const selected = selectionListIds.includes(list.id);
                    const previewUrl = toStoreMediaProxyUrl(selectionPreviewById[list.id]);
                    return (
                      <button
                        key={list.id}
                        type="button"
                        className={styles.addToListRow}
                        onClick={() => toggleSelectionList(list.id)}
                        disabled={selectionSaving || createSelectionSaving}
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
                          onCheckedChange={(checked) => toggleSelectionList(list.id, checked)}
                          onClick={(event) => event.stopPropagation()}
                          size="lg"
                          className={styles.addToListCheckbox}
                          disabled={selectionSaving || createSelectionSaving}
                          aria-label={`Seleccionar lista ${list.name}`}
                        />
                      </button>
                    );
                  })}
                </div>

                {selectionError ? <p className={styles.formError}>{selectionError}</p> : null}

                <div className={styles.dialogActions}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSelectionDialogOpenChange(false)}
                    disabled={selectionSaving || createSelectionSaving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleConfirmSelection()}
                    disabled={selectionSaving || selectionLoading || createSelectionSaving}
                  >
                    {selectionSaving ? "Guardando..." : "Confirmar"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CustomerAccountListsPage() {
  return (
    <CustomerAccountLayout
      tab="lists"
      title="Mis listas"
      subtitle="Guarda productos en favoritos o en listas personalizadas."
    >
      {() => <ListsContent />}
    </CustomerAccountLayout>
  );
}

