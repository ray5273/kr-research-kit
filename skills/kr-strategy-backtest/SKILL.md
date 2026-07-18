---
name: kr-strategy-backtest
description: Design, backtest, and preserve reproducible KOSPI/KOSDAQ-only daily-bar trading strategies. Use when the user wants to turn a Korean-equity idea into explicit entry, exit, portfolio, and risk rules; test momentum or moving-average strategies; compare KRX strategy parameters; or save a dated backtest report with assumptions, trades, equity curve, and metrics. Do not use for live trading execution, intraday strategies, or non-Korean markets.
---

# KRX Strategy Backtest

Use daily OHLCV data for **KOSPI and KOSDAQ common shares only**. Treat every output as historical simulation, not an investment recommendation or evidence that a strategy will work live.

## Workflow

1. Turn the hypothesis into falsifiable rules: universe, signal, rebalancing cadence, sizing, exit, costs, and test period. Do not backtest a vague narrative.
2. Read [data-contract.md](references/data-contract.md) and obtain a point-in-time daily-bar file. Require `market` for every security; exclude anything other than `KOSPI` or `KOSDAQ`. Document survivorship, corporate-action, and delisting coverage.
3. Create a JSON configuration. Start with `cross-sectional-momentum` unless the user supplied a different rule set. The bundled engine supports that preset and `sma-cross`; its full schema is in [data-contract.md](references/data-contract.md).
4. Run the engine:

```bash
node skills/kr-strategy-backtest/scripts/run-kr-backtest.js \
  --bars path/to/krx-daily-bars.csv \
  --config path/to/strategy.json \
  --out-dir analysis-example/kr-market/strategies/<strategy-slug>
```

5. Read the Markdown report and inspect the equity curve, trades, missing-data count, turnover, and out-of-sample interval. Do not cherry-pick a parameter set after seeing its full-sample result. If tuning parameters, reserve a final out-of-sample period and record every attempted configuration.
6. Preserve both generated files when the workspace is writable:
   - `analysis-example/kr-market/strategies/<strategy-slug>/backtest-<YYYY-MM-DD>.md`
   - `analysis-example/kr-market/strategies/<strategy-slug>/backtest-<YYYY-MM-DD>.json`

## Standard 10-Year Comparison

For the repository's standard KOSPI/KOSDAQ trend-following comparison, run the dedicated pipeline. It downloads current ordinary-share listings, caches raw Yahoo responses plus normalized adjusted OHLCV one ticker at a time, and writes the complete two-strategy comparison:

```bash
node skills/kr-strategy-backtest/scripts/run-kr-trend-following-10y.js \
  --output-dir analysis-example/kr-market/strategies/trend-following-10y \
  --cache-dir .tmp/kr-strategy-backtest/2026-07-10 \
  --concurrency 8
```

It fixes the test window at 2016-07-11 through 2026-07-10, with 2015-07-01 as warmup, uses a 25bp one-way cost, and compares:

- 252-session momentum top 20, equal-weighted and rebalanced monthly.
- Minervini Trend Template plus KRX weighted 3/6/12-month RS percentile: top 10 passing names, equal-weighted and rebalanced monthly.
- A static 50:50 KOSPI/KOSDAQ index benchmark.
- A reconstructed **"KOSPI ex-반도체 대형주"** benchmark (default 삼성전자 005930, 삼성전자우 005935, SK하이닉스 000660): the actual KOSPI level `^KS11` with each excluded name's market-cap contribution stripped out, i.e. `M_ex(t) = K(t) − Σ wᵢ·K(T)·pᵢ(t)/pᵢ(T)`. Current index weights `wᵢ = capᵢ/총KOSPI시총` are pulled live from Naver's marketValue endpoint (all KOSPI pages summed for the denominator). This is a **current-weight, constant-share approximation** (splits handled by Yahoo adjustment; buybacks/issuance, free-float, and new listings ignored) — a comparison series, not a tradeable index. Override with `--exclude-tickers`, force the denominator with `--kospi-total-marketcap`, or skip entirely with `--no-ex-benchmark`. On any fetch failure the run drops this benchmark with a warning rather than failing. It is written to the artifact as `benchmarkExHeavies` alongside `benchmark`.

