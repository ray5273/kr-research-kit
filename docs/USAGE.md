# Usage — Prompt Catalog

Signature prompts for every shipped skill, in both Codex (`$skill`) and Claude Code (`/skill`) form.

## Codex

```text
Use $us-stock-analysis for NVDA and write a dated investment memo with valuation, catalysts, risks, and chart context.
```

```text
Use $us-sec-analysis for AAPL and create a Korean SEC evidence pack from the latest 10-K and 10-Q with XBRL companyfacts, MD&A, Risk Factors, latest 8-K metadata, and a Source Map under analysis-example/us/Apple/sec-analysis.md.
```

```text
Use $us-sec-analysis for MSFT, build sec-reference.md and sec-cache.json from the latest 10-K filing text and SEC companyfacts, then hand the evidence pack to $us-stock-analysis for a dated memo.
```

```text
Use $kr-stock-plan as the entry point for 064400.KS. First ask what I actually need, lock the ticker, share class, horizon, output mode, and key questions, treat my main question as the priority lens, then continue through the downstream Korean stock workflow automatically unless I ask for plan only.
```

```text
Use $kr-stock-dart-analysis for LG CNS and extract a filing-grounded summary covering the latest quarterly or half-year revenue, operating profit, segment differences, customer concentration, and any standalone-quarter derivations needed from cumulative DART figures.
```

```text
Use $kr-stock-dart-analysis to check a Korean company's disclosed order backlog, compare it with same-basis annual revenue, and report backlog coverage in Korean with clear source mapping and an explicit note that the ratio is derived rather than a formally disclosed KPI.
```

```text
Use $kr-stock-dart-analysis to list every disclosed single-sales or supply contract for a Korean company over the last 12 months, keeping original notices, amendments, counterparties, amounts, sales ratios, contract periods, and latest status visible row by row.
```

```text
Use $kr-stock-dart-analysis to list every disclosed single-sales or supply contract for a Korean company and add a maturity table showing how much of the current effective contract amount ends by 2027, by 2028, and by each later year, clearly labeled as contract-period coverage rather than formal backlog unless the filing discloses backlog.
```

```text
Use $kr-stock-data-pack for LG CNS and gather a dated company fact pack with price context, filings, latest results, governance facts, valuation inputs, chart inputs, and outside-view inputs from sell-side or specialist media.
```

```text
Use $kr-trade-flow-analysis for 엘앤에프(066970). Normalize my customs/KITA/UN Comtrade CSVs into analysis-example/kr/엘앤에프/trade-flow-data.json, then write trade-flow-analysis.md that separates confirmed disclosure from Trade Flow Inference and scores whether China NCM shipment growth can be a high-confidence inference after checking peers, 1Q revenue, and disclosed contract scale.
```

```text
Use $kr-stock-analysis for 005930.KS and write a decision memo with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
Use $kr-stock-update to refresh analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news published after the memo date. Preserve 기준일, update the dated Update Log block by default, and synchronize only gated thesis sections if the evidence changes the memo stance.
```

```text
Use $kr-analyst-report-watch in daily mode for today's Korean brokerage report flow. Summarize the Top 10 public reports, compare topic narratives against prior report-watch artifacts, and write analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md and .json.
```

```text
Use $kr-analyst-report-watch in weekly mode for this week's Korean brokerage report flow. Summarize the Top 30 public reports and highlight industry trend, demand/supply, policy, competition, risk, and catalyst narrative changes.
```

```text
Use $kr-daily-market-news to create today's Korean daily market-news report for blog publication. Read watchlist from examples/kr/daily-watchlist.json, use official Korean market/disclosure sources first where available and Naver News second, write analysis-example/kr-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish to publish in scheduled mode only if validation passes.
```

```text
Use $us-daily-market-news to create today's U.S. daily market-news report for blog publication. Read watchlist from examples/us/daily-watchlist.json for compatibility, use U.S. RSS article URLs plus Google News RSS discovery signals, write analysis-example/us-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish to publish in scheduled mode only if validation passes.
```

