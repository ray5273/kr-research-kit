# Workflow Reference

## Inputs

- `--date YYYY-MM-DD`: as-of date. Defaults to the current Seoul date.
- Optional `--limit N`: small-universe smoke run.
- Optional `--cache-in`: existing universe cache to avoid live fetching.
- Optional `--top N`: table size, default 20.

## Execution

1. Build or reuse `.tmp/kr-market-leaders/<date>.json`.
2. Rank every eligible entry across:
   - short-term leadership: 1-day and 7-day return percentiles, volume expansion, market-relative return
   - intermediate leadership: 30-day and 60-day return percentiles, market-relative return, persistence
   - structural leadership: 120-day/252-day return percentiles, RS percentile, 52-week high proximity, Minervini-style pass count
3. Write Markdown and JSON under `analysis-example/kr-market/`.
4. Check that counts and top tables are internally consistent.

## Data Rules

- Treat the output as a technical screen.
- Do not add fundamental claims unless a later version explicitly integrates DART or financial statement data.
- Use KRX industry labels and company names only for theme hints.
- If KOSPI/KOSDAQ backdrop fetches fail, keep the report and state `산출불가`.