Use `--limit N` only for a technical smoke run. The result remains current-universe based and must carry the survivor-bias warning.

## Annual Top-300 point-in-time universe

The current-universe reports above are retained as the **"latest-universe
survivorship-biased baseline"**.  Do not overwrite them when running the
point-in-time comparison.  First extract a 2015–2025 workbook with
`extract_top300_marcap.py` (common shares only), then normalize it and run the
annual strategy into its separate directory:

```bash
node skills/kr-strategy-backtest/scripts/build-annual-top300-universe.js \
  --input 한국_시가총액_상위300_2015-2025.xlsx \
  --out analysis-example/kr-market/strategies/annual-top300/universe-ledger.json

node skills/kr-strategy-backtest/scripts/run-annual-top300-momentum.js \
  --universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger.json \
  --out-dir analysis-example/kr-market/strategies/annual-top300

# For a fundamental sleeve, expand the DART panel to the same annual union.
OPENDART_API_KEY=... node skills/kr-strategy-backtest/scripts/collect-dart-quarterly-panel.js \
  --annual-universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger.json
```

The snapshot at the last session of year `t` is usable only for signals in
`t+1`; thus 2015 is required for the existing 2016-07 start.  The runner stops
when an annual common-share snapshot has under 90% usable price coverage.  It
records ranking year, snapshot date, raw and filtered counts, exclusions,
selection, and the mandatory first-trading-day annual roll in the rebalancing
ledger.  Price-only runs leave DART availability null; fundamental sleeves must
exclude only missing-DART candidates and record their per-signal coverage.

For the repository's **RS + EPS/revenue + regime main strategy**, annual
reconstitution is the required universe policy.  It is not a once-off
backtest switch: append each new year-end snapshot to the ledger, then run:

```bash
node skills/kr-strategy-backtest/scripts/run-annual-top300-minervini-earnings-regime.js \
  --universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger.json \
  --out-dir analysis-example/kr-market/strategies/annual-top300
```

On the first trading session of `t+1`, this runner **sells every existing
position**, including names that remain eligible, charges the sell cost/tax,
and then rebuilds the top-10 portfolio from snapshot `t`.  Between annual
rolls it keeps the normal five-session signal/rebalance cadence.

Treat the price-only annual momentum runner as a **validation helper only**:
it verifies point-in-time membership, annual rolls, price coverage, and the
same-universe benchmark. Do not present it as the Korean default strategy or
use it to generate the model portfolio; those always use RS + EPS/revenue +
regime + volatility targeting.

### Coverage-rebuild release gate

For the reproducible 2026-07-16 rebuild or a latest-trading-day extension, use
the orchestrator rather than running individual reports against a stale cache:

```bash
OPENDART_API_KEY=... node skills/kr-strategy-backtest/scripts/rebuild-annual-top300-suite.js \
  --universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger.json \
  --cache-dir .tmp/kr-strategy-backtest/2026-07-16 \
  --end-date 2026-07-16 \
  --raw-workbook 한국_시가총액_상위300_2015-2025.xlsx
```

It refreshes the 2015-onward Yahoo cache, validates the 90% annual coverage
gate and each signal close/273-session requirement, then requires every DART
job to be either `000` or CFS+OFS-confirmed `013`.  Any unresolved network/API
record stops publication.  It archives replaced non-official artifacts below
`archive/pre-coverage-rebuild-2026-07-18/` and emits a fixed-date delta report.
Use `--end-date latest` only for the separately named latest extension.  This
orchestrator never runs or overwrites official-total-return artifacts.

## Official total-return 3,000억원 universe