```text
Use $kr-portfolio-monitor to scan current Kiwoom-supported KRX holdings, compute SMA20 deviation and RSI14, and write the snapshot to analysis-example/kr/portfolio-snapshot.md.
```

```text
Use $kr-sector-plan to scope a Korea data center sector report into a clean research brief with clear boundaries, key questions, and the right output mode.
```

```text
Use $kr-sector-data-pack to gather a Korea-focused fact pack for the waste-battery sector with dated policy events, market metrics, and representative listed companies.
```

```text
Use $kr-sector-analysis to write a Korea security-operations market report with market definition, drivers, constraints, value chain, regulation, company map, and source-dated facts.
```

```text
Use $kr-sector-compare to compare Korean robotics and smart-factory sectors on a same-date basis and explain which setup has the cleaner listed-company exposure.
```

```text
Use $kr-sector-audit to review analysis-example/kr-sector/국내 데이터센터.md for unsupported market claims, stale dates, and overstated listed-company exposure.
```

```text
Use $kr-sector-update to update analysis-example/kr-sector/국내 데이터센터.md with policy, regulation, and company developments published after the memo date, and append a dated update block.
```

## Claude Code

```text
/us-stock-analysis write a dated investment memo for NVDA with valuation, catalysts, risks, and chart context.
```

```text
/us-sec-analysis create a Korean SEC evidence pack for AAPL from the latest 10-K and 10-Q with XBRL companyfacts, MD&A, Risk Factors, latest 8-K metadata, and a Source Map.
```

```text
/us-sec-analysis build sec-reference.md and sec-cache.json for MSFT from the latest 10-K, then use /us-stock-analysis to turn the evidence pack into a dated memo.
```

```text
/kr-stock-plan use 064400.KS as the entry point, ask what I actually need first, lock the ticker, share class, horizon, output mode, and key questions, treat my main question as the priority lens, then continue through the downstream Korean stock workflow automatically unless I ask for plan only.
```

```text
/kr-stock-dart-analysis extract a filing-grounded summary for LG CNS covering the latest quarterly or half-year revenue, operating profit, segment differences, customer concentration, and any standalone-quarter derivations needed from cumulative DART figures.
```

```text
/kr-stock-dart-analysis list all disclosed single-sales or supply contracts for a Korean company over the last 12 months, keeping original notices, amendments, counterparties, amounts, sales ratios, contract periods, and latest status visible row by row.
```

```text
/kr-stock-dart-analysis list all disclosed single-sales or supply contracts for a Korean company and add a maturity table showing how much current effective contract amount ends by 2027, by 2028, and by each later year, clearly labeled as contract-period coverage rather than formal backlog unless the filing discloses backlog.
```

```text
/kr-stock-data-pack gather a dated company fact pack for LG CNS with price context, filings, latest results, governance facts, valuation inputs, chart inputs, and outside-view inputs from sell-side or specialist media.
```

```text
/kr-trade-flow-analysis normalize customs/KITA/UN Comtrade CSVs for 엘앤에프 into trade-flow-data.json, then create trade-flow-analysis.md with evidence grades that separate confirmed disclosure from Trade Flow Inference.
```

```text
/kr-stock-analysis analyze 005930.KS with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
/kr-stock-update update analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news after the memo date. Preserve 기준일, update the dated Update Log block by default, and synchronize only gated thesis sections if the evidence changes the memo stance.
```

```text
/kr-analyst-report-watch run daily mode for today's Korean brokerage report flow, write analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md and .json, and summarize the Top 10 narrative changes.
```

```text
/kr-analyst-report-watch run weekly mode for this week's Korean brokerage report flow and highlight topic-by-topic narrative changes versus prior watch artifacts.
```

