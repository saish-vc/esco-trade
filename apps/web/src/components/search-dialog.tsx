"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchInstruments, type Watchlist, addWatchlistItem } from "@/hooks/use-api";
import { useWatchlistStore } from "@/stores/watchlist-store";

interface SearchResult {
  id: string;
  internalTicker: string;
  name: string | null;
  exchange: string | null;
  currency: string;
  assetType: string;
}

export function SearchDialog({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const watchlists = useWatchlistStore((s) => s.watchlists);
  const addItem = useWatchlistStore((s) => s.addItem);
  const openWatchlistPicker = useWatchlistStore((s) => s.openWatchlistPicker);
  const closeWatchlistPicker = useWatchlistStore((s) => s.closeWatchlistPicker);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
        setQuery("");
        setResults([]);
        setSelected(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSelected(0);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const list = await searchInstruments(q, controller.signal);
      setResults(list);
      setSelected(0);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        // keep previous results on abort/race; on network error we show empty
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(query);
  }, [query, runSearch]);

  const handleSelect = useCallback(
    async (instrument: SearchResult) => {
      onSelect?.(instrument);
      onClose();
      setQuery("");
      setResults([]);
      // If a watchlist picker is open, add to that watchlist
      if (activeWatchlistId) {
        try {
          await addWatchlistItem(activeWatchlistId, instrument.id);
          // optimistic-ish: re-fetch the watchlist items ourselves
          const wl = watchlists.find((w) => w.id === activeWatchlistId);
          if (wl) {
            addItem(activeWatchlistId, {
              id: crypto.randomUUID(),
              watchlistId: activeWatchlistId,
              instrument,
              sortOrder: wl.items.length,
              columns: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        } catch {}
      }
    },
    [activeWatchlistId, watchlists, addItem, onClose, onSelect]
  );

  const watchlistId = activeWatchlistId;
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[selected];
        if (r) handleSelect(r);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selected, handleSelect, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search symbols"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-surface-900/95 shadow-2xl backdrop-blur overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-surface-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search ticker or name (e.g. AAPL, Microsoft)"
            className="flex-1 bg-transparent text-surface-50 placeholder-surface-500 outline-none"
            aria-label="Search query"
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-activedescendant={results[selected] ? `result-${results[selected].id}` : undefined}
          />
          <kbd className="rounded border border-white/10 bg-surface-800 px-1.5 py-0.5 text-[11px] text-surface-400">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="border-t border-white/10 px-4 py-6 text-center text-surface-400 text-sm">
              Searching…
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="border-t border-white/10 px-4 py-6 text-center text-surface-400 text-sm">
              No instruments found.
            </div>
          ) : (
            <ul id="search-results" className="py-1" role="listbox">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    id={`result-${r.id}`}
                    role="option"
                    aria-selected={i === selected}
                    onClick={() => handleSelect(r)}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-surface-50 transition ${i === selected ? "bg-brand-500/15 text-brand-200" : "hover:bg-white/5"}`}
                  >
                    <span className="font-mono text-base font-medium tabular-nums">{r.internalTicker}</span>
                    <span className="flex-1 truncate text-surface-400 text-sm">{r.name ?? "—"}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-surface-500">
                      {r.exchange ?? "—"}
                      <span className="text-surface-600">·</span>
                      {r.currency}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${r.assetType === "equity" ? "bg-surface-800 text-surface-400" : "bg-surface-700 text-surface-400"}`}>
                      {r.assetType}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {watchlists.length > 0 && (
          <div className="border-t border-white/10 px-4 py-2.5 flex items-center gap-2 text-sm text-surface-400">
            <span className="text-surface-500">Add to watchlist:</span>
            <select
              value={activeWatchlistId ?? ""}
              onChange={(e) => setActiveWatchlistId(e.target.value || null)}
              className="flex-1 rounded-lg border border-white/10 bg-surface-800 px-2 py-1.5 text-sm text-surface-50 outline-none focus:border-brand-500/60"
              aria-label="Target watchlist"
            >
              <option value="">Choose watchlist…</option>
              {watchlists.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-3 text-xs text-surface-500">
          <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
          <span className="text-surface-700">·</span>
          <span><kbd className="rounded border border-white/10 bg-surface-800 px-1 py-0.5">↑↓</kbd> navigate</span>
          <span className="text-surface-700">·</span>
          <span><kbd className="rounded border border-white/10 bg-surface-800 px-1 py-0.5">↵</kbd> select</span>
          <span className="text-surface-700">·</span>
          <span><kbd className="rounded border border-white/10 bg-surface-800 px-1 py-0.5">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
