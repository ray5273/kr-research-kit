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

## Tracking the ex-heavyweights index on its own

To follow the "KOSPI minus 삼성전자·삼성전자우·SK하이닉스" index over time **without** the full ~2,470-ticker run, use the standalone tracker. It fetches only `^KS11` and the excluded tickers from Yahoo, sources weights from Naver (with a committed market-cap snapshot as an offline fallback), and reuses the same `reconstructExKospi` engine:

```bash
node skills/kr-strategy-backtest/scripts/track-ex-kospi-index.js \
  --years 5 \
  --output-dir analysis-example/kr-market/strategies/ex-kospi-index \
  --log analysis-example/kr-market/strategies/ex-kospi-index/history.ndjson
```

Each run writes a dated `ex-kospi-index-<end>.json` + `.md` snapshot in **actual index points** (KOSPI level, ex-heavyweights contribution, and the semiconductor contribution in points and %), plus the standard return/vol/Sharpe/MDD metrics. Passing `--log` appends the latest reading to an NDJSON file so the level and return can be tracked across scheduled runs. Weight sourcing precedence: `--kospi-total-marketcap` override → live Naver → `--weights-from-snapshot` (auto-fallback when Naver is unreachable; use `--no-naver` to force it). Override the excluded set with `--exclude-tickers`, or the window with `--start`/`--end`. This output is index-level public data only — no holdings — so it is safe to commit. It carries the same current-weight/constant-share approximation and survivor-bias caveats as the benchmark.

## Engine Rules

- Compute signals from each session's close and place the rebalance at the next available session's open. Never use same-close execution.
- Apply `commissionBps` and `slippageBps` to every traded notional. Keep uninvested capital as cash.
- Use split- and dividend-adjusted history only when the source explicitly says so. The engine does not repair corporate actions.
- Report a result as invalid or limited when the source is a current constituent list, omits delisted securities, lacks a corporate-action policy, or has material date gaps. Do not call it a survivorship-bias-free backtest.
- For any comparison, hold the universe, dates, cost model, and evaluation metric fixed.

## Deliverable Standard

Read [report-contract.md](references/report-contract.md) before interpreting results. The written conclusion must include the hypothesis, exact data coverage, precommitted parameters, costs, execution timing, in-sample/out-of-sample split, key performance metrics, and failure modes. Show both `result` and `limitations`; never present CAGR or Sharpe alone.
