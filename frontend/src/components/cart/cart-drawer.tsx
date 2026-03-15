"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";

import { useCart } from "@/lib/store-cart";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyAmount } from "@/components/ui/money-amount";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import styles from "./cart-drawer.module.css";

export function CartDrawer() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const open = openedPath !== null && openedPath === currentPath;
  const { items, itemCount, subtotalArs, setItemQty, removeItem, clear } =
    useCart();

  const itemsLabel = useMemo(() => {
    if (itemCount === 0) return "Vacío";
    return `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  }, [itemCount]);

  const closeDrawer = () => setOpenedPath(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpenedPath(currentPath);
      return;
    }
    closeDrawer();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`Carrito: ${itemsLabel}`}
          title="Carrito"
        >
          <span className={styles.triggerIcon}>
            <ShoppingCart size={18} />
          </span>
          {itemCount > 0 ? (
            <span className={styles.count} aria-label={itemsLabel}>
              {itemCount}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent className={styles.sheet}>
        <SheetHeader>
          <SheetTitle>Carrito</SheetTitle>
            {itemCount > 0 && (
              <SheetDescription>
                {itemsLabel} · Subtotal <MoneyAmount value={subtotalArs} />
              </SheetDescription>
            )}
        </SheetHeader>

        <div className={styles.body}>
          {items.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Todavía no agregaste productos.</p>
              <p className={styles.emptyText}>
                Suma repuestos al carrito para ver el flujo de compra completo.
              </p>
              <div className={styles.emptyActions}>
                <Button asChild>
                  <Link href="/productos" onClick={closeDrawer}>
                    Ver catálogo
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.list}>
                {items.map((it, idx) => (
                  <CartLineItem
                    key={it.id}
                    item={it}
                    index={idx}
                    variant="compact"
                    onChangeQty={(qty) => setItemQty(it.id, qty)}
                    onRemove={() => removeItem(it.id)}
                  />
                ))}
              </div>

              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span className={styles.muted}>Subtotal</span>
                  <strong>
                    <MoneyAmount value={subtotalArs} />
                  </strong>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.muted}>Envío</span>
                  <Badge variant="secondary">Se calcula al finalizar la compra</Badge>
                </div>
                <Separator />
                <div className={styles.summaryRow}>
                  <span>Total</span>
                  <strong>
                    <MoneyAmount value={subtotalArs} />
                  </strong>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className={styles.footer}>
          {items.length ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={clear}
                className={styles.footerGrow}
              >
                Vaciar
              </Button>

              <Button asChild variant="outline" className={styles.footerGrow}>
                <Link href="/carrito" onClick={closeDrawer}>
                  Ver carrito
                </Link>
              </Button>

              <Button asChild className={styles.footerGrow}>
                <Link href="/checkout" onClick={closeDrawer}>
                  Finalizar compra
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild className={styles.footerGrow}>
              <Link href="/productos" onClick={closeDrawer}>
                Ir al catálogo
              </Link>
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
