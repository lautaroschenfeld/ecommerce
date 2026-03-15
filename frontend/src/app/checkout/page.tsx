import type { Metadata } from "next";
import { Suspense } from "react";

import { CheckoutPage } from "@/components/cart/checkout-page";

export const metadata: Metadata = {
  title: "Checkout",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutRoutePage() {
  return (
    <Suspense fallback={null}>
      <CheckoutPage />
    </Suspense>
  );
}

