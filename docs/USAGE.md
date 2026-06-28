# Usage — Prompt Catalog

Signature prompts for every shipped skill, in both Codex (`$skill`) and Claude Code (`/skill`) form.

## Codex

```text
Use $us-stock-analysis for NVDA and write a dated investment memo with valuation, catalysts, risks, and chart context.
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
Use $kr-stock-analysis for 005930.KS and write a decision memo with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
Use $kr-stock-update to refresh analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news published after the memo date, and append a dated update block to the same file.
```

```text
Use $kr-daily-market-news to create today's Korean daily market-news report for blog publication. Read watchlist from examples/kr/daily-watchlist.json, use official Korean market/disclosure sources first where available and Naver News second, write analysis-example/kr-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish to publish in scheduled mode only if validation passes.
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
/kr-stock-analysis analyze 005930.KS with DART-based evidence, street or alternative views, valuation, governance checks, catalysts, chart context, archetype-specific uncomfortable questions, decision-changing issues, structured stance, and follow-up research prompts.
```

```text
/kr-stock-update update analysis-example/kr/엘앤에프/memo.md with company-specific disclosures, IR materials, and news after the memo date, and append a dated update block to the same file.
```

```text
/kr-daily-market-news create today's Korean daily market-news report for blog publication from examples/kr/daily-watchlist.json, then hand the generated analysis-example/kr-market/naver-publish-YYYY-MM-DD.json manifest to /kr-naver-blog-publish scheduled mode.
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

For end-to-end scenarios (Naver KOL one-cycle, foreign-IB tracking, contract maturity, leadership screening, sector compare, portfolio health), see the seven scenarios in [MARKETPLACE.md § Use cases](MARKETPLACE.md#use-cases-paste-into-submission-form-%EB%98%90%EB%8A%94-readme).
