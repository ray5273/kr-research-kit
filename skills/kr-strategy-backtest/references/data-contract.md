# Data and Configuration Contract

## Daily-bar input

Pass CSV or JSON. CSV requires this header:

```text
date,ticker,name,market,open,high,low,close,volume
```

JSON may be an array of the same objects or `{ "bars": [...] }`. Dates use `YYYY-MM-DD`; prices must be positive. `market` must be exactly `KOSPI` or `KOSDAQ` for an eligible row. Keep one row per ticker/date, sorted or unsorted. Use adjusted OHLC only if every price field follows the same adjustment policy.

The engine validates the input but cannot establish point-in-time membership, delisting coverage, or adjusted-price provenance. Put those source facts in `dataNotes`.

## Official total-return cache (strict annual-cap300b mode)

`--price-mode official-total-return --strict-events` does not accept the
generic CSV above. Build its cache with
`prepare-official-total-return-cache.js`; each security artifact must contain:

```json
{
  "securityId": "persistent-security-identifier",
  "ticker": "005930",
  "rawOHLC": [{ "date": "2026-01-02", "open": 1, "high": 1, "low": 1, "close": 1 }],
  "totalReturnOHLC": [{ "date": "2026-01-02", "open": 1, "high": 1, "low": 1, "close": 1 }],
  "adjustmentFactor": [{ "date": "2026-01-02", "factor": 1 }],
  "eventReferences": ["krx-dart-event-id"],
  "eventVerificationStatus": "verified-complete"
}
```

The companion event ledger has `schemaVersion: 1`; every event that can affect
an eligible security must have an immutable id, effective date, verified status,
and hashed HTTPS source records from both `KRX` and `DART`.  Supported types:
split/reverse split, capital reduction, rights issue, cash/stock dividend,
merger, spin-off, ticker change, and delisting.  A delisting requires explicit
cash consideration.  Do not infer an action from an OHLC discontinuity.  The
strict runner uses `totalReturnOHLC` for signals but applies the event ledger
to actual cash, shares, and successor securities at the event date.

## Configuration

```json
{
  "name": "60d-momentum-top10",
  "strategy": { "type": "cross-sectional-momentum", "lookbackDays": 60, "topN": 10, "rebalanceEvery": 20 },
  "startDate": "2021-01-01",
  "endDate": "2025-12-31",
  "initialCapital": 100000000,
  "commissionBps": 15,
  "slippageBps": 10,
  "cashRateAnnual": 0,
  "outOfSampleStart": "2025-01-01",
  "dataNotes": "KRX common-share history; describe adjustment and delisting policy here"
}
```

Required: `name`, `strategy.type`. Defaults are `initialCapital: 100000000`, `commissionBps: 15`, `slippageBps: 10`, `cashRateAnnual: 0`.

### `cross-sectional-momentum`

- `lookbackDays`: positive integer, default `60`; rank eligible stocks by close-to-close return over this many bars.
- `topN`: positive integer, default `10`; equal-weight the highest-ranked names.
- `rebalanceEvery`: positive integer, default `20`; schedule signals every Nth global session after lookback.
- Requires a valid close for both ends of each lookback window and an open on the following execution session.

### `sma-cross`

- `fastDays`: positive integer, default `20`.
- `slowDays`: integer greater than `fastDays`, default `60`.
- `maxPositions`: positive integer, default `20`; equal-weight all eligible names with fast SMA strictly above slow SMA, up to this cap, ranked by fast/slow ratio.
- `rebalanceEvery`: positive integer, default `5`.

## Interpretation guardrails

The engine uses a single cash account and fractional shares for deterministic daily simulations. It does not model taxes, market-impact capacity, limits, halted stocks, borrow, dividends, rights issues, intraday fills, or live KRX order constraints. Set costs conservatively and disclose omitted frictions.
