---
name: kr-market-leaders
description: Screen the integrated KOSPI + KOSDAQ universe for Korean market leadership across short-term, intermediate, and structural technical lenses. Use when the user asks for KRX market leaders, market-wide relative strength, Korean leading stocks, short-term movers, 30/60-day leaders, 52-week-high leadership, or Minervini-style market leadership screening.
---

# Korean Market Leaders

Use this skill for market-wide KRX leadership screens. It is price/volume-derived only and must not imply fundamental leadership, broker support, or buy recommendations.

## Workflow

1. Read [references/workflow.md](references/workflow.md) for the run checklist.
2. Run `scripts/screen-kr-market-leaders.js` with `node`.
3. Write both standard artifacts when the workspace is writable:
   - `analysis-example/kr-market/leaders-<YYYY-MM-DD>.md`
   - `analysis-example/kr-market/leaders-<YYYY-MM-DD>.json`
4. Return a compact summary with the output paths, universe counts, failed fetch count, and the highest-ranked names by lens.

## Default Universe

- Integrated `KOSPI + KOSDAQ` ordinary common stocks.
- Exclude ETFs, ETNs, SPACs, REITs, preferred shares, and obvious non-common listings through the shared `kr-stock-chart` KRX listing filter.
- Reuse the enriched `kr-stock-chart/scripts/build-kr-universe-rs-cache.js` cache. Existing `return63`, `return126`, `return252`, and `rsPercentile` fields remain the compatibility contract.

## Standard Command

```bash
node skills/kr-market-leaders/scripts/screen-kr-market-leaders.js --date YYYY-MM-DD
```

Useful options:

- `--limit 30` for a small smoke run.
- `--cache-in path/to/cache.json` to render from an existing or synthetic cache without live network fetches.
- `--json-out path` and `--md-out path` to override standard output paths.
- `--top 20` to control table size.

## Operating Rules

- Always show all three lenses: short-term, intermediate, and structural.
- Label weak data rather than filling gaps.
- Infer themes only from KRX industry labels or company names.
- Include the warning that this is a technical/market-leadership screen, not a buy recommendation.
- Use exact 기준일 and generated timestamp.
