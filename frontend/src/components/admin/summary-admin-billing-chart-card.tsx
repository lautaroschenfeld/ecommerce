"use client";

import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

import { CssVarElement } from "@/components/ui/css-var-element";
import { formatMoney } from "@/lib/format";
import type { AdminSummaryRangeGranularity } from "@/lib/store-admin-summary";

import { AdminPanelCard } from "./admin-panel-card";
import {
  CHART_PADDING,
  formatCompactMoney,
  formatHoverLabel,
  type BillingPoint,
  type ChartPoint,
} from "./summary-admin-utils";
import styles from "./summary-admin.module.css";

type SummaryChartModel = {
  chartWidth: number;
  chartHeight: number;
  areaPath: string;
  linePath: string;
  yTicks: Array<{ value: number; y: number }>;
  xTickIndexes: number[];
  points: ChartPoint[];
  plotWidth: number;
  plotHeight: number;
  bottomY: number;
  innerTop: number;
  innerBottom: number;
  hasData: boolean;
};

type SummaryBillingChartCardProps = {
  chart: SummaryChartModel;
  chartSurfaceRef: RefObject<HTMLDivElement | null>;
  rangeGranularity: AdminSummaryRangeGranularity;
  hoveredPoint: ChartPoint | null;
  hoveredData: BillingPoint | null;
  tooltipLeft: number;
  plotClipPadding: number;
  areaGradientId: string;
  lineGradientId: string;
  plotClipId: string;
  onMouseMove: (event: ReactMouseEvent<SVGSVGElement>) => void;
  onMouseLeave: () => void;
};

export function SummaryBillingChartCard({
  chart,
  chartSurfaceRef,
  rangeGranularity,
  hoveredPoint,
  hoveredData,
  tooltipLeft,
  plotClipPadding,
  areaGradientId,
  lineGradientId,
  plotClipId,
  onMouseMove,
  onMouseLeave,
}: SummaryBillingChartCardProps) {
  return (
    <AdminPanelCard
      className={styles.chartCard}
      headerClassName={styles.chartHeader}
      bodyClassName={styles.chartBody}
      titleClassName={styles.chartTitle}
      subtitleClassName={styles.chartSubtitle}
      title="Facturación"
      subtitle=""
    >
      <div ref={chartSurfaceRef} className={styles.chartSurface}>
        <svg
          viewBox={`0 0 ${chart.chartWidth} ${chart.chartHeight}`}
          className={styles.chartSvg}
          role="img"
          aria-label="Gráfica de facturación por período"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <defs>
            <linearGradient
              id={areaGradientId}
              x1="0"
              y1={CHART_PADDING.top}
              x2="0"
              y2={chart.bottomY}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--ui-chart-positive-fill-start)" />
              <stop offset="62%" stopColor="var(--ui-chart-positive-fill-mid)" />
              <stop offset="100%" stopColor="var(--ui-chart-positive-fill-end)" />
            </linearGradient>

            <linearGradient
              id={lineGradientId}
              x1={CHART_PADDING.left}
              y1={CHART_PADDING.top}
              x2={chart.chartWidth - CHART_PADDING.right}
              y2={chart.bottomY}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--ui-chart-positive-line-start)" />
              <stop offset="100%" stopColor="var(--ui-chart-positive-line-end)" />
            </linearGradient>

            <clipPath id={plotClipId}>
              <rect
                x={CHART_PADDING.left - plotClipPadding}
                y={chart.innerTop - plotClipPadding}
                width={Math.max(0, chart.plotWidth + plotClipPadding * 2)}
                height={Math.max(0, chart.innerBottom - chart.innerTop + plotClipPadding * 2)}
              />
            </clipPath>
          </defs>

          {chart.yTicks.map((tick, index) => {
            const alpha = Math.max(0.18, 0.42 - index * 0.06);
            return (
              <g key={`tick-y-${tick.value}-${index}`}>
                <line
                  x1={CHART_PADDING.left}
                  y1={tick.y}
                  x2={chart.chartWidth - CHART_PADDING.right}
                  y2={tick.y}
                  stroke={`rgb(var(--brand-border-rgb) / ${alpha.toFixed(3)})`}
                  strokeWidth={1}
                />
                <text
                  x={CHART_PADDING.left - 12}
                  y={tick.y + 4}
                  className={styles.yTick}
                  textAnchor="end"
                >
                  {formatCompactMoney(tick.value)}
                </text>
              </g>
            );
          })}

          <g clipPath={`url(#${plotClipId})`}>
            {chart.areaPath ? (
              <path d={chart.areaPath} fill={`url(#${areaGradientId})`} className={styles.area} />
            ) : null}
            {chart.linePath ? (
              <path
                d={chart.linePath}
                stroke={`url(#${lineGradientId})`}
                className={styles.line}
              />
            ) : null}

            {hoveredPoint ? (
              <>
                <line
                  x1={hoveredPoint.x}
                  y1={CHART_PADDING.top}
                  x2={hoveredPoint.x}
                  y2={chart.bottomY}
                  className={styles.hoverGuide}
                />
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r={8.5}
                  className={styles.hoverPointOuter}
                />
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r={4.25}
                  className={styles.hoverPointInner}
                />
              </>
            ) : null}
          </g>

          <rect
            x={CHART_PADDING.left}
            y={CHART_PADDING.top}
            width={chart.plotWidth}
            height={chart.plotHeight}
            className={styles.hoverHitArea}
          />

          {chart.xTickIndexes.map((index) => {
            const point = chart.points[index];
            if (!point) return null;
            return (
              <text
                key={`tick-x-${point.x}-${index}`}
                x={point.x}
                y={chart.chartHeight - 22}
                className={styles.xTick}
                textAnchor="middle"
              >
                {point.label}
              </text>
            );
          })}
        </svg>

        {!chart.hasData ? (
          <p className={styles.chartEmpty}>No hay datos para el rango seleccionado.</p>
        ) : null}

        {hoveredData ? (
          <CssVarElement
            className={styles.chartTooltip}
            vars={{ "--summary-chart-tooltip-left": `${tooltipLeft}%` }}
          >
            <p className={styles.chartTooltipLabel}>
              {formatHoverLabel(hoveredData, rangeGranularity)}
            </p>
            <p className={styles.chartTooltipValue}>{formatMoney(hoveredData.value)}</p>
          </CssVarElement>
        ) : null}
      </div>
    </AdminPanelCard>
  );
}
