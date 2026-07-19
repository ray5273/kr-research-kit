# WRDS point-in-time input contract

`run-top500-minervini.js` accepts CSV, JSON-array, or Parquet files. Parquet decoding uses Python `pyarrow`; export as CSV if `pyarrow` is unavailable. Input paths may remain outside the repository, but output paths must be inside the intended analysis artifact directory.

The runner does not download prices, listings, or fundamentals. It stops on a missing required field, duplicate `PERMNO/date`, invalid dates, missing CRSP name history, insufficient benchmark warm-up, ambiguous effective CCM links, or invalid numeric values.

## Required inputs

|CLI argument|WRDS source|Required canonical fields|Notes|
|---|---|---|---|
|`--prices`|CRSP daily stock file|`permno,date,prc,openprc,ret,shrout,exchcd,shrcd`|Optional `dlret`. `SHROUT` is assumed in thousands unless config overrides `sharesOutstandingScale`.| 
|`--names`|CRSP names history|`permno,namedt,nameendt`|Optional `ticker`/`tsymbol`, `permco`. An effective row is required at every candidate signal date.| 
|`--ccm`|CRSP/Compustat Merged link history|`lpermno` (or `permno`), `gvkey,linkdt,linkenddt`|Optional `linktype,linkprim`. Overlapping effective links to different GVKEYs fail the run.| 
|`--fundamentals`|Compustat quarterly fundamentals|`gvkey,datadate,rdq,saleq` and one of `epsfxq,epsfiq,epspxq,diluted_eps`|`RDQ` is the disclosure date. Do not substitute an availability date observed today.| 
|`--spy`|CRSP daily SPY series|`date,prc,ret`|Use the same CRSP total-return convention. Optional `dlret,openprc`.| 

Aliases shown in the source code are accepted so a standard WRDS export can be used without a destructive rewrite. All dates must be ISO (`YYYY-MM-DD`) or begin with that form.

## Point-in-time semantics

- On each signal date, the runner filters that day's CRSP row to `EXCHCD ∈ {1,2,3}` (NYSE, NYSE American/AMEX, NASDAQ) and `SHRCD ∈ {10,11}` (common shares). It ranks `abs(PRC) × SHROUT × sharesOutstandingScale`, then keeps the top 500. It does not begin from a current listing file.
- A price requires 252 prior sessions. `RET` is compounded into a CRSP total-return price for signal/portfolio valuation so strategy and SPY use the same distribution convention; raw `|PRC|` remains the market-cap input. The Minervini template uses 50/150/200-day averages, the 52-week high/low rules, and a rising 200-day average; 3/6/12-month RS is weighted 40/30/30.
- The latest quarterly row is available only on the first market session strictly after `RDQ`, plus `fundamentalAvailabilityLagSessions - 1` more sessions. The default lag is one session. Sales and diluted EPS YoY/QoQ changes are percentile-ranked cross-sectionally and combined with price score at 50/50.
- Signals at close execute at the next supplied CRSP open. The strategy is long-only, fractional-share, no-leverage; 10bp one-way cost is the default.
- SPY regime reads the prior session only: above 200-day SMA × 1.03 turns risk-on; below × 0.97 turns risk-off; the interval preserves the previous state. Trailing 60 realised portfolio volatility caps exposure at 18% annualised by default.
- A held CRSP row with `DLRET` liquidates at `close × (1 + DLRET)` exactly once. Since CRSP's ordinary `RET` excludes delisting return, the economic convention is `(1 + RET) × (1 + DLRET) - 1`.

## Configuration

See [the runnable template](../../../examples/us-strategy-backtest/wrds-pit-config.example.json). Defaults are fixed to the approved study dates: 2016-07-18 through 2026-07-16, with OOS starting 2024-07-17. Omit `cadence` for both weekly and monthly outputs; set it only to `weekly` or `monthly` for a single run.

## Output contract

For each cadence, the runner writes:

- `weekly-backtest-2026-07-16.{json,md}` or `monthly-backtest-2026-07-16.{json,md}`: full strategy/benchmark equity, metrics, holdings, trades, delistings, warnings, coverage and source-file SHA-256 manifest.
- `weekly-universe-ledger-2026-07-16.json` or monthly equivalent: every rebalance's point-in-time top-500 members, ranks, exclusion reasons, selected names, regime state, and RDQ-derived availability dates.

The Markdown report compares strategy and SPY on exactly the same dates and total-return convention, separates the fixed OOS interval, and includes annual results, trade samples, monthly top-10 snapshots, delisting count, coverage, and limitations.
