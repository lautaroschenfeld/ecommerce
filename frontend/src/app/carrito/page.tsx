import type { Metadata } from "next";

import { CartPage } from "@/components/cart/cart-page";

export const metadata: Metadata = {
  title: "Carrito",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CarritoPage() {
  return <CartPage />;
}

