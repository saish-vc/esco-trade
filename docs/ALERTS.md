# Esco Trade — Alerts

## Semantics (precise; server-side alerts in Phase 3)

### Alert types
- Crosses above: price crosses above a threshold from below.
- Crosses below: price crosses below a threshold from above.
- Enters range: price enters [low, high] (inclusive bounds as defined).

### Modes
- Once: fires a single time, then state -> triggered (no further firing).
- Repeating: fires each time the condition is met, subject to cooldown.

### Cooldowns
- Once mode: after firing, alert is exhausted (triggered).
- Repeating mode: minimum interval between fires; an evaluation within the cooldown window is suppressed (no duplicate).
- Idempotency keys on notification delivery so retries never send duplicates.

### States
- enabled: active, evaluated.
- paused: not evaluated; retains prior state; resumes from paused state on unpause.
- triggered: fired (once mode) or currently in cooldown (repeating mode) — define per mode in implementation.
- expired: threshold reached end of life (e.g. time-based expiry if configured).

### First evaluation after creation
- On creation, do NOT trigger from pre-existing state.
- The first evaluation that can trigger is the first evaluation AFTER creation where the crossing actually occurs from the prior observation to the current observation.
- In other words: the condition is evaluated on the transition between two observations; the creation-time observation alone cannot cause a trigger.

### Stale data
- Do NOT trigger on stale data.
- If the latest observation is stale (status stale and beyond a configured staleness threshold), skip evaluation for that instrument; the alert remains in its current state.
- Staleness threshold is a per-alert or global config value (documented in implementation).

### Missing ticks and gaps
- Define clearly: evaluation happens on the gap-closing observation.
- When a gap is detected (missing expected ticks in a sequence, e.g. overnight/weekend/holiday or provider outage), evaluate the alert on the observation that closes the gap using the last known good observation as the "prior" — but only if the gap-closing observation is itself not stale.
- Between the last good observation and the gap-closing observation, no intermediate triggers are generated (we don't fabricate ticks).
- If the gap-closing observation does not establish a crossing, no trigger.

### Market reopening
- On market reopening after a closed session/holiday/outage, the first valid observation is treated as a gap-closing observation per the above.
- Daylight-saving transitions and session boundaries are handled via the exchange calendar/sessions data where available; where unavailable, treat missing ticks as gaps and apply gap-closing semantics.

### Notification delivery
- In-app notifications; optional email via provider abstraction.
- Alert history recorded; delivery status with retries; idempotency keys so duplicates are never sent.
- Retries bounded; failed deliveries marked with status; manual retry available.

### Negative rules
- User A cannot read/modify user B's alerts (ownership check on every protected resource).
- No trigger from stale data.
- No trigger from pre-existing state at creation.
- No duplicate notifications under retry (idempotency keys).

### Scope note
- Server-side alerts, worker, notifications, and email abstraction are Phase 3. The semantics above are the contract the implementation must satisfy and the basis for tests.