```text
/kr-daily-market-news create today's Korean daily market-news report for blog publication from examples/kr/daily-watchlist.json, then hand the generated analysis-example/kr-market/naver-publish-YYYY-MM-DD.json manifest to /kr-naver-blog-publish scheduled mode.
```

```text
/us-daily-market-news create today's U.S. daily market-news report for blog publication from examples/us/daily-watchlist.json, then hand the generated analysis-example/us-market/naver-publish-YYYY-MM-DD.json manifest to /kr-naver-blog-publish scheduled mode.
```

```text
/kr-portfolio-monitor scan current Kiwoom-supported KRX holdings, compute SMA20 deviation and RSI14, and write the result to analysis-example/kr/portfolio-snapshot.md.
```

```text
/kr-sector-plan scope a Korea data center sector report into a clean research brief with boundaries, key questions, and the right output mode.
```

```text
/kr-sector-data-pack gather a Korea-focused fact pack for the waste-battery sector with dated policy events, market metrics, and representative listed companies.
```

```text
/kr-sector-analysis write a Korea security-operations market report with market definition, drivers, constraints, value chain, regulation, company map, and source-dated facts.
```

```text
/kr-sector-compare compare Korean robotics and smart-factory sectors on a same-date basis and explain which setup has the cleaner listed exposure.
```

```text
/kr-sector-audit review analysis-example/kr-sector/국내 데이터센터.md for unsupported market claims, stale dates, and listed-exposure overreach.
```

```text
/kr-sector-update update analysis-example/kr-sector/국내 데이터센터.md with policy, regulation, and company developments after the memo date, and append a dated update block.
```

## End-to-end scenarios

