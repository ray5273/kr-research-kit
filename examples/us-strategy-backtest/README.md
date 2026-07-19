# WRDS point-in-time U.S. Top-500 backtest template

This is the configuration template for the CRSP/Compustat implementation. Copy it, retain the fixed dates unless deliberately running a new pre-committed study, then provide the five WRDS extracts described in the [input contract](../../skills/us-strategy-backtest/references/pit-wrds-data-contract.md).

```bash
node skills/us-strategy-backtest/scripts/run-top500-minervini.js \
  --config examples/us-strategy-backtest/wrds-pit-config.example.json \
  --prices /path/to/crsp-dsf.csv --names /path/to/crsp-names.csv \
  --ccm /path/to/ccm-links.csv --fundamentals /path/to/compustat-fundq.csv \
  --spy /path/to/spy-crsp.csv \
  --out-dir analysis-example/us-market/strategies/us-minervini-earnings-regime-pit
```

No report is committed here because licensed WRDS input files are not present in this repository. The command produces the weekly/monthly Markdown and JSON results plus point-in-time universe ledgers when those inputs are supplied.
