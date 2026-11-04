import WebSocket from "ws";
import type { MarketDataEvent } from "@esco-trade/shared";
import type { IMarketDataProvider, MarketDataListener, ProviderStatusListener } from "../types";

export class AlpacaAdapter implements IMarketDataProvider {
  public readonly name = "alpaca" as const;
  public readonly maxSymbols = 30; // Hard limit on Alpaca basic/IEX tier

  private keyId: string;
  private secretKey: string;
  private ws: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private eventListeners: MarketDataListener[] = [];
  private statusListeners: ProviderStatusListener[] = [];
  private isAuthenticated: boolean = false;
  private isConnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private intentionalClose: boolean = false;

  constructor(keyId: string, secretKey: string) {
    this.keyId = keyId;
    this.secretKey = secretKey;
  }

  async connect(): Promise<void> {
    if (!this.keyId || !this.secretKey) {
      this.notifyStatus("error", "ALPACA_API_KEY or ALPACA_API_SECRET is missing");
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.isConnecting = true;
    this.isAuthenticated = false;
    this.notifyStatus("connecting");

    // Free basic plan uses IEX feed
    const endpoint = "wss://stream.data.alpaca.markets/v2/iex";

    try {
      this.ws = new WebSocket(endpoint);

      this.ws.on("open", () => {
        this.isConnecting = false;
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const messages = JSON.parse(data.toString());
          if (!Array.isArray(messages)) return;

          for (const msg of messages) {
            // 1. Handle greeting / connected
            if (msg.T === "success" && msg.msg === "connected") {
              // Send authentication frame within 10s
              this.ws?.send(
                JSON.stringify({
                  action: "auth",
                  key: this.keyId,
                  secret: this.secretKey,
                })
              );
            }
            // 2. Handle auth response
            else if (msg.T === "success" && msg.msg === "authenticated") {
              this.isAuthenticated = true;
              this.reconnectAttempts = 0;
              this.notifyStatus("connected");

              // Resubscribe to existing symbols
              if (this.subscribedSymbols.size > 0) {
                this.sendSubscriptionUpdate();
              }
            }
            // 3. Handle auth error
            else if (msg.T === "error") {
              this.notifyStatus("error", `Alpaca error ${msg.code}: ${msg.msg}`);
            }
            // 4. Handle Trades ('t')
            else if (msg.T === "t") {
              const event: MarketDataEvent = {
                instrumentId: msg.S,
                providerSymbol: msg.S,
                exchange: msg.x ?? "IEX",
                type: "trade",
                price: Number(msg.p),
                volume: Number(msg.s),
                timestamp: new Date(msg.t).getTime(),
                source: "alpaca",
                classification: "live",
                currency: "USD",
              };
              for (const listener of this.eventListeners) {
                listener(event);
              }
            }
            // 5. Handle Quotes ('q')
            else if (msg.T === "q") {
              const event: MarketDataEvent = {
                instrumentId: msg.S,
                providerSymbol: msg.S,
                exchange: "IEX",
                type: "quote",
                price: Number(msg.ap || msg.bp || 0),
                bid: Number(msg.bp || 0),
                ask: Number(msg.ap || 0),
                bidSize: Number(msg.bs || 0),
                askSize: Number(msg.as || 0),
                timestamp: new Date(msg.t).getTime(),
                source: "alpaca",
                classification: "live",
                currency: "USD",
              };
              for (const listener of this.eventListeners) {
                listener(event);
              }
            }
            // 6. Handle 1-minute Bars ('b')
            else if (msg.T === "b") {
              const timeSec = Math.floor(new Date(msg.t).getTime() / 1000);
              const event: MarketDataEvent = {
                instrumentId: msg.S,
                providerSymbol: msg.S,
                exchange: "IEX",
                type: "candle",
                price: Number(msg.c),
                volume: Number(msg.v),
                timestamp: new Date(msg.t).getTime(),
                source: "alpaca",
                classification: "live",
                currency: "USD",
                candle: {
                  time: timeSec,
                  open: Number(msg.o),
                  high: Number(msg.h),
                  low: Number(msg.l),
                  close: Number(msg.c),
                  volume: Number(msg.v),
                  isComplete: true,
                },
              };
              for (const listener of this.eventListeners) {
                listener(event);
              }
            }
          }
        } catch (err) {
          // Ignore malformed payloads gracefully
        }
      });

      this.ws.on("close", (code, reason) => {
        this.isConnecting = false;
        this.isAuthenticated = false;
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
      this.isAuthenticated = false;
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
    this.isAuthenticated = false;
    this.notifyStatus("disconnected");
  }

  async subscribe(symbol: string): Promise<boolean> {
    if (this.subscribedSymbols.size >= this.maxSymbols && !this.subscribedSymbols.has(symbol)) {
      return false; // Basic IEX plan limit (max 30 symbols)
    }

    this.subscribedSymbols.add(symbol);
    if (this.isConnected()) {
      this.sendSubscriptionUpdate();
    }
    return true;
  }

  async unsubscribe(symbol: string): Promise<boolean> {
    const removed = this.subscribedSymbols.delete(symbol);
    if (removed && this.isConnected()) {
      this.sendUnsubscriptionUpdate([symbol]);
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
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  private sendSubscriptionUpdate() {
    if (this.isConnected()) {
      const symbols = Array.from(this.subscribedSymbols);
      this.ws?.send(
        JSON.stringify({
          action: "subscribe",
          trades: symbols,
          quotes: symbols,
          bars: symbols,
        })
      );
    }
  }

  private sendUnsubscriptionUpdate(symbols: string[]) {
    if (this.isConnected() && symbols.length > 0) {
      this.ws?.send(
        JSON.stringify({
          action: "unsubscribe",
          trades: symbols,
          quotes: symbols,
          bars: symbols,
        })
      );
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.intentionalClose) return;

    this.reconnectAttempts++;
    const baseDelay = 1000;
    const delay = Math.min(30000, baseDelay * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500);

    this.notifyStatus("reconnecting", `Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      await this.connect();
    }, delay);
  }

  private notifyStatus(state: "connected" | "connecting" | "disconnected" | "reconnecting" | "error", message?: string) {
    for (const listener of this.statusListeners) {
      listener({ provider: "alpaca", state, message });
    }
  }
}
