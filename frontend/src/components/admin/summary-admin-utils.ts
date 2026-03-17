import { formatMoney } from "@/lib/format";
import type {
  AdminSummaryRangeGranularity,
  AdminSummaryRangeKey,
  AdminSummaryTrend,
} from "@/lib/store-admin-summary";

type BillingPoint = {
  label: string;
  value: number;
  date: Date;
};

type ChartPoint = {
  x: number;
  y: number;
  label: string;
};

type MetricCardData = {
  key: string;
  label: string;
  value: string;
  trend: AdminSummaryTrend;
};

type FunnelCardData = {
  key: string;
  label: string;
  value: string;
  trend: AdminSummaryTrend;
};

type DeliveryCardData = {
  key: "dispatch_hours" | "average_days" | "on_time_rate" | "delayed_orders";
  label: string;
  value: string;
  trend: AdminSummaryTrend;
};

const PAYMENT_STATUS_ORDER = ["approved", "pending", "rejected", "refunded"] as const;

const WEEK_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

const CHART_WIDTH = 980;
const CHART_HEIGHT = 360;
const CHART_PADDING = {
  top: 16,
  right: 20,
  bottom: 44,
  left: 58,
};
const CHART_TICKS = 5;
const NEUTRAL_TREND_EPSILON = 0.05;

type TrendTone = "up" | "down" | "neutral";

function asRangeKey(value: string | null): AdminSummaryRangeKey {
  return value === "today" ||
    value === "week" ||
    value === "month" ||
    value === "year" ||
    value === "custom"
    ? value
    : "month";
}

function defaultComparisonLabel(range: AdminSummaryRangeKey) {
  if (range === "today") return "vs ayer";
  if (range === "week") return "vs semana pasada";
  if (range === "year") return "vs año pasado";
  return "vs mes pasado";
}

function defaultGranularity(range: AdminSummaryRangeKey): AdminSummaryRangeGranularity {
  if (range === "today") return "hour";
  if (range === "year") return "month";
  return "day";
}

function parseApiDate(input: string) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function hasTrend(value: AdminSummaryTrend): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getTrendTone(value: number): TrendTone {
  if (Math.abs(value) < NEUTRAL_TREND_EPSILON) return "neutral";
  return value > 0 ? "up" : "down";
}

function formatPercentValue(value: number, decimals: number) {
  const fixed = value.toFixed(decimals);
  const rounded = Number(fixed);
  if (rounded === 0 || rounded === 100) return String(Math.round(rounded));
  return fixed;
}

function formatTrend(value: number) {
  if (getTrendTone(value) === "neutral") return "0%";
  const abs = Math.abs(value);
  return `${value > 0 ? "+" : "-"}${formatPercentValue(abs, 1)}%`;
}

function getDeliveryTrendSemanticTone(
  key: DeliveryCardData["key"],
  value: number
): TrendTone {
  if (Math.abs(value) < NEUTRAL_TREND_EPSILON) return "neutral";
  const higherIsBetter = key === "on_time_rate";
  const favorable = higherIsBetter ? value > 0 : value < 0;
  return favorable ? "up" : "down";
}

function paymentStatusRowToneClass(statusKey: string, stylesMap: Record<string, string>) {
  if (statusKey === "approved") return stylesMap.statusRowSuccess;
  if (statusKey === "pending") return stylesMap.statusRowWarning;
  if (statusKey === "rejected") return stylesMap.statusRowDanger;
  if (statusKey === "refunded") return stylesMap.statusRowOrange;
  return "";
}

function mapSummaryPaymentStatusToOrdersFilter(statusKey: string) {
  const normalized = statusKey.trim().toLowerCase();
  if (normalized === "approved" || normalized === "paid") return "paid";
  if (normalized === "pending") return "pending";
  if (normalized === "rejected" || normalized === "failed") return "failed";
  if (normalized === "refunded") return "refunded";
  return "all";
}

function formatCompactMoney(value: number) {
  const rounded =
    value >= 1_000_000
      ? Math.round(value / 100_000) * 100_000
      : value >= 100_000
        ? Math.round(value / 50_000) * 50_000
        : value >= 10_000
          ? Math.round(value / 10_000) * 10_000
          : Math.round(value);

  if (rounded >= 1_000_000) {
    const million = rounded / 1_000_000;
    const text = million >= 10 ? million.toFixed(0) : million.toFixed(1);
    return `$${text.replace(/\.0$/, "")}M`;
  }

  if (rounded >= 1_000) return `$${Math.round(rounded / 1_000)}k`;
  return formatMoney(rounded);
}

