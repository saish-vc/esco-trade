"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SearchDialog } from "@/components/search-dialog";
import { Chart, type Timeframe, type ChartType, type Scale } from "@/components/chart";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarketDataStatus } from "@/components/market-data-status";
import {
  searchInstruments,
  instrumentMetadata,
  fetchCandles,
  latestQuote,
  getWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
} from "@/hooks/use-api";
import { useWatchlistStore } from "@/stores/watchlist-store";
import type { MarketDataEvent, GatewayStatusEvent, DataClassification } from "@esco-trade/shared";

function toChartTime(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function windowRange(tf: Timeframe, center: Date) {
  const ms: Record<Timeframe, number> = {
    "1m": 2 * 60 * 60 * 1000,
    "5m": 2 * 60 * 60 * 1000,
    "15m": 4 * 60 * 60 * 1000,
    "1h": 48 * 60 * 60 * 1000,
    "4h": 48 * 60 * 60 * 1000,
    "1D": 40 * 24 * 60 * 60 * 1000,
    "1W": 12 * 7 * 24 * 60 * 60 * 1000,
    "1M": 12 * 30 * 24 * 60 * 60 * 1000,
  };
  const span = ms[tf] ?? ms["1D"];
  return { from: new Date(center.getTime() - span), to: new Date(center.getTime() + span) };
}

interface InstrumentInfo {
  id: string;
  internalTicker: string;
  name?: string | null;
  exchange?: string | null;
  currency?: string;
  assetType?: string;
  pricePrecision?: number;
  session?: string;
  timezone?: string;
  status?: string;
  source?: string;
  timestamp?: string;
}

export default function ChartPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [instrument, setInstrument] = useState<InstrumentInfo | null>(null);
  const [candles, setCandles] = useState<{ time: number; open: number; high: number; low: number; close: number; volume: number }[]>([]);
  const [quote, setQuote] = useState<{ price: number; change?: number; changePercent?: number; volume?: number; prevClose?: number; session?: string; timestamp?: string } | null>(null);
  const [status, setStatus] = useState<{ source: string; latestObservationTime: string | null; status: string; currency: string }>({
    source: "demo",
    latestObservationTime: null,
    status: "simulated",
    currency: "USD",
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [scale, setScale] = useState<Scale>("linear");
  const [loading, setLoading] = useState(false);
  const [persistedWatchlistId, setPersistedWatchlistId] = useState<string | null>(null);

  // Real-time market data state
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusEvent | null>(null);
  const [latestEvent, setLatestEvent] = useState<MarketDataEvent | null>(null);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, { price: number; classification: DataClassification }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const store = useWatchlistStore();
  const candleAnchorRef = useRef<Date>(new Date());

  // Establish authenticated WebSocket connection to server Market Data Gateway
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001";
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Send auth
          ws.send(JSON.stringify({ type: "auth", payload: { userId: "user-demo-id" } }));

          // Resubscribe if active instrument
          if (instrument) {
            ws.send(
              JSON.stringify({
                type: "subscribe",
                payload: {
                  instrumentId: instrument.id,
                  ticker: instrument.internalTicker,
                  timeframe,
                },
              })
            );
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "gateway_status") {
              setGatewayStatus(data.payload);
            } else if (data.type === "batch" && Array.isArray(data.payload)) {
              for (const ev of data.payload as MarketDataEvent[]) {
                // Update active instrument quote & chart
                if (instrument && ev.instrumentId === instrument.id) {
                  setLatestEvent(ev);
                  setQuote((prev) => ({
                    price: ev.price,
                    change: prev?.prevClose ? ev.price - prev.prevClose : undefined,
                    changePercent: prev?.prevClose ? ((ev.price - prev.prevClose) / prev.prevClose) * 100 : undefined,
                    volume: ev.volume,
                    prevClose: prev?.prevClose,
                    session: "regular",
                    timestamp: new Date(ev.timestamp).toISOString(),
                  }));
                  setStatus({
                    source: ev.source,
                    latestObservationTime: new Date(ev.timestamp).toISOString(),
                    status: ev.classification,
                    currency: ev.currency || "USD",
                  });
                }

                // Update watchlist live quotes
                setWatchlistQuotes((prev) => ({
                  ...prev,
                  [ev.instrumentId]: { price: ev.price, classification: ev.classification },
                }));
              }
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 3000);
        };
      } catch (err) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [instrument, timeframe]);

  // Subscribe to real-time updates when instrument changes
  const loadInstrument = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const meta = await instrumentMetadata(id);
        const instInfo: InstrumentInfo = {
          id,
          internalTicker: meta.internalTicker,
          name: meta.name,
          exchange: meta.exchange,
          currency: meta.currency,
          assetType: meta.assetType,
          pricePrecision: meta.pricePrecision,
          session: meta.session ?? "regular",
          timezone: meta.timezone ?? "America/New_York",
          status: "simulated",
          source: meta.provider ?? "demo",
          timestamp: undefined,
        };
        setInstrument(instInfo);

        const q = await latestQuote(id);
        if (q) {
          setQuote({
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
            volume: q.volume,
            prevClose: q.prevClose,
            session: q.session,
            timestamp: q.timestamp?.toISOString(),
          });
          setStatus({
            source: q.source,
            latestObservationTime: q.timestamp?.toISOString() ?? null,
            status: q.status as any,
            currency: "USD",
          });
        }

        const { from, to } = windowRange(timeframe, candleAnchorRef.current);
        const data = await fetchCandles({
          instrumentId: id,
          timeframe,
          from: from.toISOString(),
          to: to.toISOString(),
          session: "regular",
        });

        setCandles(
          data.candles.map((c: any) => ({
            time: toChartTime(new Date(c.timestamp)),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }))
        );

        // Tell websocket gateway to subscribe
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "subscribe",
              payload: {
                instrumentId: id,
                ticker: meta.internalTicker,
                timeframe,
              },
            })
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [timeframe]
  );

  const handleSearchSelect = useCallback(
    (result: { id: string; internalTicker: string; name: string | null; exchange: string | null; currency: string; assetType: string }) => {
      loadInstrument(result.id);
    },
    [loadInstrument]
  );

  const handleAddToWatchlist = useCallback(
    async (watchlistId: string) => {
      if (!instrument) return;
      try {
        await addWatchlistItem(watchlistId, instrument.id);
        store.addItem(watchlistId, {
          id: crypto.randomUUID(),
          watchlistId,
          instrument,
          sortOrder: 0,
          columns: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setPersistedWatchlistId(watchlistId);
      } catch {}
    },
    [instrument, store]
  );

  const handleRemoveFromWatchlist = useCallback(
    async (watchlistId: string, itemId: string) => {
      try {
        await removeWatchlistItem(watchlistId, itemId);
        store.removeItem(watchlistId, itemId);
        if (persistedWatchlistId === watchlistId) setPersistedWatchlistId(null);
      } catch {}
    },
    [persistedWatchlistId, store]
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleTimeframeChange = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      if (instrument) loadInstrument(instrument.id);
    },
    [instrument, loadInstrument]
  );

  useEffect(() => {
    store.fetchWatchlists();
  }, [store]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSearch]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 13l4-4 4 4 4-4 4 4 4-4 4 4M3 17l4-4 4 4 4-4 4 4" />
            </svg>
            <span className="text-base font-bold tracking-tight text-white">Esco Trade</span>
          </div>

          {/* Global Market Data Status Component */}
          <MarketDataStatus
            status={gatewayStatus}
            dataClassification={(status.status as DataClassification) || "simulated"}
            lastUpdateTime={status.latestObservationTime ? new Date(status.latestObservationTime).getTime() : null}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openSearch}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Search Instruments
            <kbd className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />

      {/* Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Watchlist Sidebar */}
        <aside className="w-[280px] shrink-0 border-r border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Watchlist</span>
            <button
              type="button"
              onClick={() => store.fetchWatchlists()}
              className="text-slate-500 hover:text-slate-300 transition"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {store.watchlists.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No watchlists yet. Search a symbol (⌘K) to start tracking.
              </div>
            ) : (
              store.watchlists.map((wl) => (
                <div key={wl.id} className="border-b border-slate-800/60">
                  <div className="flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-300">
                    <span>{wl.name}</span>
                    <span className="text-[10px] text-slate-500">{wl.items.length} items</span>
                  </div>
                  <ul className="divide-y divide-slate-800/40">
                    {wl.items.map((item) => {
                      const livePrice = watchlistQuotes[item.instrument.id]?.price;
                      return (
                        <li
                          key={item.id}
                          onClick={() => loadInstrument(item.instrument.id)}
                          className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-800/40 cursor-pointer transition text-xs"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-white font-mono">{item.instrument.internalTicker}</span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                              {item.instrument.name || ""}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {livePrice !== undefined ? (
                              <span className="font-mono text-emerald-400 font-semibold">
                                ${livePrice.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-mono">—</span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromWatchlist(wl.id, item.id);
                              }}
                              className="text-slate-600 hover:text-rose-400 transition ml-1"
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chart View */}
        <main className="flex-1 flex flex-col min-w-0">
          {instrument ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/30 px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white font-mono">{instrument.internalTicker}</span>
                  {quote && (
                    <div className="flex items-baseline gap-2 font-mono">
                      <span className="text-xl font-bold text-white">${quote.price.toFixed(2)}</span>
                      {quote.change !== undefined && (
                        <span
                          className={`text-xs font-semibold ${
                            quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {quote.change >= 0 ? "+" : ""}
                          {quote.change.toFixed(2)} ({quote.changePercent?.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (store.watchlists.length > 0 && store.watchlists[0]) {
                        handleAddToWatchlist(store.watchlists[0].id);
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 text-xs font-medium transition"
                  >
                    + Watchlist
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                    Loading chart...
                  </div>
                ) : (
                  <Chart
                    instrument={instrument}
                    candles={candles}
                    timeframe={timeframe}
                    chartType={chartType}
                    scale={scale}
                    status={status}
                    latestEvent={latestEvent}
                    onTimeframeChange={handleTimeframeChange}
                    onScaleChange={setScale}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
              <p className="text-sm">Press ⌘K to search a stock and view real-time data</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