Full workflows that chain several skills. The two shortest — Naver KOL one-cycle and foreign-IB consensus tracking — live in [README.md § First run](../README.md#first-run). The rest are here.

### DART single-supply contract timeline (5 min)

```text
/kr-stock-dart-analysis 한미글로벌이 최근 24개월 동안 공시한 단일판매·공급계약을 모두 행별로 정리하고, 현재 유효 계약 금액 중 2027년까지, 2028년까지, 그 이후 연도별로 얼마나 종료되는지 만기 분포 표도 추가해줘. 공시에서 수주잔고를 따로 밝히지 않으면 정식 backlog가 아니라 계약 기간 기준 커버리지라는 점을 분명히 적어줘.
```

Output: row-by-row contract timeline + maturity distribution + explicit "disclosed vs derived" labels. Sample: [한미글로벌 수주계약리스트](<../analysis-example/kr/한미글로벌/수주계약리스트.md>).

### Daily KOSPI + KOSDAQ leadership screen (2 min)

```text
/kr-market-leaders 오늘 기준 KOSPI + KOSDAQ 통합 universe에서 단기·중기·구조 lens별 leadership 스크리닝 돌려줘. RS, 거래량, 52주 신고가 트리거 포함하고, 어제 leaders-YYYY-MM-DD.md와 비교해서 오늘 신규 진입한 top-20 종목을 별도 표로 정리해줘.
```

Output: `analysis-example/kr-market/leaders-<YYYY-MM-DD>.md` + `.json` cache with prior-day diff. Daily artifact, regenerated each run and not kept in the repo.

Optional Telegram delivery is a separate post-processing step, never part of collection or Naver publishing:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/leaders-2026-07-04.json --dry-run   # replace with today's artifact
```

### Undisclosed customer / end-demand reverse tracking (CSV-first)

```text
/kr-trade-flow-analysis 엘앤에프(066970)의 중국 NCM 관련 수출입 CSV를 trade-flow-data.json으로 정규화하고, DART/peer/기존 공급계약과 교차검증해서 공시 확인 사실과 high-confidence investment inference를 분리한 trade-flow-analysis.md를 작성해줘. Tesla EV LFP는 제외하고 Samsung SDI/미국향 ESS LFP는 별도 thesis로 추적해줘.
```

Output: `analysis-example/kr/<company>/trade-flow-analysis.md` + `trade-flow-data.json`. Reverse-tracks undisclosed customers and end demand through trade statistics while keeping `Trade Flow Inference` separate from `confirmed disclosure`. Skill files: [kr-trade-flow-analysis](../skills/kr-trade-flow-analysis/SKILL.md), [output format](../skills/kr-trade-flow-analysis/references/output-format.md). Example: [엘앤에프 trade-flow-analysis.md](<../analysis-example/kr/엘앤에프/trade-flow-analysis.md>).

### Korean brokerage report watch

```text
Use $kr-analyst-report-watch in daily mode for today's Korean brokerage report flow. Summarize the Top 10 public reports, compare narrative changes by topic, and write analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md and .json.
```

Output: `analysis-example/kr-reports/report-watch-<mode>-<YYYY-MM-DD>.md` + `.json`, with topic keys, narrative delta labels, source quality gaps, and links back to public report sources. Skill files: [kr-analyst-report-watch](../skills/kr-analyst-report-watch/SKILL.md), [output format](../skills/kr-analyst-report-watch/references/output-format.md).

To send the summary and attachment to Telegram after generation, configure [`.env.telegram.example`](../.env.telegram.example) values in the `telegram-report-sender` skill folder's gitignored `.env`, then run `node skills/telegram-report-sender/scripts/send-telegram.js --input <artifact>`.

### Daily market-news automation (KR and U.S.)

```text
Use $kr-daily-market-news to create today's Korean market-wide and sector daily news report for blog publication. Write analysis-example/kr-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Output: `analysis-example/kr-market/daily-news-<YYYY-MM-DD>.md` + `.json` and a dated Naver publish manifest. Sector collection uses the default seed list at [examples/kr/daily-sector-stocks.json](../examples/kr/daily-sector-stocks.json).

U.S. daily market news uses the same artifact contract with U.S. sources, New York date filtering, and GICS-style sector seeds:

```text
Use $us-daily-market-news to create today's U.S. market-wide and sector daily news report for blog publication. Write analysis-example/us-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Sector collection uses [examples/us/daily-sector-stocks.json](../examples/us/daily-sector-stocks.json) and the optional watchlist compatibility file at [examples/us/daily-watchlist.json](../examples/us/daily-watchlist.json). The evidence-first workflow writes an editorial queue; reviewed Korean copy must cite body evidence IDs using [daily-market-editorial.example.json](../examples/us/daily-market-editorial.example.json).

Telegram delivery is available for Korean/U.S. daily-news JSON or Markdown artifacts as an explicit follow-up command. It sends a short summary plus the matching `.md` file when present:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/daily-news-2026-07-02.json --dry-run
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/us-market/daily-news-2026-07-02.json --summary-only
```

Remove `--dry-run` only after `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in the sender skill folder `.env` or passed with CLI flags.

### U.S. SEC filing precision

```text
Use $us-sec-analysis for AAPL and create a Korean SEC evidence pack from the latest 10-K and 10-Q with XBRL facts and Source Map.
```

Output: `analysis-example/us/<company>/sec-analysis.md` plus optional `sec-reference.md` and `sec-cache.json`. Examples: [Tesla SEC analysis](../analysis-example/us/Tesla/sec-analysis.md) and [Tesla full memo](../analysis-example/us/Tesla/memo.md). Offline validation fixtures: [AAPL submissions sample](../examples/us-sec-analysis/submissions-aapl-sample.json), [AAPL companyfacts sample](../examples/us-sec-analysis/companyfacts-aapl-sample.json), and [AAPL 10-K HTML sample](../examples/us-sec-analysis/filing-10k-aapl-sample.html).

More scenarios (sector compare, portfolio health, post-earnings update) → [MARKETPLACE.md § Use cases](MARKETPLACE.md#use-cases-paste-into-submission-form-%EB%98%90%EB%8A%94-readme).
