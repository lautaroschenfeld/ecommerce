"use client";

import { useEffect, useMemo } from "react";

import { fetchJson } from "@/lib/store-client";
import { useCart } from "@/lib/store-cart";
import { useCustomerSession } from "@/lib/customer-auth";

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

export function CustomerCartSync() {
  const { hydrated, isLoggedIn } = useCustomerSession();
  const { items } = useCart();

  const payload = useMemo(() => {
    return JSON.stringify(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        priceArs: item.priceArs,
        imageUrl: item.imageUrl,
        imageUrls: item.imageUrls,
        qty: item.qty,
      }))
    );
  }, [items]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;

    const key = getPublishableKey();
    if (!key) return;

    const timeout = window.setTimeout(() => {
      void fetchJson("/store/catalog/cart", {
        method: "PUT",
        credentials: "include",
        headers: {
          "x-publishable-api-key": key,
        },
        body: JSON.stringify({
          items,
        }),
      }).catch(() => {
        // non-blocking sync
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [hydrated, isLoggedIn, payload, items]);

  return null;
}


