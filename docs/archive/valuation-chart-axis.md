# Valuation Chart Axis Rules

`skills/kr-stock-analysis/scripts/valuation-chart.js` uses different y-axis policies by metric.

- `P/E` and `P/B` anchor the y-axis at `0`.
- `P/E` and `P/B` choose a readable tick interval automatically with a `1 / 2 / 5` step progression.
- `P/E` and `P/B` round the top of the axis up to the next tick so the highest observation does not sit on the border.
- `EV/EBITDA` keeps the existing padded-range behavior.

This keeps `P/E` and `P/B` charts visually grounded while preserving the older `EV/EBITDA` view.
