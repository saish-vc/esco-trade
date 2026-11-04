"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type CandlestickData, type LineData, type LineWidth } from "lightweight-charts";
import { formatPrice, formatPctChange } from "@esco-trade/shared";
import { sma, ema, rsi, macd, bollinger, vwap } from "@esco-trade/indicators";

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
  instrument: { internalTicker: string; name?: string | null; currency?: string; pricePrecision?: number; status?: string; source?: string; timestamp?: string } | null;
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
}

function candleToLV(c: Candle): CandlestickData {
  return { time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close };
}

function candleToLine(c: Candle): LineData {
  return { time: c.time as any, value: c.close };
}

function mapCandles(candles: Candle[], type: ChartType) {
  return candles.map(c => (type === "candlestick" || type === "ohlc" ? candleToLV(c) : candleToLine(c)));
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [indicatorData, setIndicatorData] = useState<{ time: number; value: number }[]>([]);

  const createNewChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lineSeriesRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "var(--color-surface-400)",
        fontFamily: "inherit",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255,255,255,0.25)",
          width: 1 as LineWidth,
          style: LineStyle.Dashed,
          labelBackgroundColor: "rgba(15,23,42,0.9)",
        },
        horzLine: {
          color: "rgba(255,255,255,0.25)",
          width: 1 as LineWidth,
          style: LineStyle.Dashed,
          labelBackgroundColor: "rgba(15,23,42,0.9)",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.1, bottom: volume ? 0.25 : 0.1 },
        autoScale: true,
        mode: scale === "log" ? 1 : 0,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: timeframe === "1m",
        fixLeftEdge: false,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: {
        axisPressedMouseMove: true,
      },
    });

    chartRef.current = chart;

    if (chartType === "line" || chartType === "area") {
      const series = chart.addLineSeries({
        color: "var(--color-brand-400)",
        lineWidth: 1.5 as LineWidth,
        crosshairMarkerVisible: true,
        priceFormat: { type: "price", precision: instrument?.pricePrecision ?? 2, minMove: 0.01 },
        lastValueVisible: true,
        priceLineVisible: true,
      });
      lineSeriesRef.current = series;
    } else {
      const series = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        priceFormat: { type: "price", precision: instrument?.pricePrecision ?? 2, minMove: 0.01 },
        lastValueVisible: true,
        priceLineVisible: true,
      });
      candleSeriesRef.current = series;
    }

    // Add indicator series if selected
    if (showIndicators && selectedIndicator !== "none") {
      const indSeries = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 1 as LineWidth,
        lineStyle: LineStyle.Dashed,
        crosshairMarkerVisible: true,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        lastValueVisible: true,
        priceLineVisible: true,

      });
      indicatorSeriesRef.current = indSeries;
    }

    if (volume) {
      const v = chart.addHistogramSeries({
        color: "rgba(255,255,255,0.25)",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeriesRef.current = v;
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        visible: volume,
      });
    }

    chart.timeScale().fitContent();
    setChartReady(true);
  }, [chartType, scale, timeframe, instrument]);

  useEffect(() => {
    createNewChart();
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [createNewChart]);

  // Calculate indicator values
  useEffect(() => {
    if (showIndicators && selectedIndicator !== "none" && candles.length > 0) {
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume);
      
      let values: (number | null)[] = [];
      
      switch (selectedIndicator) {
        case "sma":
          values = sma(closes, 20);
          break;
        case "ema":
          values = ema(closes, 20);
          break;
        case "rsi":
          values = rsi(closes, 14);
          break;
        case "macd":
          const macdResult = macd(closes, 12, 26, 9);
          values = macdResult.histogram;
          break;
        case "bollinger":
          const bb = bollinger(closes, 20);
          values = bb.middle;
          break;
        case "vwap":
          const vwapInputs = candles.map((c, i) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume }));
          const sessionIds = candles.map(() => "regular");
          values = vwap(vwapInputs, sessionIds);
          break;
        default:
          values = [];
      }
      
      const result = candles
        .map((c, i) => ({ time: c.time, value: values[i] }))
        .filter(d => d.value !== null && d.value !== undefined) as { time: number; value: number }[];
      
      setIndicatorData(result);
    } else {
      setIndicatorData([]);
    }
  }, [showIndicators, selectedIndicator, candles]);

  // Update data without recreating chart
  useEffect(() => {
    if (!chartReady || candles.length === 0) return;
    if (chartType === "candlestick" || chartType === "ohlc") {
      candleSeriesRef.current?.setData(mapCandles(candles, chartType));
      volumeSeriesRef.current?.setData(
        candles.map(c => ({ time: c.time as any, value: c.volume, color: c.close >= c.open ? "rgba(38,166,154,0.55)" as any : "rgba(239,83,80,0.55)" as any }))
      );
    } else {
      lineSeriesRef.current?.setData(mapCandles(candles, chartType));
    }
    
    // Update indicator data
    if (indicatorSeriesRef.current && indicatorData.length > 0) {
      indicatorSeriesRef.current.setData(
        indicatorData.map(d => ({ time: d.time as any, value: d.value }))
      );
    }
    
    chartRef.current?.timeScale().fitContent();
  }, [chartReady, candles, chartType, indicatorData]);

  const timeFrameOptions: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-surface-900/60 px-2 py-1.5 flex-wrap">
        {showIndicators && (
          <>
            <select
              value={selectedIndicator}
              onChange={(e) => onIndicatorChange?.(e.target.value)}
              className="rounded border border-white/10 bg-surface-800/80 px-2 py-1 text-xs text-surface-50 outline-none"
              aria-label="Indicator"
            >
              <option value="none">Indicator</option>
              <option value="sma">SMA</option>
              <option value="ema">EMA</option>
              <option value="rsi">RSI</option>
              <option value="macd">MACD</option>
              <option value="bollinger">Bollinger</option>
              <option value="vwap">VWAP</option>
            </select>
            <span className="w-px h-4 bg-white/10 mx-1" />
          </>
        )}
        <button
          type="button"
          onClick={() => onChartTypeChange?.("candlestick")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${chartType === "candlestick" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          Candle
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange?.("line")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${chartType === "line" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          Line
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange?.("area")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${chartType === "area" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          Area
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange?.("ohlc")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${chartType === "ohlc" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          OHLC
        </button>
        <span className="w-px h-4 bg-white/10 mx-1" />
        <select
          value={timeframe}
          onChange={(e) => onTimeframeChange?.(e.target.value as Timeframe)}
          className="rounded border border-white/10 bg-surface-800/80 px-2 py-1 text-xs text-surface-50 outline-none"
          aria-label="Timeframe"
        >
          {timeFrameOptions.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onScaleChange?.("linear")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${scale === "linear" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          Linear
        </button>
        <button
          type="button"
          onClick={() => onScaleChange?.("log")}
          className={`rounded px-2 py-1 text-xs font-medium transition ${scale === "log" ? "bg-brand-500/20 text-brand-200" : "text-surface-400 hover:text-surface-50"}`}
        >
          Log
        </button>
        <span className="w-px h-4 bg-white/10 mx-1" />
        <button
          type="button"
          onClick={() => onChangePeriod?.("left")}
          className="rounded px-2 py-1 text-xs text-surface-400 hover:text-surface-50 transition"
          aria-label="More history (left)"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onChangePeriod?.("right")}
          className="rounded px-2 py-1 text-xs text-surface-400 hover:text-surface-50 transition"
          aria-label="Less history (right)"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 7l5 5-5 5M6 7l5 5-5 5"/>
          </svg>
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <span className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${status.status === "demo" ? "bg-brand-400" : status.status === "live" ? "bg-emerald-400" : status.status === "delayed" ? "bg-amber-400" : "bg-rose-400"}`} />
            {status.status}
          </span>
          <span className="text-surface-600">·</span>
          <span className="text-surface-400">{instrument?.internalTicker ?? ""}</span>
          <span className="text-surface-600">·</span>
          <span className="text-surface-400">{status.source}</span>
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} className="tv-chart flex-1 min-h-0" />

      {/* Footer status */}
      <div className="flex items-center justify-between border-t border-white/10 bg-surface-900/60 px-3 py-1.5 text-xs text-surface-500">
        <div className="flex items-center gap-3">
          {instrument ? (
            <>
              <span className="tabular-nums">{instrument.internalTicker}</span>
              {instrument.name && <span className="text-surface-400 truncate max-w-[200px]">{instrument.name}</span>}
              <span className="text-surface-600">·</span>
              <span className="tabular-nums">{status.currency ?? instrument.currency ?? "USD"}</span>
            </>
          ) : (
            <span className="text-surface-500">No instrument</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-surface-500">
          {status.latestObservationTime ? (
            <span>Updated {new Date(status.latestObservationTime).toLocaleString()}</span>
          ) : (
            <span className="text-surface-600">No data</span>
          )}
          <span className="text-surface-700">·</span>
          <span className="tabular-nums">{candles.length} candles</span>
        </div>
      </div>
    </div>
  );
}
