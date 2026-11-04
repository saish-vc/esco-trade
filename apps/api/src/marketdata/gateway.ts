import type { MarketDataEvent, GatewayStatusEvent, ProviderType } from "@esco-trade/shared";
import type { IMarketDataProvider } from "./types";
import { DemoAdapter } from "./adapters/demo-adapter";
import { FinnhubAdapter } from "./adapters/finnhub-adapter";
import { AlpacaAdapter } from "./adapters/alpaca-adapter";
import { PollingAdapter } from "./adapters/polling-adapter";
import { CandleAggregator } from "./candle-aggregator";
import { PrismaClient } from "@prisma/client";

export interface GatewayConfig {
  providerType: ProviderType;
  finnhubApiKey?: string;
  alpacaApiKey?: string;
  alpacaApiSecret?: string;
  batchMs?: number;
  staleAfterMs?: number;
}

export type BroadcastBatchHandler = (events: MarketDataEvent[]) => void;
export type GatewayStatusHandler = (status: GatewayStatusEvent) => void;

export class MarketDataGateway {
  private provider: IMarketDataProvider;
  private prisma?: PrismaClient;
  private aggregator: CandleAggregator = new CandleAggregator();

  // instrumentId -> Set of userIds subscribing
  private subscriptions: Map<string, Set<string>> = new Map();
  // instrumentId -> providerSymbol (e.g. uuid -> AAPL)
  private symbolMap: Map<string, string> = new Map();
  // Reverse: providerSymbol -> instrumentId
  private reverseSymbolMap: Map<string, string> = new Map();

  // Event batch queue
  private batchQueue: MarketDataEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchMs: number;
  private staleAfterMs: number;

  // Last update per instrumentId
  private lastUpdate: Map<string, number> = new Map();

  // Listeners
  private broadcastHandlers: BroadcastBatchHandler[] = [];
  private statusHandlers: GatewayStatusHandler[] = [];

  constructor(config: GatewayConfig, prisma?: PrismaClient) {
    this.batchMs = config.batchMs ?? 50;
    this.staleAfterMs = config.staleAfterMs ?? 15000;
    this.prisma = prisma;

    // Initialize the configured adapter
    switch (config.providerType) {
      case "finnhub":
        this.provider = new FinnhubAdapter(config.finnhubApiKey || "");
        break;
      case "alpaca":
        this.provider = new AlpacaAdapter(config.alpacaApiKey || "", config.alpacaApiSecret || "");
        break;
      case "polling":
        this.provider = new PollingAdapter();
        break;
      case "demo":
      default:
        this.provider = new DemoAdapter();
        break;
    }

    this.setupProviderListeners();
  }

  public async start(): Promise<void> {
    await this.provider.connect();

    // Start batch flush timer
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.batchMs);
  }

  public async stop(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    await this.provider.disconnect();
    this.subscriptions.clear();
    this.symbolMap.clear();
    this.reverseSymbolMap.clear();
    this.aggregator.clear();
  }

  public onBatch(handler: BroadcastBatchHandler): void {
    this.broadcastHandlers.push(handler);
  }

  public onStatus(handler: GatewayStatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Subscribe a user to an instrument ID.
   * Resolves instrument ID to provider symbol, deduplicates upstream, and increments ref count.
   */
  public async subscribe(userId: string, instrumentId: string, tickerHint?: string): Promise<{ success: boolean; reason?: string }> {
    // 1. Resolve ticker
    let ticker = tickerHint || this.symbolMap.get(instrumentId);
    if (!ticker && this.prisma) {
      const inst = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
      if (inst) {
        ticker = inst.internalTicker;
      }
    }
    if (!ticker) {
      ticker = instrumentId; // Fallback to raw ID
    }

    this.symbolMap.set(instrumentId, ticker);
    this.reverseSymbolMap.set(ticker, instrumentId);

    // 2. Track reference counting
    let userSet = this.subscriptions.get(instrumentId);
    const isFirstSubscriber = !userSet || userSet.size === 0;

    if (!userSet) {
      userSet = new Set();
      this.subscriptions.set(instrumentId, userSet);
    }

    userSet.add(userId);

    // 3. Upstream subscription if first subscriber
    if (isFirstSubscriber) {
      if (this.provider.getSubscribedSymbols().size >= this.provider.maxSymbols) {
        // Enforce provider limit
        userSet.delete(userId);
        return {
          success: false,
          reason: `PROVIDER_LIMIT_REACHED: ${this.provider.name} limit of ${this.provider.maxSymbols} symbols reached.`,
        };
      }

      const subscribed = await this.provider.subscribe(ticker);
      if (!subscribed) {
        userSet.delete(userId);
        return { success: false, reason: "PROVIDER_REJECTED" };
      }
    }

    this.emitStatus();
    return { success: true };
  }

  /**
   * Unsubscribe a user from an instrument ID.
   * Decrements ref count; when count hits 0, unsubscribes from upstream provider.
   */
  public async unsubscribe(userId: string, instrumentId: string): Promise<boolean> {
    const userSet = this.subscriptions.get(instrumentId);
    if (!userSet) return false;

    userSet.delete(userId);

    if (userSet.size === 0) {
      this.subscriptions.delete(instrumentId);
      const ticker = this.symbolMap.get(instrumentId);
      if (ticker) {
        await this.provider.unsubscribe(ticker);
      }
    }

    this.emitStatus();
    return true;
  }

  public getActiveSubscriptionsCount(): number {
    return this.subscriptions.size;
  }

  public getRefCount(instrumentId: string): number {
    return this.subscriptions.get(instrumentId)?.size ?? 0;
  }

  public getSubscribers(instrumentId: string): Set<string> {
    return this.subscriptions.get(instrumentId) ?? new Set();
  }

  public getProvider(): IMarketDataProvider {
    return this.provider;
  }

  private setupProviderListeners(): void {
    this.provider.onEvent((event: MarketDataEvent) => {
      // 1. Map provider symbol back to internal instrument ID
      const internalId = this.reverseSymbolMap.get(event.providerSymbol) || event.instrumentId;
      const normalized: MarketDataEvent = {
        ...event,
        instrumentId: internalId,
      };

      // 2. Track freshness
      this.lastUpdate.set(internalId, normalized.timestamp);

      // 3. Update candle aggregation for real-time chart rolling
      const { current } = this.aggregator.processTick(
        internalId,
        "1m",
        normalized.price,
        normalized.volume || 0,
        normalized.timestamp
      );
      normalized.candle = current;

      // 4. Queue for batch broadcast
      this.batchQueue.push(normalized);
    });

    this.provider.onStatus((status) => {
      this.emitStatus(status.state, status.message);
    });
  }

  private flushBatch(): void {
    if (this.batchQueue.length === 0) return;

    const eventsToBroadcast = [...this.batchQueue];
    this.batchQueue = [];

    for (const handler of this.broadcastHandlers) {
      handler(eventsToBroadcast);
    }
  }

  private emitStatus(stateOverride?: any, message?: string): void {
    const status: GatewayStatusEvent = {
      provider: this.provider.name,
      status: stateOverride ?? (this.provider.isConnected() ? "connected" : "connecting"),
      activeSubscriptions: this.subscriptions.size,
      maxSymbols: this.provider.maxSymbols,
      lastUpdateTimestamp: Date.now(),
      message,
    };

    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}
