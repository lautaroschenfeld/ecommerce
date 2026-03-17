"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Heart,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import { useStoreFavorites } from "@/lib/store-favorites";
import { useStoreAccountListDetail, useStoreAccountLists } from "@/lib/store-lists";

import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { ProductCard } from "@/components/products/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import styles from "./customer-account-lists-page.module.css";

type ListsTab = "favoritos" | "listas";

type FavoritesPanelProps = {
  favorites: ReturnType<typeof useStoreFavorites>;
};

type ListsPanelProps = {
  lists: ReturnType<typeof useStoreAccountLists>;
  requestedListId: string | null;
};

function normalizeTab(raw: string | null | undefined): ListsTab {
  if (String(raw || "").trim().toLowerCase() === "listas") return "listas";
  return "favoritos";
}

function normalizeListId(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  return value || null;
}

function FavoritesPanel({ favorites }: FavoritesPanelProps) {
  const {
    products,
    count,
    loading,
    savingProductId,
    error,
    refetch,
    removeFavorite,
  } = favorites;

  const unavailableCount = Math.max(0, count - products.length);

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
            Agregalos haciendo click en el corazon de la pagina de producto.
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
      <div className={styles.sectionMetaRow}>
        <p className={styles.sectionMeta}>
          {count} producto{count === 1 ? "" : "s"} en favoritos.
        </p>
        {unavailableCount > 0 ? (
          <p className={styles.sectionMuted}>
            {unavailableCount} ya no esta disponible.
          </p>
        ) : null}
      </div>

      <div className={styles.productGrid}>
        {products.map((product) => {
          const removing = savingProductId === product.id;
          return (
            <article key={product.id} className={styles.productItem}>
              <ProductCard product={product} />
              <div className={styles.productActions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.removeButton}
                  onClick={() => void removeFavorite(product.id)}
                  disabled={removing}
                >
                  {removing ? (
                    <Loader2 size={14} className={styles.spin} />
                  ) : (
                    <Heart size={14} />
                  )}
                  {removing ? "Quitando..." : "Quitar de favoritos"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ListsPanel({ lists, requestedListId }: ListsPanelProps) {
  const [selectedListId, setSelectedListId] = useState<string | null>(
    requestedListId
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const listDetail = useStoreAccountListDetail(selectedListId || "", {
    skip: !selectedListId,
  });

  useEffect(() => {
    setSelectedListId(requestedListId);
  }, [requestedListId]);

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
                Esta lista todavía no tiene productos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className={styles.productGrid}>
            {detail.products.map((product) => (
              <ProductCard key={product.id} product={product} />
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
            <p className={styles.stateMessage}>Todavía no creaste listas.</p>
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

  useEffect(() => {
    setTab(normalizeTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (requestedListId) setTab("listas");
  }, [requestedListId]);

  return (
    <div className={styles.stack}>
      <div className={styles.tabsRow}>
        <button
          type="button"
          className={`${styles.topTab} ${tab === "favoritos" ? styles.topTabActive : ""}`}
          onClick={() => setTab("favoritos")}
        >
          Mis favoritos
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
        <FavoritesPanel favorites={favorites} />
      ) : (
        <ListsPanel lists={lists} requestedListId={requestedListId} />
      )}
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
