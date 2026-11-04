const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
    ...opts,
    credentials: "include",
    signal: opts?.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `Request failed: ${res.status}`), {
      status: res.status,
      data: body,
    });
  }
  return res.json();
}

// Instruments search (demo)
export async function searchInstruments(q: string, signal?: AbortSignal) {
  const data = await api<{ instruments: any[]; nextCursor?: string }>(
    `/instruments/search?q=${encodeURIComponent(q)}&limit=50`,
    { signal }
  );
  return data.instruments;
}

// Instrument metadata
export async function instrumentMetadata(id: string) {
  return api<any>(`/instruments/${id}`);
}

// Historical candles
export async function fetchCandles(params: {
  instrumentId: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";
  from: string;
  to: string;
  session?: string;
}) {
  const qs = new URLSearchParams({
    instrumentId: params.instrumentId,
    timeframe: params.timeframe,
    from: params.from,
    to: params.to,
  });
  if (params.session) qs.set("session", params.session);
  const data = await api<any>(`/instruments/${params.instrumentId}/candles?${qs}`);
  return data;
}

// Latest quote
export async function latestQuote(instrumentId: string) {
  return api<any>(`/instruments/${instrumentId}/quote`);
}

// Watchlists
export interface WatchlistItem {
  id: string;
  watchlistId: string;
  instrument: any;
  sortOrder: number;
  columns: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: WatchlistItem[];
}

export async function listWatchlists(signal?: AbortSignal) {
  return api<Watchlist[]>("/watchlists", { signal });
}
export async function getWatchlist(id: string, signal?: AbortSignal) {
  return api<Watchlist>(`/watchlists/${id}`, { signal });
}
export async function createWatchlist(name: string) {
  return api<Watchlist>("/watchlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
export async function deleteWatchlist(id: string) {
  await api(`/watchlists/${id}`, { method: "DELETE" });
}
export async function addWatchlistItem(watchlistId: string, instrumentId: string, sortOrder?: number) {
  return api<WatchlistItem>(`/watchlists/${watchlistId}/items`, {
    method: "POST",
    body: JSON.stringify({ watchlistId, instrumentId, sortOrder }),
  });
}
export async function removeWatchlistItem(watchlistId: string, itemId: string) {
  await api(`/watchlists/${watchlistId}/items/${itemId}`, { method: "DELETE" });
}
export async function reorderWatchlistItems(watchlistId: string, itemIds: string[]) {
  return api<Watchlist>(`/watchlists/${watchlistId}/items/reorder`, {
    method: "PUT",
    body: JSON.stringify({ itemIds }),
  });
}

// Layouts
export interface Layout {
  id: string;
  userId: string;
  name?: string;
  instrumentId?: string;
  timeframe?: "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";
  chartType?: "candlestick" | "line" | "area" | "ohlc";
  scale?: "linear" | "log";
  drawings?: unknown[];
  preferences?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export async function listLayouts(signal?: AbortSignal) {
  return api<Layout[]>("/layouts", { signal });
}
export async function saveLayout(layout: Partial<Layout>) {
  return api<Layout>("/layouts", {
    method: "POST",
    body: JSON.stringify(layout),
  });
}
export async function updateLayout(id: string, patch: Partial<Layout>) {
  return api<Layout>(`/layouts/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
export async function deleteLayout(id: string) {
  await api(`/layouts/${id}`, { method: "DELETE" });
}

// Preferences
export interface Preference {
  id: string;
  userId: string;
  theme: "light" | "dark";
  timezone: string;
  key: string;
  value: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export async function getPreferences(signal?: AbortSignal) {
  return api<Preference[]>("/preferences", { signal });
}
export async function setPreference(key: string, value: unknown) {
  return api<Preference>("/preferences", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}
