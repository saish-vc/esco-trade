# Market Data Providers & Entitlements

## Overview
Esco Trade implements a provider-independent Market Data Gateway. To avoid vendor lock-in and respect commercial licensing, all market data is ingested through pluggable adapters, normalized into canonical events, and tagged with data classification and venue information.

---

## Provider Comparison

| Provider | Adapter Name | Protocol | Free-Tier Symbol Limit | Concurrency Limit | REST Rate Limit | Covered Venue | Legal Redistribution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Demo** | `demo` | In-memory synthetic | Unlimited (default 50) | Unlimited | Unlimited | Synthetic | **Yes** (internal generator) |
| **Finnhub** | `finnhub` | WebSocket (`wss://ws.finnhub.io`) | **50 symbols** | 1 WebSocket connection | 60 calls/min (30 calls/sec burst) | US Equities, Crypto, Forex | **No** (personal/dev only) |
| **Alpaca** | `alpaca` | WebSocket (`wss://stream.data.alpaca.markets/v2/iex`) | **30 symbols** | 1 WebSocket connection | 200 calls/min | US Equities (**IEX only**) | **No** (personal/dev only) |
| **Polling** | `polling` | HTTP REST Polling | 10 symbols | N/A | Bounded to 1 req/sec | Dependent on REST provider | Strict adherence to upstream terms |

---

## Provider Details & Constraints

### 1. Demo Adapter (`demo`)
- **Protocol:** Deterministic random walk seeded by instrument identifier.
- **Data Classification:** `simulated`.
- **Badging:** Always badged as `SIMULATED` in the user interface.
- **Use Cases:** Automated CI tests, local development without network access, offline testing.
- **Redistribution:** Safe for all environments. Never produces fake real data under a real ticker name without the `SIMULATED` watermark.

### 2. Finnhub (`finnhub`)
- **WebSocket Endpoint:** `wss://ws.finnhub.io?token={API_KEY}`
- **Authentication:** `token` query parameter in the handshake URL.
- **Connection Limit:** Strictly **1 active WebSocket connection** per API key. Multiple simultaneous connections result in connection termination.
- **Symbol Limits:** Maximum of **50 concurrent symbols** subscribed on the free tier.
- **Message Types:**
  - Ingestion: Trade events `{"type":"trade","data":[{"s":"AAPL","p":150.25,"t":1658304912234,"v":100,"c":["1"]}]}`.
  - Heartbeat: Finnhub responds with ping/pong frames; empty pings should be handled gracefully.
- **Data Entitlements:** Trades from US exchange participants. Does not provide full consolidated depth.
- **Redistribution Restrictions:** Finnhub's terms prohibit public redistribution of real-time feeds without a commercial license. The app enforces `ALLOW_PUBLIC_LIVE_DATA=false` unless explicitly licensed.

### 3. Alpaca Market Data Basic (`alpaca`)
- **WebSocket Endpoint:** `wss://stream.data.alpaca.markets/v2/iex`
- **Authentication:** Initial JSON handshake within 10 seconds:
  ```json
  {"action": "auth", "key": "{APCA_API_KEY_ID}", "secret": "{APCA_API_SECRET_KEY}"}
  ```
- **Connection Limit:** **1 active WebSocket connection** per key pair.
- **Symbol Limits:** Maximum of **30 concurrent symbols** on the free Basic tier. Wildcard (`*`) is rejected.
- **Stream Channels:**
  - `trades` (`t`): Real-time trade executions occurring on the Investors Exchange (IEX).
  - `quotes` (`q`): Real-time best bid/ask on IEX.
  - `bars` (`b`): 1-minute OHLCV bars aggregated from IEX trades.
- **Critical Venue Limitation:** Alpaca Free tier provides **IEX data only**, which represents ~2-3% of US consolidated equity volume. Price ticks reflect IEX executions, not consolidated SIP prices. The UI must disclose: `Source: Alpaca (IEX only)`.
- **Redistribution Restrictions:** The Alpaca Developer Terms and NASDAQ/NYSE Global Subscriber Agreements explicitly prohibit commercial redistribution to multiple third-party users without an Alpaca Broker API contract.

### 4. Bounded Polling Fallback (`polling`)
- Used when upstream WebSocket streams are disconnected, rate-limited, or unavailable.
- Poll intervals are strictly clamped (minimum 10 seconds per symbol) to never exceed upstream rate limits (e.g., 60 calls/minute on Finnhub or 200 calls/minute on Alpaca).
- Data emitted during polling fallback is classified as `delayed` or `stale`.

---

## Data Freshness & Staleness Rules
1. **Fresh (`live`):** Received within `MARKET_DATA_STALE_AFTER_MS` (default: 15,000 ms).
2. **Stale (`stale`):** No tick received for an actively subscribed instrument for >15,000 ms during active market hours.
3. **Simulated (`simulated`):** Produced by the synthetic demo engine.
4. **Delayed (`delayed`):** Timestamp is >15 minutes in the past or sourced from a delayed API.
5. **Missing (`missing`):** Instrument not recognized by the active provider.
