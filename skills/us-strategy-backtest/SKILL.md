---
name: us-strategy-backtest
description: Run reproducible daily-bar backtests for U.S.-listed common-stock strategies and save Korean Markdown and JSON records. Use the WRDS CRSP/Compustat point-in-time mode when the user supplies CRSP, CCM, Compustat, and CRSP SPY extracts and needs delisting-complete historical membership. The Yahoo mode is not point-in-time. Do not use for live execution, intraday trading, ETFs, ADRs, or shorting.
---

# U.S. Equity Strategy Backtest

Treat every result as a historical simulation, never an investment recommendation. For a Korea-resident investor, a U.S. result is incomplete until it has the Korean-investor overlay described below. There are two intentionally separate modes:

- `run-us-backtest.js`: adjusted Yahoo Finance daily prices as a dividend-inclusive **total-return proxy**. It is useful for generic research but cannot make point-in-time or delisting-complete claims.
- `run-top500-minervini.js`: offline WRDS CRSP/Compustat mode. It is the required path for the Point-in-Time U.S. Top-500 Minervini + earnings + regime study. It never falls back to Yahoo or a current listing file.

## Workflow

1. Create a JSON configuration from [data-contract.md](references/data-contract.md). Precommit dates and an out-of-sample start before inspecting results.
2. Prefer a user-supplied historical universe for controlled studies. `--auto-universe` uses today's Nasdaq Trader listings and is necessarily survivorship-biased; it is not point-in-time or delisting-complete.
3. Run the engine. It caches raw provider responses, calculates signals on adjusted closes, and executes at the next available adjusted open.

```bash
node skills/us-strategy-backtest/scripts/run-us-backtest.js \
  --config path/to/strategy.json \
  --auto-universe \
  --cache-dir .tmp/us-strategy-backtest/$(date +%F) \
  --out-dir analysis-example/us-market/strategies/<strategy-slug>
```

For a controlled universe use `--universe universe.csv` (or JSON) instead of `--auto-universe`. See the data contract for the schema.

4. Preserve the generated pair in `analysis-example/us-market/strategies/<strategy-slug>/`:

   - `backtest-<YYYY-MM-DD>.json` — source of record
   - `backtest-<YYYY-MM-DD>.md` — Korean review report

5. Read [report-contract.md](references/report-contract.md) before interpreting a result. Inspect missing bars, liquidity exclusions, warnings, turnover, and the OOS table. Do not tune parameters on the complete period and report only the winner.

## Required Korea-Resident Overlay

For this workspace's U.S. strategy outputs, use the following default treatment unless the user explicitly requests a different tax residence or cost schedule:

- Set one-way all-in trading cost to **20bp**. The annual-ranking runner now defaults to this value.
- Reserve **22%** capital-gains tax after the annual KRW 2.5m allowance. Label it an estimate, not a filed-tax amount.
- Convert only fresh KRW contributions at their contribution-date USD/KRW rate. Existing USD cash and positions remain in USD; do not charge FX conversion on every rebalance.
- Mark the strategy in KRW at daily USD/KRW and state that an exact filing requires transaction-date statutory FX, actual tax lots, realized gains/losses across all accounts, and broker fee records.

Run the overlay after the USD strategy result. `usdkrw.csv` requires `date,usdkrw`; `contributions.csv` optionally requires `date,krw`. If contributions are omitted, the initial KRW amount is converted on the first strategy session.

```bash
node skills/us-strategy-backtest/scripts/apply-korean-investor-overlay.js \
  --result analysis-example/us-market/strategies/<strategy>/weekly-result.json \
  --fx data/usdkrw-daily.csv \
  --initial-krw 100000000 \
  --fx-cost .001 \
  --out analysis-example/us-market/strategies/<strategy>/weekly-result.korean-net.json
```

## Engine Rules

- Include only NASDAQ, NYSE, and NYSE American common shares from the automatic listing files. Exclude ETFs, ADRs, preferreds, warrants, rights, units, test issues, OTC, and unclassifiable listings.
- Normalize `open`, `high`, `low`, and `close` with `adjClose / close`. Apply the same convention to SPY.
- Use close-based signals and the next available session’s adjusted open. Use fractional shares, equal weights, long-only positions, no leverage, and cash for unused allocation.
- In the annual-ranking Korea-resident profile, charge 20 bp all-in one-way trading cost by default; use the Korean-investor overlay for tax and USD/KRW reporting. The generic engine's config may specify a different cost only when documented. Require adjusted close of at least $5 and trailing-20-session average dollar volume of at least $1m at each signal/rebalance.
- Keep a held security with no current bar at its last valid adjusted-close valuation and emit a warning; do not fabricate a fill.
- State that Yahoo adjusted history is a proxy and that automatic listings have survivorship bias. Delistings, point-in-time membership, taxes, borrow, market impact, and intraday execution are out of scope.

## Point-in-Time Top-500 WRDS mode

Read [pit-wrds-data-contract.md](references/pit-wrds-data-contract.md) before running this mode. It validates the input files and fails rather than silently substituting a current universe, a current identifier, or a post-signal filing.

```bash
node skills/us-strategy-backtest/scripts/run-top500-minervini.js \
  --config examples/us-strategy-backtest/wrds-pit-config.example.json \
  --prices /secure/wrds/crsp-dsf.csv \
  --names /secure/wrds/crsp-dsenames.csv \
  --ccm /secure/wrds/ccm-link.csv \
  --fundamentals /secure/wrds/compustat-fundq.csv \
  --spy /secure/wrds/spy-crsp-daily.csv \
  --out-dir analysis-example/us-market/strategies/us-minervini-earnings-regime-pit
```

Omit `cadence` in the config to generate both `weekly` (5 sessions) and `monthly` (21 sessions). The output directory receives each cadence's Markdown/JSON result and a separate universe ledger containing every signal date's top-500 membership, market-cap rank, exclusions, selected holdings, and fundamental availability dates.
