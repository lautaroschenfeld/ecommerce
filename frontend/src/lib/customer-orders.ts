import { formatMoney } from "@/lib/format";

export type CustomerOrderStatus =
  | "delivered"
  | "in_transit"
  | "processing"
  | "ready_pickup";

export type CustomerPaymentStatus = "paid" | "pending";

export type CustomerOrder = {
  id: string;
  createdAt: number;
  status: CustomerOrderStatus;
  paymentStatus: CustomerPaymentStatus;
  totalArs: number;
  itemCount: number;
  trackingCode: string;
};

type OrderTemplate = {
  baseTotalArs: number;
  itemCount: number;
  status: CustomerOrderStatus;
  paymentStatus: CustomerPaymentStatus;
  daysAgo: number;
};

const ORDER_TEMPLATES: OrderTemplate[] = [
  {
    baseTotalArs: 132900,
    itemCount: 3,
    status: "in_transit",
    paymentStatus: "paid",
    daysAgo: 3,
  },
  {
    baseTotalArs: 78200,
    itemCount: 2,
    status: "delivered",
    paymentStatus: "paid",
    daysAgo: 14,
  },
  {
    baseTotalArs: 214500,
    itemCount: 5,
    status: "delivered",
    paymentStatus: "paid",
    daysAgo: 31,
  },
  {
    baseTotalArs: 46800,
    itemCount: 1,
    status: "ready_pickup",
    paymentStatus: "pending",
    daysAgo: 1,
  },
  {
    baseTotalArs: 159300,
    itemCount: 4,
    status: "processing",
    paymentStatus: "paid",
    daysAgo: 7,
  },
  {
    baseTotalArs: 98500,
    itemCount: 2,
    status: "delivered",
    paymentStatus: "paid",
    daysAgo: 52,
  },
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function randomDelta(seed: number, min: number, max: number) {
  const span = Math.max(1, max - min + 1);
  return min + (seed % span);
}

function toTrackingCode(seed: number) {
  const chunk = String(seed % 1000000).padStart(6, "0");
  return `MPA-${chunk}`;
}

export function getCustomerOrders(email: string | undefined | null) {
  const safeEmail = (email ?? "").trim().toLowerCase();
  if (!safeEmail) return [];

  const seed = hashString(safeEmail);
  const count = 4 + (seed % 3); // 4 to 6 orders
  const now = Date.now();

  const orders: CustomerOrder[] = [];
  for (let index = 0; index < count; index += 1) {
    const template = ORDER_TEMPLATES[(seed + index) % ORDER_TEMPLATES.length]!;
    const localSeed = (seed + index * 97) >>> 0;

    const totalVariation = randomDelta(localSeed, -9500, 12000);
    const createdAt =
      now -
      (template.daysAgo + randomDelta(localSeed, 0, 4)) * 24 * 60 * 60 * 1000 -
      randomDelta(localSeed, 0, 18) * 60 * 60 * 1000;

    const month = new Date(createdAt).getUTCMonth() + 1;
    const year = new Date(createdAt).getUTCFullYear();
    const serial = String(1000 + ((localSeed + index * 19) % 9000));
    const orderId = `MP-${year}${String(month).padStart(2, "0")}-${serial}`;

    orders.push({
      id: orderId,
      createdAt,
      status: template.status,
      paymentStatus: template.paymentStatus,
      totalArs: Math.max(10000, template.baseTotalArs + totalVariation),
      itemCount: Math.max(1, template.itemCount + (localSeed % 2)),
      trackingCode: toTrackingCode(localSeed),
    });
  }

  orders.sort((a, b) => b.createdAt - a.createdAt);
  return orders;
}

export function statusLabel(status: CustomerOrderStatus) {
  if (status === "delivered") return "Entregado";
  if (status === "in_transit") return "En camino";
  if (status === "ready_pickup") return "Listo para retiro";
  return "Preparando";
}

export function paymentStatusLabel(status: CustomerPaymentStatus) {
  if (status === "paid") return "Pago acreditado";
  return "Pago pendiente";
}

export function orderSummaryLine(order: CustomerOrder) {
  const itemWord = order.itemCount === 1 ? "item" : "items";
  return `${order.itemCount} ${itemWord} - ${formatMoney(order.totalArs)}`;
}
