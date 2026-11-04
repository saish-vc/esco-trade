"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type LineWidth,
} from "lightweight-charts";
import { formatPrice, formatPctChange } from "@esco-trade/shared";
import { sma, ema, rsi, macd, bollinger, vwap } from "@esco-trade/indicators";
import type { MarketDataEvent } from "@esco-trade/shared";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";
export type ChartType = "candlestick" | "line" | "area" | "ohlc";
export type Scale = "linear" | "log";

export interface Candle {
  time: number; // UNIX seconds (Lightweight Charts convention)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  instrument: {
    id: string;
    internalTicker: string;
    name?: string | null;
    currency?: string;
    pricePrecision?: number;
    status?: string;
    source?: string;
    timestamp?: string;
  } | null;
  candles: Candle[];
  timeframe: Timeframe;
  chartType: ChartType;
  scale: Scale;
  status: { source: string; latestObservationTime?: string | null; status: string; currency?: string };
  volume?: boolean;
  showIndicators?: boolean;
  selectedIndicator?: string;
  onTimeframeChange?: (tf: Timeframe) => void;
  onChartTypeChange?: (t: ChartType) => void;
  onScaleChange?: (s: Scale) => void;
  onChangePeriod?: (dir: "left" | "right") => void;
  onIndicatorChange?: (indicator: string) => void;
  latestEvent?: MarketDataEvent | null;
}

export function Chart({
  instrument,
  candles,
  timeframe,
  chartType,
  scale,
  status,
  volume = true,
  showIndicators = false,
  selectedIndicator = "none",
  onTimeframeChange,
  onChartTypeChange,
  onScaleChange,
  onChangePeriod,
  onIndicatorChange,
  latestEvent,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [chartReady, setChartReady] = useState(false);

  // Initialize Lightweight Charts instance once
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255, 255, 255, 0.7)",
        fontFamily: "inherit",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      color: "rgba(59, 130, 246, 0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "", // Overlay
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setChartReady(true);

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update chart series data when historical candles change
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (candles && candles.length > 0) {
      const formattedCandles: CandlestickData[] = candles.map((c) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const formattedVolumes = candles.map((c) => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
      }));

      candleSeriesRef.current.setData(formattedCandles);
      volumeSeriesRef.current.setData(formattedVolumes);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, chartReady]);

  // Apply real-time tick/candle updates directly without re-rendering chart
  useEffect(() => {
    if (!chartReady || !latestEvent || !candleSeriesRef.current) return;

    if (latestEvent.candle) {
      candleSeriesRef.current.update({
        time: latestEvent.candle.time as any,
        open: latestEvent.candle.open,
        high: latestEvent.candle.high,
        low: latestEvent.candle.low,
        close: latestEvent.candle.close,
      });

      if (volumeSeriesRef.current && latestEvent.candle.volume) {
        volumeSeriesRef.current.update({
          time: latestEvent.candle.time as any,
          value: latestEvent.candle.volume,
          color:
            latestEvent.candle.close >= latestEvent.candle.open
              ? "rgba(16, 185, 129, 0.4)"
              : "rgba(239, 68, 68, 0.4)",
        });
      }
    }
  }, [latestEvent, chartReady]);

  // Log/Linear scale
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.priceScale("right").applyOptions({
        mode: scale === "log" ? 1 : 0,
      });
    }
  }, [scale]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              {instrument?.internalTicker || "Select Symbol"}
              {instrument?.name && <span className="text-xs font-normal text-slate-400">({instrument.name})</span>}
            </h2>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-slate-800/60 p-1 rounded-md text-xs">
            {(["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-0.5 rounded transition ${
                  timeframe === tf ? "bg-blue-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Scale selector */}
          <div className="flex items-center gap-1 bg-slate-800/60 p-1 rounded-md text-xs">
            <button
              onClick={() => onScaleChange?.("linear")}
              className={`px-2 py-0.5 rounded ${scale === "linear" ? "bg-blue-600 text-white" : "text-slate-400"}`}
            >
              Linear
            </button>
            <button
              onClick={() => onScaleChange?.("log")}
              className={`px-2 py-0.5 rounded ${scale === "log" ? "bg-blue-600 text-white" : "text-slate-400"}`}
            >
              Log
            </button>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-slate-400">Venue:</span>
            <span className="text-slate-200 uppercase">{status.source}</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={containerRef} className="flex-1 w-full min-h-[350px]" />
    </div>
  );
}
