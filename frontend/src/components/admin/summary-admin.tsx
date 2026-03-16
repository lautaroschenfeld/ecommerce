"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { AdminPanelCard } from "./admin-panel-card";
import { SummaryBillingChartCard } from "./summary-admin-billing-chart-card";
import {
  SummaryComparisonBadge,
  SummaryDeliveryMetricItem,
  SummaryMetricTile,
  SummaryPaymentStatusItem,
  SummarySalesChannelItem,
  SummaryTopProductItem,
} from "./summary-admin-components";
import { CHART_WIDTH } from "./summary-admin-utils";
import styles from "./summary-admin.module.css";
import { useSummaryAdminController } from "./use-summary-admin-controller";
export function SummaryAdmin() {
  const chartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(CHART_WIDTH);
  const chartHeight =
    chartWidth >= 1200 ? 320 : chartWidth >= 960 ? 300 : chartWidth >= 720 ? 280 : 252;

  useEffect(() => {
    const node = chartSurfaceRef.current;
    if (!node) return;

    const updateChartWidth = () => {
      const nextWidth = Math.max(320, Math.round(node.getBoundingClientRect().width));
      setChartWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateChartWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateChartWidth();
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const {
    summary,
    error,
    setHoveredIndex,
    rangeGranularity,
    showComparisons,
    comparisonLabel,
    metricCards,
    salesFunnelMetrics,
    deliveryMetrics,
    orderedPaymentStatuses,
    maxTopProductUnits,
    hasChannelData,
    chart,
    hoveredPoint,
    hoveredData,
    tooltipLeft,
    plotClipPadding,
    areaGradientId,
    lineGradientId,
    plotClipId,
    handleChartMouseMove,
  } = useSummaryAdminController({ chartWidth, chartHeight });
  const hasDeliveryData =
    summary !== null &&
    summary.funnel.purchases.value > 0 &&
    deliveryMetrics.length > 0;

  if (!summary) {
    return (
      <div className={styles.page}>
        <Card className={styles.metricCard}>
          <CardContent className={cn(styles.metricBody, styles.loadingBody)}>
            <div className={styles.loadingSkeletons} aria-hidden="true">
              <Skeleton className={styles.loadingLineShort} />
              <Skeleton className={styles.loadingLineLong} />
              <Skeleton className={styles.loadingLineMid} />
            </div>
            <p className={styles.loadingMessage}>
              {error ? "Servicio momentaneamente no disponible." : "Cargando resumen..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {error ? <p className={styles.fetchWarning}>No se pudo actualizar. Mostrando datos anteriores.</p> : null}

      <div className={styles.metricsGrid}>
        {metricCards.map((metric) => (
          <SummaryMetricTile
            key={metric.key}
            metric={metric}
            showComparisons={showComparisons}
            comparisonLabel={comparisonLabel}
          />
        ))}
      </div>

      <SummaryBillingChartCard
        chart={chart}
        chartSurfaceRef={chartSurfaceRef}
        rangeGranularity={rangeGranularity}
        hoveredPoint={hoveredPoint}
        hoveredData={hoveredData}
        tooltipLeft={tooltipLeft}
        plotClipPadding={plotClipPadding}
        areaGradientId={areaGradientId}
        lineGradientId={lineGradientId}
        plotClipId={plotClipId}
        onMouseMove={handleChartMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      />

      <div className={styles.funnelCardsGrid}>
        {salesFunnelMetrics.map((metric) => (
          <SummaryMetricTile
            key={metric.key}
            metric={metric}
            showComparisons={showComparisons}
            comparisonLabel={comparisonLabel}
          />
        ))}
      </div>

      <div className={styles.bottomCards}>
        <AdminPanelCard
          className={styles.salesCard}
          headerClassName={styles.salesHeader}
          headerRightClassName={styles.summaryHeaderRight}
          bodyClassName={styles.salesBody}
          titleClassName={styles.salesTitle}
          title="Origen de las ventas"
          headerRight={
            showComparisons ? <SummaryComparisonBadge label={comparisonLabel} /> : null
          }
        >
          <div
            className={cn(
              styles.salesList,
              hasChannelData ? null : styles.salesListEmpty
            )}
          >
            {hasChannelData ? (
              summary.channels.map((channel) => (
                <SummarySalesChannelItem
                  key={channel.key}
                  channel={channel}
                  showComparisons={showComparisons}
                />
              ))
            ) : (
              <p className={styles.emptyListText}>Sin datos disponibles.</p>
            )}
          </div>
        </AdminPanelCard>

        <AdminPanelCard
          className={styles.salesCard}
          headerClassName={styles.salesHeader}
          headerRightClassName={styles.summaryHeaderRight}
          bodyClassName={styles.salesBody}
          titleClassName={styles.salesTitle}
          title="Productos más vendidos"
          headerRight={
            showComparisons ? <SummaryComparisonBadge label={comparisonLabel} /> : null
          }
        >
          <div
            className={cn(
              styles.productsList,
              summary.top_products.length ? null : styles.productsListEmpty
            )}
          >
            {summary.top_products.length ? (
              summary.top_products.map((product) => (
                <SummaryTopProductItem
                  key={product.key}
                  product={product}
                  maxTopProductUnits={maxTopProductUnits}
                  showComparisons={showComparisons}
                />
              ))
            ) : (
              <p className={styles.emptyListText}>Sin datos disponibles.</p>
            )}
          </div>
        </AdminPanelCard>
      </div>

      <div className={styles.bottomInsightsGrid}>
        <AdminPanelCard
          className={styles.insightCard}
          headerClassName={styles.insightHeader}
          bodyClassName={styles.insightBody}
          titleClassName={styles.insightTitle}
          subtitleClassName={styles.insightSubtitle}
          title="Estado de pagos"
        >
          <div
            className={cn(
              styles.statusList,
              orderedPaymentStatuses.length ? null : styles.statusListEmpty
            )}
          >
            {orderedPaymentStatuses.length ? (
              orderedPaymentStatuses.map((status) => (
                <SummaryPaymentStatusItem key={status.key} status={status} />
              ))
            ) : (
              <p className={styles.emptyListText}>Sin datos disponibles.</p>
            )}
          </div>
        </AdminPanelCard>

        <AdminPanelCard
          className={styles.insightCard}
          headerClassName={styles.insightHeader}
          headerRightClassName={styles.summaryHeaderRight}
          bodyClassName={styles.insightBody}
          titleClassName={styles.insightTitle}
          subtitleClassName={styles.insightSubtitle}
          title="Tiempo de entrega"
          headerRight={
            showComparisons ? <SummaryComparisonBadge label={comparisonLabel} /> : null
          }
        >
          <div
            className={cn(
              styles.deliveryList,
              hasDeliveryData ? null : styles.deliveryListEmpty
            )}
          >
            {hasDeliveryData ? (
              deliveryMetrics.map((metric) => (
                <SummaryDeliveryMetricItem
                  key={metric.key}
                  metric={metric}
                  showComparisons={showComparisons}
                />
              ))
            ) : (
              <p className={styles.emptyListText}>Sin datos disponibles.</p>
            )}
          </div>
        </AdminPanelCard>
      </div>
    </div>
  );
}

