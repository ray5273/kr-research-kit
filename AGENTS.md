# AGENTS

## External Agent Targets

- A request referring to the **Hermes agent** means the remote Hermes runtime at `sanghyeok@192.168.50.252` unless the user explicitly names another target.
- Inspect the remote runtime and its active configuration before changing Hermes behavior. Keep source and the installed `~/.hermes` runtime copy aligned when a scheduled Hermes script is changed.

## Repository Rules

- When you add or update a stock analysis example, keep it under `analysis-example/<market>/<company>/`.
- When a stock-analysis skill is invoked in this repo and the workspace is writable, create or update the matching report file under `analysis-example/<market>/<company>/memo.md` instead of leaving the analysis only in chat.
- When you add a new example file, update `README.md` with a direct markdown link to it.
- When a commit changes a skill's required output shape, refresh any affected example documents so they still match the current skill behavior.
- When an example document embeds a chart image, refresh the linked PNG asset together with the markdown file so the visual stays in sync with the text.
- When you update an existing Korean memo with follow-up analysis, preserve the original `기준일`, refresh `최근 업데이트일`, and append or replace a dated block under `## Update Log` instead of rewriting the whole memo by default.
- For dated follow-up updates, search only for company-specific disclosures, IR materials, and news published after the memo's `기준일`, then deduplicate against existing update dates and source URLs when possible.
- Treat example analysis documents as time-sensitive. Before committing changes to an example document, refresh prices, valuation metrics, disclosures, and source dates with current sources.
- If the example must mix metrics from sources with different refresh cadences, keep the document honest by stating the exact date for each metric block or row.
- Do not invent revenue mix, customer concentration, governance facts, or valuation metrics that are not disclosed in the current source set. State what is not separately disclosed.
- Do not invent foreign-IB views. Every `## Street / Alternative Views` bullet that names a foreign broker, rating, or target price must trace back to a dated Korean news article that quoted that broker; prefer `kr-foreign-analyst` output over paraphrasing from memory.
- Prefer primary sources first for Korean stocks: DART, KRX disclosures, company IR pages, governance pages, and official financial statements.
- When the memo needs sell-side consensus (target price, rating distribution, broker coverage), use the analyst-report chain (`kr-analyst-report-discover` → `kr-analyst-report-fetch` → `kr-analyst-report-insight`). It pulls reports from `consensus.hankyung.com` (primary) with `finance.naver.com/research` as fallback, defaults to a 365-day lookback, and skips login-gated reports. Treat the resulting `analyst-report-insight.md` digest as sell-side inference, not a primary filing fact — it lands in `analysis-example/kr/<company>/` and is ingested into `kr-stock-data-pack`'s `External Views` with `Source role: sell-side consensus`.
