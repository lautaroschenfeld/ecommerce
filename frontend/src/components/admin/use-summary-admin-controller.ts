"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useSearchParams } from "next/navigation";

import { formatMoney } from "@/lib/format";
import {
  getAdminSummary,
  mapAdminSummaryError,
  type AdminSummaryResponse,
} from "@/lib/store-admin-summary";
import {
  PAYMENT_STATUS_ORDER,
  CHART_PADDING,
  CHART_TICKS,
  asRangeKey,
  defaultComparisonLabel,
  defaultGranularity,
  parseApiDate,
  formatPercentValue,
  buildSmoothPath,
  pickTickIndexes,
  niceStep,
  type BillingPoint,
  type ChartPoint,
  type MetricCardData,
  type FunnelCardData,
  type DeliveryCardData,
} from "./summary-admin-utils";

type UseSummaryAdminControllerOptions = {
  chartWidth: number;
  chartHeight: number;
};

export function useSummaryAdminController({
  chartWidth,
  chartHeight,
}: UseSummaryAdminControllerOptions) {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<AdminSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const gradientId = useId().replace(/:/g, "");
  const areaGradientId = `${gradientId}-area`;
  const lineGradientId = `${gradientId}-line`;
  const plotClipId = `${gradientId}-plot-clip`;

  const selectedRange = asRangeKey(searchParams.get("r"));
  const customFromParam = searchParams.get("from") ?? "";
  const customToParam = searchParams.get("to") ?? "";

  useEffect(() => {
    let cancelled = false;

    void getAdminSummary({
      range: selectedRange,
      from: selectedRange === "custom" ? customFromParam : undefined,
      to: selectedRange === "custom" ? customToParam : undefined,
    })
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setError(null);
        setHoveredIndex(null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(mapAdminSummaryError(fetchError, "No se pudo cargar el resumen."));
      });

    return () => {
      cancelled = true;
    };
  }, [customFromParam, customToParam, selectedRange]);

  const rangeGranularity =
    summary?.range.granularity ?? defaultGranularity(selectedRange);
  const showComparisons =
    summary?.range.show_comparisons ?? selectedRange !== "custom";
  const comparisonLabel =
    summary?.range.comparison_label ?? defaultComparisonLabel(selectedRange);

  const billingPoints = useMemo<BillingPoint[]>(() => {
    const source = summary?.chart.points ?? [];
    return source.map((point) => ({
      label: String(point.label || ""),
      value: Math.max(0, Math.round(Number(point.value) || 0)),
      date: parseApiDate(point.date),
    }));
  }, [summary?.chart.points]);

  const metricCards = useMemo<MetricCardData[]>(() => {
    if (!summary) return [];

    return [
      {
        key: "billing",
        label: "Facturación",
        value: formatMoney(summary.metrics.billing.value),
        trend: summary.metrics.billing.trend,
      },
      {
        key: "net_revenue",
        label: "Ganancia",
        value: formatMoney(summary.metrics.net_revenue.value),
        trend: summary.metrics.net_revenue.trend,
      },
      {
        key: "clients",
        label: "Clientes",
        value: Math.max(0, Math.round(summary.metrics.clients.value)).toLocaleString("es-AR"),
        trend: summary.metrics.clients.trend,
      },
      {
        key: "avg_ticket",
        label: "Promedio por venta",
        value: formatMoney(summary.metrics.avg_ticket.value),
        trend: summary.metrics.avg_ticket.trend,
      },
    ];
  }, [summary]);

  const salesFunnelMetrics = useMemo<FunnelCardData[]>(() => {
    if (!summary) return [];

    return [
      {
        key: "visits",
        label: "Visitas",
        value: Math.max(0, Math.round(summary.funnel.visits.value)).toLocaleString("es-AR"),
        trend: summary.funnel.visits.trend,
      },
      {
        key: "cart",
        label: "Carrito",
        value: Math.max(0, Math.round(summary.funnel.cart.value)).toLocaleString("es-AR"),
        trend: summary.funnel.cart.trend,
      },
      {
        key: "purchases",
        label: "Ventas",
        value: Math.max(0, Math.round(summary.funnel.purchases.value)).toLocaleString("es-AR"),
        trend: summary.funnel.purchases.trend,
      },
      {
        key: "conversion",
        label: "Conversión",
        value: `${formatPercentValue(summary.funnel.conversion.value, 1)}%`,
        trend: summary.funnel.conversion.trend,
      },
    ];
  }, [summary]);

  const deliveryMetrics = useMemo<DeliveryCardData[]>(() => {
    if (!summary) return [];

    const averageDays =
      summary.delivery.average_days.value === null
        ? "Sin datos"
        : `${summary.delivery.average_days.value.toFixed(1)} días`;
    const onTimeRate =
      summary.delivery.on_time_rate.value === null
        ? "Sin datos"
        : `${formatPercentValue(summary.delivery.on_time_rate.value, 1)}%`;
    const dispatchHours =
      summary.delivery.dispatch_hours.value === null
        ? "Sin datos"
        : `${summary.delivery.dispatch_hours.value.toFixed(1)} h`;

    return [
      {
        key: "dispatch_hours",
        label: "Tiempo de despacho",
        value: dispatchHours,
        trend: summary.delivery.dispatch_hours.trend,
      },
      {
        key: "average_days",
        label: "Tiempo total de entrega",
        value: averageDays,
        trend: summary.delivery.average_days.trend,
      },
      {
        key: "on_time_rate",
        label: "Tasa de entregas a tiempo",
        value: onTimeRate,
        trend: summary.delivery.on_time_rate.trend,
      },
      {
        key: "delayed_orders",
        label: "Órdenes con demora",
        value: Math.max(0, Math.round(summary.delivery.delayed_orders.value)).toLocaleString("es-AR"),
        trend: summary.delivery.delayed_orders.trend,
      },
    ];
  }, [summary]);

  const orderedPaymentStatuses = useMemo(() => {
    if (!summary) return [];

    return [...summary.payment_statuses]
      .map((status, index) => ({ status, index }))
      .sort((a, b) => {
        const leftOrder = PAYMENT_STATUS_ORDER.indexOf(
          a.status.key as (typeof PAYMENT_STATUS_ORDER)[number]
        );
        const rightOrder = PAYMENT_STATUS_ORDER.indexOf(
          b.status.key as (typeof PAYMENT_STATUS_ORDER)[number]
        );
        const leftRank = leftOrder === -1 ? PAYMENT_STATUS_ORDER.length + a.index : leftOrder;
        const rightRank = rightOrder === -1 ? PAYMENT_STATUS_ORDER.length + b.index : rightOrder;
        return leftRank - rightRank;
      })
      .map(({ status }) => status);
  }, [summary]);

  const maxTopProductUnits = useMemo(() => {
    const products = summary?.top_products ?? [];
    if (!products.length) return 1;
    return Math.max(...products.map((product) => Math.max(0, product.units)), 1);
  }, [summary?.top_products]);

  const hasChannelData = useMemo(() => {
    const channels = summary?.channels ?? [];
    return channels.some((channel) => {
      const orders = Number(channel.orders) || 0;
      const revenue = Number(channel.revenue) || 0;
      const share = Number(channel.share) || 0;
      return orders > 0 || revenue > 0 || share > 0;
    });
  }, [summary?.channels]);

  const chart = useMemo(() => {
    const values = billingPoints.length ? billingPoints.map((point) => point.value) : [0];
    const maxRaw = Math.max(...values, 0);
    const paddedMax = Math.max(maxRaw * 1.08, maxRaw + 1, 1);
    const targetIntervals = Math.max(CHART_TICKS - 1, 1);
    const tickStep = niceStep(paddedMax / targetIntervals);
    const maxValue = Math.max(tickStep, Math.ceil(paddedMax / tickStep) * tickStep);
    const tickCount = Math.max(2, Math.round(maxValue / tickStep) + 1);
    const yDomain = Math.max(maxValue, 1);

    const plotWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom;
    const innerTop = CHART_PADDING.top + 1.5;
    const innerBottom = CHART_PADDING.top + plotHeight - 1.5;
    const innerHeight = Math.max(1, innerBottom - innerTop);
    const bottomY = CHART_PADDING.top + plotHeight;

    const points: ChartPoint[] = billingPoints.map((point, index, source) => {
      const x =
        source.length === 1
          ? CHART_PADDING.left + plotWidth / 2
          : CHART_PADDING.left + (plotWidth * index) / Math.max(source.length - 1, 1);
      const y = innerTop + ((maxValue - point.value) / yDomain) * innerHeight;
      return { x, y, label: point.label };
    });

    const linePath = buildSmoothPath(points, {
      minY: innerTop,
      maxY: innerBottom,
    });
    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1]!.x.toFixed(2)} ${bottomY.toFixed(2)} L ${points[0]!.x.toFixed(2)} ${bottomY.toFixed(2)} Z`
        : "";

    const yTicks = Array.from({ length: tickCount }, (_, index) => {
      const y = CHART_PADDING.top + (plotHeight * index) / Math.max(tickCount - 1, 1);
      const value = Math.max(0, Math.round(maxValue - tickStep * index));
      return { value, y };
    });

    const xTickIndexes = pickTickIndexes(
      billingPoints.length,
      rangeGranularity === "hour" ? 7 : 8
    );

    return {
      chartWidth,
      chartHeight,
      areaPath,
      linePath,
      yTicks,
      xTickIndexes,
      points,
      plotWidth,
      plotHeight,
      bottomY,
      innerTop,
      innerBottom,
      hasData: billingPoints.length > 0,
    };
  }, [billingPoints, chartHeight, chartWidth, rangeGranularity]);

  const safeHoveredIndex =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < chart.points.length
      ? hoveredIndex
      : null;
  const hoveredPoint = safeHoveredIndex !== null ? chart.points[safeHoveredIndex] : null;
  const hoveredData = safeHoveredIndex !== null ? billingPoints[safeHoveredIndex] : null;
  const tooltipLeft = hoveredPoint
    ? Math.min(94, Math.max(8, (hoveredPoint.x / chart.chartWidth) * 100))
    : 50;
  const plotClipPadding = 8;

  function handleChartMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!chart.points.length) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const xInSvg = ((event.clientX - bounds.left) / bounds.width) * chart.chartWidth;

    let closestIndex = 0;
    let closestDistance = Infinity;
    for (let index = 0; index < chart.points.length; index += 1) {
      const point = chart.points[index]!;
      const distance = Math.abs(point.x - xInSvg);
      if (distance >= closestDistance) continue;
      closestDistance = distance;
      closestIndex = index;
    }

    setHoveredIndex(closestIndex);
  }

  return {
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
  };
}
