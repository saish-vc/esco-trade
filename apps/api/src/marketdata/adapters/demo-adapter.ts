import type { MarketDataEvent } from "@esco-trade/shared";
import type { IMarketDataProvider, MarketDataListener, ProviderStatusListener } from "../types";

export class DemoAdapter implements IMarketDataProvider {
  public readonly name = "demo" as const;
  public readonly maxSymbols = 100;
  private subscribedSymbols: Set<string> = new Set();
  private eventListeners: MarketDataListener[] = [];
  private statusListeners: ProviderStatusListener[] = [];
  private timer: NodeJS.Timeout | null = null;
  private connected: boolean = false;
  private prices: Map<string, number> = new Map();

  private basePrices: Record<string, number> = {
    AAPL: 190, MSFT: 370, GOOG: 140, TSLA: 240, SPY: 475,
  };

  async connect(): Promise<void> {
    this.connected = true;
    this.notifyStatus("connected");

    // Produce ticks every 1000ms deterministically
    this.timer = setInterval(() => {
      if (!this.connected) return;
      const now = Date.now();

      for (const symbol of this.subscribedSymbols) {
        let currentPrice = this.prices.get(symbol);
        if (currentPrice === undefined) {
          currentPrice = this.basePrices[symbol] ?? 100;
        }

        // Pseudo-random walk with small drift
        const delta = (Math.random() - 0.49) * (currentPrice * 0.002);
        currentPrice = Number(Math.max(currentPrice + delta, 1).toFixed(2));
        this.prices.set(symbol, currentPrice);

        const volume = Math.floor(Math.random() * 500) + 10;

        const event: MarketDataEvent = {
          instrumentId: symbol,
          providerSymbol: symbol,
          exchange: "DEMO",
          type: "trade",
          price: currentPrice,
          bid: Number((currentPrice - 0.02).toFixed(2)),
          ask: Number((currentPrice + 0.02).toFixed(2)),
          volume,
          timestamp: now,
          source: "demo",
          classification: "simulated",
          currency: "USD",
        };

        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    }, 1000);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.notifyStatus("disconnected");
  }

  async subscribe(symbol: string): Promise<boolean> {
    if (this.subscribedSymbols.size >= this.maxSymbols) {
      return false;
    }
    this.subscribedSymbols.add(symbol);
    return true;
  }

  async unsubscribe(symbol: string): Promise<boolean> {
    return this.subscribedSymbols.delete(symbol);
  }

  onEvent(listener: MarketDataListener): void {
    this.eventListeners.push(listener);
  }

  onStatus(listener: ProviderStatusListener): void {
    this.statusListeners.push(listener);
  }

  getSubscribedSymbols(): Set<string> {
    return new Set(this.subscribedSymbols);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private notifyStatus(state: "connected" | "connecting" | "disconnected" | "reconnecting" | "error", message?: string) {
    for (const listener of this.statusListeners) {
      listener({ provider: "demo", state, message });
    }
  }
}
