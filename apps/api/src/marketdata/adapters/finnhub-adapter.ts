import WebSocket from "ws";
import type { MarketDataEvent } from "@esco-trade/shared";
import type { IMarketDataProvider, MarketDataListener, ProviderStatusListener } from "../types";

interface FinnhubTradeItem {
  s: string; // Symbol
  p: number; // Price
  t: number; // Timestamp ms
  v: number; // Volume
  c?: string[]; // Trade conditions
}

interface FinnhubMessage {
  type: string;
  data?: FinnhubTradeItem[];
}

export class FinnhubAdapter implements IMarketDataProvider {
  public readonly name = "finnhub" as const;
  public readonly maxSymbols = 50; // Hard limit on free tier

  private apiKey: string;
  private ws: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private eventListeners: MarketDataListener[] = [];
  private statusListeners: ProviderStatusListener[] = [];
  private isConnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private intentionalClose: boolean = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      this.notifyStatus("error", "FINNHUB_API_KEY is missing");
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.isConnecting = true;
    this.notifyStatus("connecting");

    const endpoint = `wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`;

    try {
      this.ws = new WebSocket(endpoint);

      this.ws.on("open", () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.notifyStatus("connected");

        // Resubscribe to existing symbols
        for (const symbol of this.subscribedSymbols) {
          this.sendSubscribe(symbol);
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as FinnhubMessage;
          if (msg.type === "trade" && Array.isArray(msg.data)) {
            for (const item of msg.data) {
              const event: MarketDataEvent = {
                instrumentId: item.s,
                providerSymbol: item.s,
                type: "trade",
                price: Number(item.p),
                volume: Number(item.v),
                timestamp: Number(item.t),
                source: "finnhub",
                classification: "live",
                currency: "USD",
              };

              for (const listener of this.eventListeners) {
                listener(event);
              }
            }
          } else if (msg.type === "ping") {
            this.ws?.send(JSON.stringify({ type: "pong" }));
          }
        } catch (err) {
          // Ignore malformed payloads gracefully
        }
      });

      this.ws.on("close", (code, reason) => {
        this.isConnecting = false;
        this.notifyStatus("disconnected", `Closed with code ${code}: ${reason.toString()}`);
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        this.notifyStatus("error", err.message);
      });
    } catch (err: any) {
      this.isConnecting = false;
      this.notifyStatus("error", err.message);
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus("disconnected");
  }

  async subscribe(symbol: string): Promise<boolean> {
    if (this.subscribedSymbols.size >= this.maxSymbols && !this.subscribedSymbols.has(symbol)) {
      return false; // Free-tier limit reached
    }

    this.subscribedSymbols.add(symbol);
    if (this.isConnected()) {
      this.sendSubscribe(symbol);
    }
    return true;
  }

  async unsubscribe(symbol: string): Promise<boolean> {
    const removed = this.subscribedSymbols.delete(symbol);
    if (removed && this.isConnected()) {
      this.sendUnsubscribe(symbol);
    }
    return removed;
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
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendSubscribe(symbol: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  }

  private sendUnsubscribe(symbol: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.intentionalClose) return;

    this.reconnectAttempts++;
    const baseDelay = 1000;
    // Exponential backoff with jitter
    const delay = Math.min(30000, baseDelay * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500);

    this.notifyStatus("reconnecting", `Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      await this.connect();
    }, delay);
  }

  private notifyStatus(state: "connected" | "connecting" | "disconnected" | "reconnecting" | "error", message?: string) {
    for (const listener of this.statusListeners) {
      listener({ provider: "finnhub", state, message });
    }
  }
}
