"use client";

import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { AdminSummaryResponse } from "@/lib/store-admin-summary";
import { cn } from "@/lib/utils";

import {
  formatTrend,
  getDeliveryTrendSemanticTone,
  getTrendTone,
  hasTrend,
  mapSummaryPaymentStatusToOrdersFilter,
  paymentStatusRowToneClass,
  type DeliveryCardData,
  type FunnelCardData,
  type MetricCardData,
  type TrendTone,
} from "./summary-admin-utils";
import styles from "./summary-admin.module.css";

type ComparableMetricCardData = MetricCardData | FunnelCardData;
type SummaryChannel = AdminSummaryResponse["channels"][number];
type SummaryTopProduct = AdminSummaryResponse["top_products"][number];
type SummaryPaymentStatus = AdminSummaryResponse["payment_statuses"][number];

function TrendArrowIcon({ tone }: { tone: TrendTone }) {
  if (tone === "up") {
    return <TrendingUp size={14} strokeWidth={2.4} className={styles.trendArrowIcon} aria-hidden="true" />;
  }
  if (tone === "down") {
    return <TrendingDown size={14} strokeWidth={2.4} className={styles.trendArrowIcon} aria-hidden="true" />;
  }
  return <Minus size={13} strokeWidth={2.4} className={styles.trendArrowIcon} aria-hidden="true" />;
}

function metricDeltaToneClass(tone: TrendTone) {
  if (tone === "up") return styles.metricDeltaBarUp;
  if (tone === "down") return styles.metricDeltaBarDown;
  return styles.metricDeltaBarNeutral;
}

function salesTrendToneClass(tone: TrendTone) {
  if (tone === "up") return styles.salesTrendUp;
  if (tone === "down") return styles.salesTrendDown;
  return styles.salesTrendNeutral;
}

type SummaryComparisonBadgeProps = {
  label: string;
};

function SummaryComparisonBadge({ label }: SummaryComparisonBadgeProps) {
  return <span className={styles.comparisonBadge}>{label}</span>;
}

type SummaryTrendDeltaBarProps = {
  value: number;
  tone: TrendTone;
  comparisonLabel?: string;
  className?: string;
  directionTone?: TrendTone;
};

function SummaryTrendDeltaBar({
  value,
  tone,
  comparisonLabel,
  className,
  directionTone,
}: SummaryTrendDeltaBarProps) {
  const arrowTone = directionTone ?? getTrendTone(value);
  return (
    <div className={cn(styles.metricDeltaBar, metricDeltaToneClass(tone), className)}>
      <span className={styles.metricDeltaValue}>
        <TrendArrowIcon tone={arrowTone} />
        {formatTrend(value)}
      </span>
      {comparisonLabel ? <span className={styles.metricDeltaLabel}>{comparisonLabel}</span> : null}
    </div>
  );
}

type SummaryTrendPillProps = {
  value: number;
  tone?: TrendTone;
  className?: string;
  directionTone?: TrendTone;
};

function SummaryTrendPill({
  value,
  tone,
  className,
  directionTone,
}: SummaryTrendPillProps) {
  const semanticTone = tone ?? getTrendTone(value);
  const arrowTone = directionTone ?? getTrendTone(value);
  return (
    <span className={cn(styles.salesTrend, salesTrendToneClass(semanticTone), className)}>
      <TrendArrowIcon tone={arrowTone} />
      {formatTrend(value)}
    </span>
  );
}

type SummaryMetricTileProps = {
  metric: ComparableMetricCardData;
  showComparisons: boolean;
  comparisonLabel: string;
};

