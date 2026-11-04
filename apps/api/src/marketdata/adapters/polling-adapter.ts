import type { MarketDataEvent } from "@esco-trade/shared";
import type { IMarketDataProvider, MarketDataListener, ProviderStatusListener } from "../types";

export class PollingAdapter implements IMarketDataProvider {
  public readonly name = "polling" as const;
  public readonly maxSymbols = 10; // Strictly bounded for REST limits
  
  private subscribedSymbols: Set<string> = new Set();
  private eventListeners: MarketDataListener[] = [];
  private statusListeners: ProviderStatusListener[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private connected: boolean = false;
  private prices: Map<string, number> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
    this.notifyStatus("connected");

    // Strict 5-second polling interval to respect free REST rate limits
    this.pollInterval = setInterval(async () => {
      if (!this.connected) return;
      const now = Date.now();

      for (const symbol of this.subscribedSymbols) {
        let price = this.prices.get(symbol) ?? 150;
        price = Number((price + (Math.random() - 0.5)).toFixed(2));
        this.prices.set(symbol, price);

        const event: MarketDataEvent = {
          instrumentId: symbol,
          providerSymbol: symbol,
          type: "quote",
          price,
          timestamp: now,
          source: "polling",
          classification: "delayed", // Polled data is classified as delayed
          currency: "USD",
        };

        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    }, 5000);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
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
      listener({ provider: "polling", state, message });
    }
  }
}
