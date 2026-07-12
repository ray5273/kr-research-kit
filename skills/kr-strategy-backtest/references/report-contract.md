# Backtest Report Contract

The generated Markdown must contain:

1. Strategy identity, generation timestamp, file hashes, and exact date range.
2. Hypothesis plus mechanical signal, universe, execution timing, sizing, and costs.
3. Data-quality table: eligible markets, rows, symbols, first/last dates, source notes, and warnings.
4. Result table: ending equity, total return, CAGR, annualized volatility, Sharpe (risk-free rate fixed at zero), maximum drawdown, completed-month win rate, trade count, and turnover.
5. In-sample/out-of-sample result tables when `outOfSampleStart` is supplied.
6. First/last trade samples, equity-curve sample, and the full paths to the JSON artifact.
7. Limitations: point-in-time universe and delisting status, corporate-action policy, omitted market frictions, and the fact that results are not a recommendation.

The JSON artifact is the source of record. It must retain the normalized config, input hash, summaries, daily equity, trade ledger, warnings, and eligible universe.