The committed `annual-cap300b` raw-KRX artifacts are deliberately retained as
**corporate-action-unverified diagnostics**.  They are not an official
total-return result.  For the fixed 3,000억원 universe, first archive official
KRX raw OHLC and the official KRX/DART documents.  Finalize the
KRX/DART-cross-checked event ledger, then generate a separate cache and run
the strict mode:

```bash
node skills/kr-strategy-backtest/scripts/build-official-corporate-action-ledger.js \
  --input path/to/candidate-corporate-actions-with-archived-sources.json \
  --out path/to/krx-dart-corporate-actions.json

node skills/kr-strategy-backtest/scripts/prepare-official-total-return-cache.js \
  --input path/to/official-krx-raw-prices.json \
  --event-ledger path/to/krx-dart-corporate-actions.json \
  --out-cache .tmp/kr-strategy-backtest/official-total-return

node skills/kr-strategy-backtest/scripts/run-annual-top300-minervini-earnings-regime.js \
  --universe annual-cap300b \
  --price-mode official-total-return \
  --strict-events \
  --universe-file analysis-example/kr-market/strategies/annual-cap300b/universe-ledger-yearend-cap300b-2015-2025.json \
  --price-cache .tmp/kr-strategy-backtest/official-total-return \
  --event-ledger path/to/krx-dart-corporate-actions.json \
  --calendar-security-id KOSPI_INDEX \
  --compare-universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json \
  --out-dir analysis-example/kr-market/strategies/official-total-return
```

`--strict-events` is mandatory.  The run fails before writing any successful
result when a relevant action is unverified, a delisting consideration is
missing, the official price contract is incomplete, or any annual snapshot has
under 90% usable price coverage.  The cache records `rawOHLC`,
`totalReturnOHLC`, `adjustmentFactor`, persistent `securityId`, event
references, and its verification status.  The runner applies events to actual
cash/shares/successor securities while using total-return OHLC only for
signals.  It writes solely under `official-total-return`; never overwrite the
Yahoo or raw-KRX diagnostics.

## Tracking the ex-heavyweights index on its own

To follow the "KOSPI minus 삼성전자·삼성전자우·SK하이닉스" index over time **without** the full ~2,470-ticker run, use the standalone tracker. It fetches only `^KS11` and the excluded tickers from Yahoo, sources weights from Naver (with a committed market-cap snapshot as an offline fallback), and reuses the same `reconstructExKospi` engine:

```bash
node skills/kr-strategy-backtest/scripts/track-ex-kospi-index.js \
  --years 5 \
  --output-dir analysis-example/kr-market/strategies/ex-kospi-index \
  --log analysis-example/kr-market/strategies/ex-kospi-index/history.ndjson
```

Each run writes a dated `ex-kospi-index-<end>.json` + `.md` snapshot in **actual index points** (KOSPI level, ex-heavyweights contribution, and the semiconductor contribution in points and %), plus the standard return/vol/Sharpe/MDD metrics. Passing `--log` appends the latest reading to an NDJSON file so the level and return can be tracked across scheduled runs. Weight sourcing precedence: `--kospi-total-marketcap` override → live Naver → `--weights-from-snapshot` (auto-fallback when Naver is unreachable; use `--no-naver` to force it). Override the excluded set with `--exclude-tickers`, or the window with `--start`/`--end`. This output is index-level public data only — no holdings — so it is safe to commit. It carries the same current-weight/constant-share approximation and survivor-bias caveats as the benchmark.

## Alternative Factor Studies

Four validated non-momentum factor backtests share one core module,
[scripts/lib/factor-backtest-core.js](scripts/lib/factor-backtest-core.js)
(fixed 10y frame, top-300 ordinary universe, month-end -> next-open, 25bp,
50:50 benchmark, and the extended point-in-time DART panel reader with net
income / CFO / total & current liabilities / current assets). They reuse the
existing price cache and DART quarterly panel, so no extra fetch is needed.
Each takes `--limit N` for a smoke run and writes a JSON+MD pair into
`analysis-example/kr-market/strategies/trend-following-10y/`.

