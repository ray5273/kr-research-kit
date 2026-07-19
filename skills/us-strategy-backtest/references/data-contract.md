# Data and Configuration Contract

## Config

```json
{
  "name": "us-momentum-12m-top20",
  "strategy": { "type": "cross-sectional-momentum" },
  "startDate": "2016-07-01",
  "endDate": "2026-07-15",
  "outOfSampleStart": "2024-07-01",
  "initialCapital": 1000000,
  "tradingCostBps": 10,
  "minAdjustedClose": 5,
  "minAverageDollarVolume": 1000000
}
```

Required fields are `name` and `strategy.type`. Defaults: `initialCapital` $1,000,000, `tradingCostBps` 10, `minAdjustedClose` $5, `minAverageDollarVolume` $1,000,000, and a 20-session liquidity window.

`cross-sectional-momentum` defaults to `lookbackDays: 252`, `topN: 20`, `rebalanceEvery: 21`. It ranks the close-to-close adjusted return. `sma-cross` defaults to `fastDays: 50`, `slowDays: 200`, `maxPositions: 20`, `rebalanceEvery: 21`; it owns names with fast SMA strictly above slow SMA, ranked by fast/slow ratio.

## User universe

Pass CSV or JSON (`[{...}]` or `{ "symbols": [{...}] }`) with at least `ticker`. Optional `name`, `exchange`, and `securityType` are preserved as metadata. A user file controls only membership; it is not automatically proof of historical point-in-time membership or delisting coverage. The automatic universe records raw-listing hashes and filter exclusions.

Cached raw Yahoo chart JSON and Nasdaq listing files are retained locally only. The output JSON includes paths, SHA-256 hashes, fetch times, provider URLs, and normalized-bar counts so a run can be audited without committing the cache.
