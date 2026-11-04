# Esco Trade — Database Model

## Conventions
- PostgreSQL + Prisma.
- Decimal arithmetic: NUMERIC for monetary/ledger values (portfolio, cost basis); avoid floats.
- Timestamps: `createdAt`/`updatedAt` on every table.
- Every FK has explicit ON DELETE behavior.
- Indexes on foreign keys and lookup columns.
- Market data tables separate from user-owned records.

## Core entities (Phase 1)

### User
- id UUID PK
- email TEXT UNIQUE NOT NULL
- name TEXT
- emailVerified TIMESTAMP
- image TEXT?
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- (Auth.js / Better Auth manages auth records; this is the application user profile.)

### Instrument
- id UUID PK
- internalTicker TEXT NOT NULL (human-readable symbol, e.g. "AAPL"; not the key)
- name TEXT
- assetType TEXT (e.g. "equity", "index", "crypto")
- exchange TEXT (venue/exchange)
- currency TEXT (ISO 4217, e.g. "USD")
- timezone TEXT (IANA, e.g. "America/New_York")
- pricePrecision INT (decimals for display)
- providerId TEXT (provider-specific ID)
- provider TEXT (which adapter supplied it)
- session TEXT (e.g. "regular", "extended") — context for display
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- UNIQUE(internalTicker, exchange, provider)

### ProviderInstrument (provider mapping, if multiple providers per instrument)
- id UUID PK
- instrumentId UUID FK -> Instrument ON DELETE CASCADE
- provider TEXT
- providerSymbol TEXT
- createdAt TIMESTAMP

### Watchlist
- id UUID PK
- userId UUID FK -> User ON DELETE CASCADE
- name TEXT NOT NULL
- sortOrder INT
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- UNIQUE(userId, name)

### WatchlistItem
- id UUID PK
- watchlistId UUID FK -> Watchlist ON DELETE CASCADE
- instrumentId UUID FK -> Instrument ON DELETE RESTRICT
- sortOrder INT
- columns JSONB (user-selected columns for this row, e.g. {price, change, pctChange, volume})
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- UNIQUE(watchlistId, instrumentId)

### ChartLayout
- id UUID PK
- userId UUID FK -> User ON DELETE CASCADE
- name TEXT
- instrumentId UUID FK -> Instrument ON DELETE SET NULL
- timeframe TEXT
- chartType TEXT (candlestick/line/area/ohlc)
- scale TEXT (linear/log)
- drawings JSONB (drawing definitions by price/time coordinates)
- preferences JSONB (saved chart prefs)
- createdAt TIMESTAMP
- updatedAt TIMESTAMP

### Preference
- id UUID PK
- userId UUID FK -> User ON DELETE CASCADE
- theme TEXT (light/dark)
- timezone TEXT (user display timezone)
- key TEXT
- value JSONB
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- UNIQUE(userId, key)

### AuditEvent (sensitive account actions)
- id UUID PK
- userId UUID FK -> User ON DELETE SET NULL
- action TEXT
- metadata JSONB
- ipAddress TEXT?
- userAgent TEXT?
- createdAt TIMESTAMP
- INDEX(userId, createdAt)

## Phase 1 market data (lightweight)

### HistoricalCandle (denormalized cache of provider data, separate from user records)
- id UUID PK
- instrumentId UUID FK -> Instrument ON DELETE CASCADE
- timeframe TEXT (1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M)
- session TEXT (regular/extended)
- open NUMERIC
- high NUMERIC
- low NUMERIC
- close NUMERIC
- volume NUMERIC
- timestamp TIMESTAMP (exchange time)
- adjusted BOOLEAN (split/dividend adjustment flag where applicable)
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- INDEX(instrumentId, timeframe, session, timestamp)
- NOTES: Phase 1 stores only what the demo/real adapter returns for the requested range; no high-volume tick storage.

### LatestQuote
- id UUID PK
- instrumentId UUID FK -> Instrument ON DELETE CASCADE
- price NUMERIC
- change NUMERIC
- changePercent NUMERIC
- volume NUMERIC
- prevClose NUMERIC
- session TEXT
- timestamp TIMESTAMP (latest observation time)
- source TEXT (demo/real)
- status TEXT (live/delayed/demo/stale)
- createdAt TIMESTAMP
- updatedAt TIMESTAMP
- INDEX(instrumentId)

## Notes / limitations (Phase 1)
- Corporate actions not yet modeled (splits unsupported — documented as a limitation; UI shows a message).
- Multi-currency conversion not yet modeled; portfolio totals refused across currencies until a conversion policy exists.
- Redis/cache/queues not yet introduced (Phase 2).

## ON DELETE behavior summary
- User -> Watchlist: CASCADE
- User -> WatchlistItem: via Watchlist CASCADE
- User -> ChartLayout: CASCADE
- User -> Preference: CASCADE
- User -> AuditEvent: SET NULL (retain audit trail)
- Watchlist -> WatchlistItem: CASCADE
- WatchlistItem -> Instrument: RESTRICT (don't delete an instrument still referenced)
- ChartLayout -> Instrument: SET NULL (layout survives instrument removal)
- HistoricalCandle / LatestQuote -> Instrument: CASCADE (cache owned by instrument)
