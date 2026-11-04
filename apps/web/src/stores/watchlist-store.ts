import { create } from "zustand";
import type { Watchlist, WatchlistItem } from "@/hooks/use-api";

interface WatchlistState {
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  selectedColumns: Record<string, string[]>; // per watchlist item name -> columns
  loading: boolean;
  error: string | null;
  // watchlist picker for search dialog
  openWatchlistPicker: () => void;
  closeWatchlistPicker: () => void;
  fetchWatchlists: () => Promise<void>;
  setWatchlists: (watchlists: Watchlist[]) => void;
  setActiveWatchlistId: (id: string | null) => void;
  addItem: (watchlistId: string, item: WatchlistItem) => void;
  removeItem: (watchlistId: string, itemId: string) => void;
  reorderItems: (watchlistId: string, itemIds: string[]) => Promise<void>;
  setError: (e: string | null) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchlists: [],
  activeWatchlistId: null,
  selectedColumns: {},
  loading: false,
  error: null,
  openWatchlistPicker: () => {},
  closeWatchlistPicker: () => {},
  fetchWatchlists: async () => {
    set({ loading: true, error: null });
    try {
      const { listWatchlists } = await import("@/hooks/use-api");
      const list = await listWatchlists();
      set({ watchlists: list, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.data?.error ?? e.message });
    }
  },
  setWatchlists: (watchlists) => {
    set({ watchlists });
  },
  setActiveWatchlistId: (id) => {
    set({ activeWatchlistId: id });
  },
  addItem: (watchlistId, item) => {
    set((s) => ({
      watchlists: s.watchlists.map((w) =>
        w.id === watchlistId ? { ...w, items: [...w.items, item] } : w
      ),
    }));
  },
  removeItem: (watchlistId, itemId) => {
    set((s) => ({
      watchlists: s.watchlists.map((w) =>
        w.id === watchlistId ? { ...w, items: w.items.filter((i) => i.id !== itemId) } : w
      ),
    }));
  },
  reorderItems: async (watchlistId, itemIds) => {
    const { reorderWatchlistItems } = await import("@/hooks/use-api");
    const updated = await reorderWatchlistItems(watchlistId, itemIds);
    set((s) => ({
      watchlists: s.watchlists.map((w) => (w.id === watchlistId ? updated : w)),
    }));
  },
  setError: (e) => set({ error: e }),
}));