function formatHoverLabel(point: BillingPoint, granularity: AdminSummaryRangeGranularity) {
  const date = point.date;
  if (granularity === "hour") {
    const hour = `${String(date.getHours()).padStart(2, "0")}:00`;
    return `${WEEK_DAYS[date.getDay()]} ${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} - ${hour}`;
  }
  if (granularity === "month") {
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
  return `${WEEK_DAYS[date.getDay()]} ${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function buildSmoothPath(
  points: ChartPoint[],
  bounds?: { minY: number; maxY: number }
) {
  if (!points.length) return "";
  if (points.length === 1) {
    const point = points[0]!;
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const minBound =
    bounds && Number.isFinite(bounds.minY)
      ? Math.min(bounds.minY, bounds.maxY)
      : Number.NEGATIVE_INFINITY;
  const maxBound =
    bounds && Number.isFinite(bounds.maxY)
      ? Math.max(bounds.minY, bounds.maxY)
      : Number.POSITIVE_INFINITY;
  const normalized = points.map((point) => ({
    ...point,
    y: clamp(point.y, minBound, maxBound),
  }));
  if (normalized.length === 2) {
    const [first, second] = normalized;
    return `M ${first!.x.toFixed(2)} ${first!.y.toFixed(2)} L ${second!.x.toFixed(2)} ${second!.y.toFixed(2)}`;
  }

  const segmentWidths: number[] = [];
  const segmentSlopes: number[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const from = normalized[index]!;
    const to = normalized[index + 1]!;
    const width = Math.max(1e-6, to.x - from.x);
    segmentWidths.push(width);
    segmentSlopes.push((to.y - from.y) / width);
  }

  const tangents = new Array<number>(normalized.length).fill(0);
  tangents[0] = segmentSlopes[0]!;
  tangents[normalized.length - 1] = segmentSlopes[segmentSlopes.length - 1]!;

  for (let index = 1; index < normalized.length - 1; index += 1) {
    const prevSlope = segmentSlopes[index - 1]!;
    const nextSlope = segmentSlopes[index]!;
    if (prevSlope === 0 || nextSlope === 0 || prevSlope * nextSlope < 0) {
      tangents[index] = 0;
      continue;
    }

    const prevWidth = segmentWidths[index - 1]!;
    const nextWidth = segmentWidths[index]!;
    const weightPrev = 2 * nextWidth + prevWidth;
    const weightNext = nextWidth + 2 * prevWidth;
    tangents[index] =
      (weightPrev + weightNext) /
      (weightPrev / prevSlope + weightNext / nextSlope);
  }

  const commands = [
    `M ${normalized[0]!.x.toFixed(2)} ${normalized[0]!.y.toFixed(2)}`,
  ];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const from = normalized[index]!;
    const to = normalized[index + 1]!;
    const width = segmentWidths[index]!;

    const cp1x = from.x + width / 3;
    const cp2x = to.x - width / 3;
    const cp1y = clamp(from.y + (tangents[index]! * width) / 3, minBound, maxBound);
    const cp2y = clamp(to.y - (tangents[index + 1]! * width) / 3, minBound, maxBound);

    commands.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
    );
  }

  return commands.join(" ");
}

function pickTickIndexes(length: number, maxTicks: number) {
  if (length <= 0) return [];
  if (length <= maxTicks) return Array.from({ length }, (_, index) => index);

  const step = Math.ceil((length - 1) / (maxTicks - 1));
  const indexes: number[] = [0];

  for (let index = step; index < length - 1; index += step) {
    indexes.push(index);
  }

  indexes.push(length - 1);
  return Array.from(new Set(indexes));
}

function niceStep(input: number) {
  if (!Number.isFinite(input) || input <= 0) return 1;
  const exponent = Math.pow(10, Math.floor(Math.log10(input)));
  const fraction = input / exponent;

  if (fraction <= 1) return exponent;
  if (fraction <= 2) return 2 * exponent;
  if (fraction <= 5) return 5 * exponent;
  return 10 * exponent;
}

export type {
  BillingPoint,
  ChartPoint,
  MetricCardData,
  FunnelCardData,
  DeliveryCardData,
  TrendTone,
};

export {
  PAYMENT_STATUS_ORDER,
  WEEK_DAYS,
  MONTHS,
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_TICKS,
  NEUTRAL_TREND_EPSILON,
  asRangeKey,
  defaultComparisonLabel,
  defaultGranularity,
  parseApiDate,
  hasTrend,
  getTrendTone,
  formatPercentValue,
  formatTrend,
  getDeliveryTrendSemanticTone,
  paymentStatusRowToneClass,
  mapSummaryPaymentStatusToOrdersFilter,
  formatCompactMoney,
  formatHoverLabel,
  buildSmoothPath,
  pickTickIndexes,
  niceStep,
};
