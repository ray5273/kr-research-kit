---
name: kr-analyst-report-watch
description: Monitor newly published Korean sell-side analyst reports in daily or weekly mode, summarize the Top N public brokerage reports, compare topic narratives against prior report-watch outputs, and write Markdown/JSON artifacts under analysis-example/kr-reports/.
---

# Korean Analyst Report Watch

Use this skill when the user wants a daily or weekly watch of Korean securities analyst reports across companies, sectors, or themes, without starting from a single ticker.

## Workflow

1. Read [references/workflow.md](references/workflow.md) for collection, comparison, and copyright rules.
2. Read [references/output-format.md](references/output-format.md) before writing or reviewing final artifacts.
3. Run the collector in the requested cadence:

   ```bash
   node skills/kr-analyst-report-watch/scripts/discover-watch-reports.js \
     --mode daily \
     --date YYYY-MM-DD \
     --max-reports 10 \
     --output .tmp/kr-analyst-report-watch/raw-daily-YYYY-MM-DD.json
   ```

   Weekly mode defaults to Top 30:

   ```bash
   node skills/kr-analyst-report-watch/scripts/discover-watch-reports.js \
     --mode weekly \
     --date YYYY-MM-DD \
     --max-reports 30 \
     --output .tmp/kr-analyst-report-watch/raw-weekly-YYYY-MM-DD.json
   ```

4. The script writes final artifacts unless `--no-artifacts` is passed:
   - `analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md`
   - `analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.json`
   - `analysis-example/kr-reports/report-watch-weekly-YYYY-MM-DD.md`
   - `analysis-example/kr-reports/report-watch-weekly-YYYY-MM-DD.json`
5. In chat, provide only a short summary: mode/date, number of reports, top narrative changes, and any source gaps. Do not paste long report excerpts.

## Defaults

- Source scope: Korean securities reports only.
- Cadence: `daily` or `weekly`; default is `daily`.
- Depth: daily Top 10, weekly Top 30 unless overridden by `--max-reports`.
- Source order: Hankyung Consensus first, Naver Research fallback/secondary.
- Priority: narrative changes in industry trend, demand/supply, policy, competition, risk framing, and catalysts.

## Validation

Run before considering changes complete:

```bash
node --check skills/kr-analyst-report-watch/scripts/discover-watch-reports.js
node skills/kr-analyst-report-watch/scripts/test-report-watch.js
```
