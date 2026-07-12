# Data and Configuration Contract

## Daily-bar input

Pass CSV or JSON. CSV requires this header:

```text
date,ticker,name,market,open,high,low,close,volume
```

JSON may be an array of the same objects or `{ "bars": [...] }`. Dates use `YYYY-MM-DD`; prices must be positive. `market` must be exactly `KOSPI` or `KOSDAQ` for an eligible row. Keep one row per ticker/date, sorted or unsorted. Use adjusted OHLC only if every price field follows the same adjustment policy.

The engine validates the input but cannot establish point-in-time membership, delisting coverage, or adjusted-price provenance. Put those source facts in `dataNotes`.

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
