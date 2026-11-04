import type { MarketDataEvent, ProviderType } from "@esco-trade/shared";

export interface ProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  maxSymbols: number;
  reconnectBaseMs?: number;
  staleAfterMs?: number;
}

export type MarketDataListener = (event: MarketDataEvent) => void;
export type ProviderStatusListener = (status: {
  provider: ProviderType;
  state: "connected" | "connecting" | "disconnected" | "reconnecting" | "error";
  message?: string;
}) => void;

export interface IMarketDataProvider {
  readonly name: ProviderType;
  readonly maxSymbols: number;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  subscribe(symbol: string): Promise<boolean>;
  unsubscribe(symbol: string): Promise<boolean>;
  
  onEvent(listener: MarketDataListener): void;
  onStatus(listener: ProviderStatusListener): void;
  
  getSubscribedSymbols(): Set<string>;
  isConnected(): boolean;
}
