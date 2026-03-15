"use client";

import Link from "next/link";
import { Clock3, Trash2 } from "lucide-react";

import {
  clearCustomerProductHistory,
  removeCustomerProductHistoryItem,
  useCustomerProductHistory,
} from "@/lib/customer-product-history";
import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyAmount } from "@/components/ui/money-amount";
import styles from "./customer-account-history-page.module.css";

function formatViewedAt(value: number) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function customerHistoryKey(input: { id: string; email: string }) {
  return input.id.trim() || input.email.trim().toLowerCase();
}

function HistoryContent({ customer }: { customer: { id: string; email: string } }) {
  const historyKey = customerHistoryKey(customer);
  const items = useCustomerProductHistory(historyKey);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className={styles.empty}>
          <p className={styles.emptyTitle}>No hay historial todavía.</p>
          <p className={styles.emptyText}>
            Cuando visites productos, se van a guardar acá para volver rápido.
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
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          onClick={() => clearCustomerProductHistory(historyKey)}
        >
          <Trash2 size={16} />
          Limpiar historial
        </Button>
      </div>

      {items.map((item) => (
        <article key={item.productId} className={styles.row}>
          <Link href={item.path} className={styles.thumbLink} aria-label={`Ver ${item.name}`}>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.name}
                className={styles.thumb}
                width={120}
                height={120}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : (
              <div className={styles.thumbFallback} aria-hidden />
            )}
          </Link>

          <div className={styles.main}>
            <Link href={item.path} className={styles.nameLink}>
              {item.name}
            </Link>
            <p className={styles.meta}>
              {item.brand} - {item.category}
            </p>
            <p className={styles.price}>
              <MoneyAmount value={item.priceArs} />
            </p>
            <p className={styles.viewedAt}>
              <Clock3 size={14} />
              Visto el {formatViewedAt(item.viewedAt)}
            </p>
          </div>

          <div className={styles.side}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => removeCustomerProductHistoryItem(historyKey, item.productId)}
            >
              Quitar
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CustomerAccountHistoryPage() {
  return (
    <CustomerAccountLayout
      tab="history"
      title="Historial"
      subtitle="Productos visitados recientemente en esta cuenta."
    >
      {({ customer }) => (
        <HistoryContent customer={{ id: customer.id, email: customer.email }} />
      )}
    </CustomerAccountLayout>
  );
}
