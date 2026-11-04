"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SearchDialog } from "@/components/search-dialog";
import { Chart, type Timeframe, type ChartType, type Scale } from "@/components/chart";
import { ThemeToggle } from "@/components/theme-toggle";
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

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"];

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
  const [status, setStatus] = useState<{ source: string; latestObservationTime: string | null; status: string; currency: string }>({ source: "demo", latestObservationTime: null, status: "demo", currency: "USD" });
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [scale, setScale] = useState<Scale>("linear");
  const [loading, setLoading] = useState(false);
  const [persistedWatchlistId, setPersistedWatchlistId] = useState<string | null>(null);

  const store = useWatchlistStore();
  const candleAnchorRef = useRef<Date>(new Date());

  const loadInstrument = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const meta = await instrumentMetadata(id);
      setInstrument({
        id,
        internalTicker: meta.internalTicker,
        name: meta.name,
        exchange: meta.exchange,
        currency: meta.currency,
        assetType: meta.assetType,
        pricePrecision: meta.pricePrecision,
        session: meta.session ?? "regular",
        timezone: meta.timezone ?? "America/New_York",
        status: "demo",
        source: "demo",
        timestamp: undefined,
      });
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
          status: (q.status as "demo" | "live" | "delayed" | "stale"),
          currency: "USD",
        });
      }
      const { from, to } = windowRange(timeframe, candleAnchorRef.current);
      const data = await fetchCandles({ instrumentId: id, timeframe, from: from.toISOString(), to: to.toISOString(), session: "regular" });
      setCandles(data.candles.map((c: any) => ({
        time: toChartTime(new Date(c.timestamp)),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })));
      candleAnchorRef.current = data.latestObservationTime ? new Date(data.latestObservationTime) : candleAnchorRef.current;
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  const handleSearchSelect = useCallback(
    (result: { id: string; internalTicker: string; name: string | null; exchange: string | null; currency: string; assetType: string }) => {
      setInstrument({
        id: result.id,
        internalTicker: result.internalTicker,
        name: result.name,
        exchange: result.exchange,
        currency: result.currency,
        assetType: result.assetType,
        pricePrecision: 2,
        session: "regular",
        timezone: "America/New_York",
        status: "demo",
        source: "demo",
        timestamp: undefined,
      });
      setPersistedWatchlistId(null);
      candleAnchorRef.current = new Date();
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

  // Load persisted watchlist from server
  useEffect(() => {
    store.fetchWatchlists();
  }, [store]);

  // When a watchlist becomes active, ensure it's fresh
  useEffect(() => {
    if (store.activeWatchlistId) {
      getWatchlist(store.activeWatchlistId).then((wl) => {
        // Update the store with the fresh watchlist
        store.setWatchlists?.([wl]);
      }).catch(() => {});
    }
  }, [store.activeWatchlistId]);

  // Keyboard shortcut global
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
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-surface-900/80 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-brand-400" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13l4-4 4 4 4-4 4 4 4-4 4 4M3 17l4-4 4 4 4-4 4 4"/>
            </svg>
            <span className="text-lg font-semibold tracking-tight text-surface-50">Esco Trade</span>
          </div>
          <span className="rounded bg-brand-500/15 text-brand-300 border border-brand-500/30 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">DEMO</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            className="rounded-lg border border-white/10 bg-surface-800/80 px-3 py-1.5 text-sm font-medium text-surface-400 hover:text-surface-50 hover:border-white/20 active:scale-95 transition flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            Search
            <kbd className="rounded border border-white/10 bg-surface-900/80 px-1.5 py-0.5 text-[11px]">⌘K</kbd>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Left: watchlist panel */}
        <aside className="w-[280px] shrink-0 border-r border-white/10 bg-surface-900/60 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-surface-400">Watchlist</span>
            <button
              type="button"
              onClick={() => store.fetchWatchlists()}
              className="rounded text-xs text-surface-500 hover:text-surface-400 transition"
              aria-label="Refresh watchlists"
            >
              ↻
            </button>
          </div>

          {store.watchlists.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-surface-500 text-sm pb-4">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-surface-700" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 14l2 2 4-4"/>
              </svg>
              <span className="text-center text-surface-600">No watchlists yet</span>
              <span className="text-center text-surface-700 text-xs">Search a symbol and add it to a new watchlist</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {store.watchlists.map((wl) => (
                <div key={wl.id} className="border-b border-white/5">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => store.setActiveWatchlistId(wl.id)}
                      className={`text-sm font-medium truncate transition ${store.activeWatchlistId === wl.id ? "text-brand-200" : "text-surface-500 hover:text-surface-400"}`}
                    >
                      {wl.name}
                    </button>
                    <span className="text-[11px] text-surface-600 tabular-nums">{wl.items.length}</span>
                  </div>
                  {store.activeWatchlistId === wl.id && (
                    <ul className="divide-y divide-white/5">
                      {wl.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="font-mono text-sm text-surface-50 tabular-nums">{item.instrument.internalTicker}</span>
                          <span className="flex-1 truncate text-surface-400 text-xs">{item.instrument.name ?? ""}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromWatchlist(wl.id, item.id)}
                            className="rounded text-surface-600 hover:text-rose-400 transition text-xs"
                            aria-label={`Remove ${item.instrument.internalTicker} from watchlist`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                      {wl.items.length === 0 && (
                        <li className="px-3 py-2 text-center text-surface-600 text-xs">Empty</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center: chart */}
        <main className="flex-1 flex flex-col min-w-0">
          {instrument ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 border-b border-white/10 bg-surface-900/60 px-3 py-1.5 text-sm">
                <h1 className="font-semibold text-surface-50">{instrument.internalTicker}</h1>
                {instrument.name && <span className="text-surface-400 truncate max-w-[300px]">{instrument.name}</span>}
                <span className="ml-auto text-surface-500 text-xs">
                  {instrument.exchange ?? "—"} · {instrument.currency ?? "USD"}
                </span>
                {status.status === "demo" && (
                  <span className="badge-demo text-[11px]">DEMO</span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading chart…</div>
                ) : (
                  <Chart
                    instrument={instrument}
                    candles={candles}
                    timeframe={timeframe}
                    chartType={chartType}
                    scale={scale}
                    status={status}
                    volume={true}
                    showIndicators={true}
                    selectedIndicator="sma"
                    onTimeframeChange={handleTimeframeChange}
                    onChartTypeChange={(t) => setChartType(t)}
                    onScaleChange={(s) => setScale(s)}
                    onChangePeriod={(dir) => {
                      const span = dir === "left" ? 1.25 : -0.25;
                      candleAnchorRef.current = new Date(candleAnchorRef.current.getTime() * (1 + span));
                      if (instrument) loadInstrument(instrument.id);
                    }}
                    onIndicatorChange={(ind) => console.log("Indicator:", ind)}
                  />
                )}
              </div>
              {/* Add-to-watchlist bar */}
              <div className="border-t border-white/10 bg-surface-900/60 px-3 py-2 flex items-center gap-3 text-sm">
                <span className="text-surface-400 text-xs">Add to watchlist</span>
                <select
                  value={persistedWatchlistId ?? ""}
                  onChange={(e) => {
                    if (e.target.value) handleAddToWatchlist(e.target.value);
                    else setPersistedWatchlistId(null);
                  }}
                  className="flex-1 rounded-lg border border-white/10 bg-surface-800/80 px-2 py-1.5 text-sm text-surface-50 outline-none focus:border-brand-500/60"
                  aria-label="Add to watchlist"
                >
                  <option value="">Choose watchlist…</option>
                  {store.watchlists.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {persistedWatchlistId && (
                  <span className="text-emerald-400 text-xs">Added</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-surface-500">
              <svg viewBox="0 0 24 24" className="w-12 h-12 text-surface-800" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 13l4-4 4 4 4-4 4 4 4-4 4 4M3 17l4-4 4 4 4-4 4 4"/>
                <rect x="1" y="6" width="22" height="14" rx="2"/>
              </svg>
              <span className="text-lg font-medium">Select a symbol</span>
              <span className="text-sm text-surface-600">Press <kbd className="rounded border border-white/10 bg-surface-800/80 px-1.5 py-0.5 text-xs">⌘K</kbd> or click Search to open the symbol dialog</span>
              <span className="text-xs text-surface-700">Demo data shown for all symbols until a real provider is enabled and licensing verified.</span>
            </div>
          )}
        </main>

        {/* Right: instrument info panel */}
        <aside className="w-[280px] shrink-0 border-l border-white/10 bg-surface-900/60 flex flex-col overflow-hidden hidden lg:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-surface-400">Instrument Info</span>
            <button type="button" className="rounded text-xs text-surface-500 hover:text-surface-400 transition" aria-label="Toggle instrument info">
              ⇱
            </button>
          </div>
          {instrument ? (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Identifier</div>
                <div className="font-mono text-base text-surface-50">{instrument.internalTicker}</div>
                <div className="text-xs text-surface-500">{instrument.exchange ?? "—"} · {instrument.currency ?? "USD"}</div>
              </div>
              {quote && (
                <div>
                  <div className="text-xs text-surface-600 mb-0.5">Last price</div>
                  <div className="text-xl font-semibold tabular-nums text-surface-50">${quote.price.toFixed(instrument?.pricePrecision ?? 2)}</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-sm tabular-nums ${quote.change != null && quote.change > 0 ? "text-emerald-400" : quote.change != null && quote.change < 0 ? "text-rose-400" : "text-surface-400"}`}>
                      {quote.change != null ? `${quote.change > 0 ? "+" : ""}$${quote.change.toFixed(2)}` : "—"}
                    </span>
                    <span className={`text-sm tabular-nums ${quote.changePercent != null && quote.changePercent > 0 ? "text-emerald-400" : quote.changePercent != null && quote.changePercent < 0 ? "text-rose-400" : "text-surface-400"}`}>
                      {quote.changePercent != null ? `${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Volume</div>
                <div className="text-sm tabular-nums text-surface-50">{quote?.volume != null ? `${(quote.volume / 1_000_000).toFixed(1)}M` : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Session</div>
                <div className="text-sm text-surface-50">{instrument.session ?? "regular"}</div>
                <div className="text-xs text-surface-500">{instrument.timezone ?? "America/New_York"}</div>
              </div>
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Data source</div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${status.status === "demo" ? "bg-brand-400" : status.status === "live" ? "bg-emerald-400" : status.status === "delayed" ? "bg-amber-400" : "bg-rose-400"}`} />
                  <span className="text-sm text-surface-50">{status.source} · {status.status}</span>
                </div>
                <div className="text-xs text-surface-500 mt-0.5">
                  {status.latestObservationTime ? `Updated ${new Date(status.latestObservationTime).toLocaleString()}` : "No data"}
                </div>
              </div>
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Precision</div>
                <div className="text-sm text-surface-50">{instrument.pricePrecision ?? 2} decimal places</div>
              </div>
              <div>
                <div className="text-xs text-surface-600 mb-0.5">Timeframe</div>
                <div className="text-sm text-surface-50">{timeframe} · {scale} scale</div>
                <div className="text-xs text-surface-500">{chartType}</div>
              </div>
              <div className="pt-2 border-t border-white/10 text-[11px] text-surface-600">
                This is a demo dataset. Real provider data is disabled until licensing is verified. See docs/DATA_LICENSING.md.
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-surface-600 text-sm">Select a symbol to see details.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