```bash
node skills/kr-strategy-backtest/scripts/backtest-kr-low-volatility.js         # low-vol factor (Baker-Haugen / BAB); vol as stock picker, not overlay
node skills/kr-strategy-backtest/scripts/backtest-kr-value-momentum.js         # E/P + B/P value x momentum (Asness); includes an E/P-only variant
node skills/kr-strategy-backtest/scripts/backtest-kr-piotroski.js              # 9-point F-score quality screen (Piotroski 2000)
node skills/kr-strategy-backtest/scripts/backtest-kr-short-term-reversal.js    # 1-month cross-sectional reversal (Jegadeesh 1990)
node skills/kr-strategy-backtest/scripts/backtest-kr-combined-sleeves.js       # 50:50 momentum+low-vol / momentum+value blends; tests diversification for real
node skills/kr-strategy-backtest/scripts/quantify-survivorship.js              # winner-removal lower bound on the survivorship premium
node skills/kr-strategy-backtest/scripts/report-alternative-factors-comparison.js  # regenerates the consolidated comparison from the JSONs
```

Each backtest has a `test-<slug>.js` smoke driver asserting the holdings cap,
next-open execution (no look-ahead), factor ranges, the dual benchmark, the sell
tax, and input-hash presence.

The cost/benchmark model is deliberately conservative (a CEO-review pass tightened it):
- **Costs:** buy 25bp; sell 25bp **plus the 0.18% Korea securities transaction tax** (`SELL_TAX` in the lib). High-turnover strategies are penalized honestly.
- **Two benchmarks per report:** the `^KS11`/`^KQ11` 50:50 **price index** (excludes dividends — an understated lower bar) and an **equal-weight total-return universe** benchmark built from the same adjusted prices (dividend-inclusive but carries a size tilt + survivorship — an overstated upper bar). Judge strategies against the range.
- **Multiple-testing hurdle + CI:** every report carries a monthly-block bootstrap CI and a Deflated Sharpe hurdle (`deflatedSharpeNote`) for ~50 configurations tried.

Corrected takeaways (against the fair total-return benchmark, CAGR ~21% / Sharpe ~0.92):
- **Value E/P is the most robust standalone factor** — clears the fair benchmark and the deflated-Sharpe hurdle, and is nearly immune to survivorship (winner-removal premium ~1%p vs momentum's ~11%p). The clean E/P beats the E/P+B/P composite (the shares-derived B/P adds noise).
- **Low-vol earns its keep only in combination:** momentum+low-vol 50:50 lifts Sharpe (1.26 -> 1.29) and cuts MDD (-41% -> -32%) — diversification confirmed by the combined-sleeves run, not just inferred from correlation.
- **Reversal and large-cap Piotroski do not survive** realistic costs / the fair benchmark. Momentum's headline CAGR is substantially a survivorship artifact.

Every report must keep the survivorship-bias + omitted-friction disclaimer.

## Engine Rules

- Compute signals from each session's close and place the rebalance at the next available session's open. Never use same-close execution.
- Apply `commissionBps` and `slippageBps` to every traded notional. Keep uninvested capital as cash.
- Use split- and dividend-adjusted history only when the source explicitly says so. The engine does not repair corporate actions.
- Report a result as invalid or limited when the source is a current constituent list, omits delisted securities, lacks a corporate-action policy, or has material date gaps. Do not call it a survivorship-bias-free backtest.
- For any comparison, hold the universe, dates, cost model, and evaluation metric fixed.

## Deliverable Standard

Read [report-contract.md](references/report-contract.md) before interpreting results. The written conclusion must include the hypothesis, exact data coverage, precommitted parameters, costs, execution timing, in-sample/out-of-sample split, key performance metrics, and failure modes. Show both `result` and `limitations`; never present CAGR or Sharpe alone.