function SummaryMetricTile({
  metric,
  showComparisons,
  comparisonLabel,
}: SummaryMetricTileProps) {
  const trendVisible = showComparisons && hasTrend(metric.trend);
  const trendValue = metric.trend ?? 0;
  const trendTone = getTrendTone(trendValue);
  const isBillingMetric = metric.key === "billing";

  return (
    <Card className={styles.metricCard}>
      <CardContent className={styles.metricBody}>
        <div className={styles.metricTop}>
          <p className={styles.metricLabel}>{metric.label}</p>
        </div>
        <p
          className={cn(
            styles.metricValue,
            isBillingMetric ? styles.metricValueBilling : null
          )}
        >
          {metric.value}
        </p>
        {trendVisible ? (
          <SummaryTrendDeltaBar
            value={trendValue}
            tone={trendTone}
            comparisonLabel={comparisonLabel}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

type SummarySalesChannelItemProps = {
  channel: SummaryChannel;
  showComparisons: boolean;
};

function SummarySalesChannelItem({
  channel,
  showComparisons,
}: SummarySalesChannelItemProps) {
  const trendVisible = showComparisons && hasTrend(channel.trend);
  const trendValue = channel.trend ?? 0;
  const trendTone = getTrendTone(trendValue);
  const barWidth = channel.share <= 0 ? 0 : Math.max(4, Math.min(100, channel.share));

  return (
    <article className={styles.salesItem}>
      <div className={styles.salesItemTop}>
        <div className={styles.salesItemHeading}>
          <p className={styles.salesItemName}>{channel.label}</p>
          <p className={styles.salesItemMeta}>
            {Math.max(0, Math.round(channel.orders)).toLocaleString("es-AR")} órdenes ·{" "}
            {formatMoney(channel.revenue)}
          </p>
        </div>

        <div className={styles.salesItemStats}>
          <span className={styles.salesShare}>{channel.share.toFixed(0)}%</span>
          {trendVisible ? <SummaryTrendPill value={trendValue} tone={trendTone} /> : null}
        </div>
      </div>

      <div className={styles.salesBarTrack}>
        <div
          className={styles.salesBarFill}
          style={{ width: `${barWidth}%` }}
          aria-hidden="true"
        />
      </div>
    </article>
  );
}

type SummaryTopProductItemProps = {
  product: SummaryTopProduct;
  maxTopProductUnits: number;
  showComparisons: boolean;
};

function SummaryTopProductItem({
  product,
  maxTopProductUnits,
  showComparisons,
}: SummaryTopProductItemProps) {
  const trendVisible = showComparisons && hasTrend(product.trend);
  const trendValue = product.trend ?? 0;
  const trendTone = getTrendTone(trendValue);
  const width = Math.max(
    6,
    Math.min(100, (Math.max(0, product.units) / maxTopProductUnits) * 100)
  );

  return (
    <article className={styles.productItem}>
      <div className={styles.productTop}>
        <div className={styles.productHeading}>
          {product.brand ? <p className={styles.productBrand}>{product.brand}</p> : null}
          <p className={styles.productName}>{product.name}</p>
          <p className={styles.productMeta}>
            {Math.max(0, Math.round(product.units)).toLocaleString("es-AR")} unidades
          </p>
        </div>

        <div className={styles.productStats}>
          <span className={styles.productRevenue}>{formatMoney(product.revenue)}</span>
          {trendVisible ? <SummaryTrendPill value={trendValue} tone={trendTone} /> : null}
        </div>
      </div>

      <div className={styles.productBarTrack}>
        <div
          className={styles.productBarFill}
          style={{ width: `${width}%` }}
          aria-hidden="true"
        />
      </div>
    </article>
  );
}

type SummaryPaymentStatusItemProps = {
  status: SummaryPaymentStatus;
};

function SummaryPaymentStatusItem({ status }: SummaryPaymentStatusItemProps) {
  const paymentFilter = mapSummaryPaymentStatusToOrdersFilter(status.key);
  const href =
    paymentFilter === "all"
      ? "/cuenta/administracion/ordenes"
      : `/cuenta/administracion/ordenes?payment_status=${encodeURIComponent(paymentFilter)}`;

  return (
    <Link
      href={href}
      className={styles.statusLink}
      aria-label={`Ver órdenes con pago ${status.label.toLowerCase()}`}
    >
      <article
        className={cn(
          styles.statusRow,
          paymentStatusRowToneClass(status.key, styles)
        )}
      >
        <span className={styles.statusCount}>
          {Math.max(0, Math.round(status.count)).toLocaleString("es-AR")}
        </span>
        <p className={styles.statusLabel}>{status.label}</p>
      </article>
    </Link>
  );
}

type SummaryDeliveryMetricItemProps = {
  metric: DeliveryCardData;
  showComparisons: boolean;
};

function SummaryDeliveryMetricItem({
  metric,
  showComparisons,
}: SummaryDeliveryMetricItemProps) {
  const trendVisible = showComparisons && hasTrend(metric.trend);
  const trendValue = metric.trend ?? 0;
  const trendDirection = getTrendTone(trendValue);
  const trendSemanticTone = getDeliveryTrendSemanticTone(metric.key, trendValue);

  return (
    <article className={styles.deliveryRow}>
      <div className={styles.deliveryInfo}>
        <p className={styles.deliveryLabel}>{metric.label}</p>
        <p className={styles.deliveryValue}>{metric.value}</p>
      </div>
      {trendVisible ? (
        <SummaryTrendPill
          value={trendValue}
          tone={trendSemanticTone}
          directionTone={trendDirection}
          className={styles.deliveryTrendBadge}
        />
      ) : null}
    </article>
  );
}

export {
  SummaryComparisonBadge,
  SummaryMetricTile,
  SummarySalesChannelItem,
  SummaryTopProductItem,
  SummaryPaymentStatusItem,
  SummaryDeliveryMetricItem,
};
