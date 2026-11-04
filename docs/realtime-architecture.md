# Real-Time Market Data Architecture

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Browser as Web Browser (Lightweight Charts & Watchlist)
    participant WS as Fastify WebSocket Server (:4001)
    participant Gateway as Market Data Gateway (Server-Side)
    participant Aggregator as Candle Aggregator
    participant Provider as Market Data Adapter (Demo/Finnhub/Alpaca)
    participant Upstream as External Provider Stream (Finnhub / Alpaca WS)

    %% Connection & Auth
    Browser->>WS: Connect WebSocket
    WS-->>Browser: { type: "connected" }
    Browser->>WS: { type: "auth", payload: { userId: "..." } }
    WS-->>Browser: { type: "authenticated" }

    %% Subscription
    Browser->>WS: { type: "subscribe", payload: { instrumentId: "uuid", timeframe: "1m" } }
    WS->>Gateway: subscribe(userId, instrumentId)
    
    alt Subscription is new for Gateway (refCount == 1)
        Gateway->>Gateway: Check Provider Symbol Limits (e.g. max 50 for Finnhub)
        Gateway->>Provider: subscribeSymbol(providerSymbol)
        Provider->>Upstream: Send WS subscribe frame (e.g. {"type":"subscribe","symbol":"AAPL"})
    else Subscription already active (refCount > 1)
        Gateway->>Gateway: Increment Reference Count (deduplicated)
    end
    WS-->>Browser: { type: "subscribed", payload: { subscriptionId: "..." } }

    %% Upstream Event Processing
    Upstream->>Provider: Incoming raw message (Trade / Quote / Bar)
    Provider->>Gateway: normalizeMessage(raw) -> MarketDataEvent
    Gateway->>Aggregator: processEvent(event) -> Update active candle & roll timeframe
    Gateway->>Gateway: Buffer event in batch queue (e.g. 50ms batching)

    %% Broadcast
    loop Batch Interval Flush
        Gateway->>WS: broadcastBatch(events)
        WS-->>Browser: { type: "batch", payload: [MarketDataEvent, ...] }
    end

    %% Chart & Watchlist Update
    Browser->>Browser: Update chart active candle or append rolled candle
    Browser->>Browser: Update watchlist row price, change %, freshness badge

    %% Unsubscribe / Teardown
    Browser->>WS: { type: "unsubscribe", payload: { subscriptionId: "..." } }
    WS->>Gateway: unsubscribe(userId, instrumentId)
    Gateway->>Gateway: Decrement Reference Count
    opt refCount == 0
        Gateway->>Provider: unsubscribeSymbol(providerSymbol)
        Provider->>Upstream: Send WS unsubscribe frame
    end
```

---

## Gateway Design Principles
1. **Single Upstream Connection**: Providers like Finnhub and Alpaca strictly disallow multiple connections per API key. The server manages exactly **one** persistent WebSocket connection upstream per configured provider.
2. **Subscription Deduplication & Reference Counting**: When 100 users look at AAPL, only 1 subscription frame is sent upstream. Subscriptions are tracked with ref counts and only released when all subscribers leave.
3. **Symbol Capacity Protection**: If total subscribed unique symbols reach the provider's plan limit (e.g. 50 on Finnhub, 30 on Alpaca), new subscription requests are rejected gracefully with a `LIMIT_REACHED` event rather than crashing the socket.
4. **Batching**: Ticks are aggregated in a sliding window (default: 50ms) to prevent event-loop starvation in Fastify and unnecessary browser DOM repaints.
5. **Session-Aligned Candle Rolling**: 1m, 5m, 15m, 1h candle buckets are computed on UTC intervals with exchange session boundaries to prevent candle drift.
