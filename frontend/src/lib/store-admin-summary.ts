import { fetchJsonWithAuthRetry as fetchJson } from "./store-client";
import { mapFriendlyError } from "./user-facing-errors";

export type AdminSummaryRangeKey = "today" | "week" | "month" | "year" | "custom";
export type AdminSummaryRangeGranularity = "hour" | "day" | "month";

export type AdminSummaryTrend = number | null;

export type AdminSummaryMetric = {
  value: number;
  trend: AdminSummaryTrend;
};

export type AdminSummaryResponse = {
  range: {
    key: AdminSummaryRangeKey;
    granularity: AdminSummaryRangeGranularity;
    start_date: string;
    end_date: string;
    comparison_label: string | null;
    show_comparisons: boolean;
  };
  chart: {
    points: Array<{
      label: string;
      value: number;
      date: string;
    }>;
  };
  metrics: {
    billing: AdminSummaryMetric;
    net_revenue: AdminSummaryMetric;
    clients: AdminSummaryMetric;
    avg_ticket: AdminSummaryMetric;
  };
  channels: Array<{
    key: string;
    label: string;
    orders: number;
    revenue: number;
    share: number;
    trend: AdminSummaryTrend;
  }>;
  top_products: Array<{
    key: string;
    name: string;
    brand: string | null;
    units: number;
    revenue: number;
    trend: AdminSummaryTrend;
  }>;
  funnel: {
    visits: AdminSummaryMetric;
    cart: AdminSummaryMetric;
    purchases: AdminSummaryMetric;
    conversion: AdminSummaryMetric;
  };
  payment_statuses: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  delivery: {
    average_days: {
      value: number | null;
      trend: AdminSummaryTrend;
    };
    on_time_rate: {
      value: number | null;
      trend: AdminSummaryTrend;
    };
    dispatch_hours: {
      value: number | null;
      trend: AdminSummaryTrend;
    };
    delayed_orders: {
      value: number;
      trend: AdminSummaryTrend;
    };
  };
};

export type GetAdminSummaryInput = {
  range?: AdminSummaryRangeKey;
  from?: string;
  to?: string;
};

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function adminHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return { "x-publishable-api-key": key };
}

function cleanDate(value: string | undefined) {
  if (!value) return "";
  return value.trim();
}

export async function getAdminSummary(
  input: GetAdminSummaryInput = {}
): Promise<AdminSummaryResponse> {
  const range = input.range ?? "month";
  const params = new URLSearchParams();

  if (range !== "month") params.set("r", range);
  if (range === "custom") {
    const from = cleanDate(input.from);
    const to = cleanDate(input.to);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }

  const query = params.toString();
  const path = `/store/catalog/account/admin/summary${query ? `?${query}` : ""}`;

  return await fetchJson<AdminSummaryResponse>(path, {
    method: "GET",
    headers: adminHeaders(),
    credentials: "include",
  });
}

export function mapAdminSummaryError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}
