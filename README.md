# KrResearchKit — Korean + U.S. Equity Research

AI skills that turn one ticker into dated, source-backed equity research. Native to both **Claude Code** and **OpenAI Codex CLI**.

Languages: English — [README.md](README.md) · 한국어 — [README-kr.md](README-kr.md)

Ask about a Korean ticker and the chain runs itself: DART filings, a KRX chart pack, sell-side consensus, foreign-IB coverage pulled from Korean-language news, trade-flow proxy checks, and a publish-ready Naver blog draft. U.S. tickers start from an SEC EDGAR/XBRL evidence pack. Every artifact lands on disk at `analysis-example/<market>/<company>/memo.md` with a `기준일` and a source map, not in chat.

## What it does

34 skills, wired into pipelines rather than used one at a time.

| Workflow | Chain |
|---|---|
| Korean stock research | `kr-stock-plan → kr-stock-chart → kr-stock-dart-analysis → kr-trade-flow-analysis → kr-stock-data-pack → kr-stock-analysis` |
| U.S. stock research | `us-sec-analysis → us-stock-analysis` |
| Sector research | `kr-sector-plan / -data-pack / -analysis / -compare / -audit / -update` |
| Daily market news → blog | `kr-daily-market-news` / `us-daily-market-news → kr-naver-blog-publish` |
| Monitoring & follow-up | `kr-analyst-report-watch`, `kr-portfolio-guard`, `telegram-report-sender` |

What makes it different from a generic research prompt:

- **Foreign-IB coverage from Korean news.** Morgan Stanley / Goldman / JPM / Nomura / CLSA views leak through Korean-language articles, not English research portals. Every captured view links back to a dated Korean news URL.
- **Filing-grounded, not vibe-grounded.** DART Recheck separates `confirmed`, `partially supported`, and `not separately disclosed` before valuation or stance.
- **Publishing is gated.** Naver publish requires explicit approval via screenshot preview. Nothing auto-posts.
- **No npm dependencies.** Every bundled script runs on Node stdlib alone.

## Quick Install

In Claude Code:

```text
/plugin marketplace add ray5273/kr-research-kit
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Anthropic community marketplace submission is in review — the same plugin will be discoverable from the official catalog once approved. See [docs/MARKETPLACE.md](docs/MARKETPLACE.md).

<details>
<summary>Manual install (Codex or Claude Code git clone)</summary>

Codex:

```bash
git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.codex/src/kr-research-kit
cd ~/.codex/src/kr-research-kit && bash ./scripts/install-all-skills.sh
```

Claude Code:

```bash
git clone --single-branch --depth 1 https://github.com/ray5273/kr-research-kit ~/.claude/src/kr-research-kit
cd ~/.claude/src/kr-research-kit && bash ./scripts/install-all-claude-skills.sh
```

OpenDART API key, SEC EDGAR `User-Agent`, macOS Naver fallback, Windows PowerShell, custom install targets, and the Chrome extension DART path are all in [docs/INSTALL.md](docs/INSTALL.md).

</details>

## First run

Each prompt works as-is in Claude Code (`/skill`) or Codex (`$skill`).

**One cycle, ticker to blog post (~10 min).** Plans the memo, fills in charts, DART, domestic and foreign analyst views, and blogger insight, then prepares a Naver draft for your approval.

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

**Foreign-IB consensus tracking (~3 min).** The signature capability — reconstructs foreign broker coverage from Korean-language news with every rating and target price traced to a dated article.

```text
/kr-foreign-analyst 삼성전자(005930)에 대한 외국계 IB 최근 6개월 커버리지를 한국 뉴스에서 수집해 ## Street / Alternative Views 블록으로 정리해줘. 모든 view는 날짜·broker·rating·TP·한국 뉴스 URL과 1:1 매칭되게 해줘.
```

Five more end-to-end scenarios — DART contract timelines, KRX leadership screens, trade-flow reverse tracking, brokerage report watch, daily market-news automation — are in [docs/USAGE.md § End-to-end scenarios](docs/USAGE.md#end-to-end-scenarios).

## Outputs

Memos lead with the decision question, not a generic company description. From HD현대중공업:

> 무엇이 투자판단을 가장 크게 바꾸나? 2026년 하반기에도 1Q26의 15%대 OPM이 유지되는지, 그리고 고선가/엔진/해양/특수선 옵션이 실제 이익으로 이어지는지가 핵심이다.

Chart artifacts ship alongside the memo so the writeup and visuals stay in sync:

![HD현대중공업 main trend chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png)

![HD현대중공업 momentum chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png)

Representative artifacts: [KR full decision memo](<analysis-example/kr/한화엔진/memo.md>) · [U.S. SEC-grounded memo](analysis-example/us/Tesla/memo.md) · [Korea sector report](<analysis-example/kr-sector/국내 데이터센터.md>) · [strategy backtest](<analysis-example/kr-market/strategies/annual-top300/live-52w-high-momentum-2026-07-16.md>)

Curated golden examples → [docs/EXAMPLES.md](docs/EXAMPLES.md). Complete index of every shipped artifact → [docs/ARTIFACTS.md](docs/ARTIFACTS.md).

## Korean strategy defaults

The conservative default for the Korean market engine is **Minervini RS (3/6/12-month, 40/30/30) + DART EPS/revenue improvement + a KOSPI SMA200 regime filter (R1)**: top 10 names every 5 trading days, filled at the next session's open, costed at 25bp buy and 25bp sell plus 0.18% transaction tax. The strongest variant found in robustness search is 52-week-high proximity momentum with monthly Top 15.

Full methodology, data grades, and performance comparison across every Korean and U.S. strategy → [docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md](docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md).

## Docs

- Installation (Plugin / Codex / Claude Code / OpenDART / SEC User-Agent / Chrome extension / fonts / known issues) — [docs/INSTALL.md](docs/INSTALL.md)
- Skills catalog & behavior — [docs/SKILLS.md](docs/SKILLS.md)
- Prompt catalog and end-to-end scenarios — [docs/USAGE.md](docs/USAGE.md)
- Curated golden examples — [docs/EXAMPLES.md](docs/EXAMPLES.md)
- Complete artifact index (generated) — [docs/ARTIFACTS.md](docs/ARTIFACTS.md)
- Strategy methodology & performance — [docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md](docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md)
- Marketplace submission tracker — [docs/MARKETPLACE.md](docs/MARKETPLACE.md)
- Quality rubrics for memo audits — [docs/quality-rubrics.md](docs/quality-rubrics.md)

## Validation

```bash
bash ./scripts/validate-skills.sh        # Linux / macOS
.\scripts\validate-skills.ps1            # Windows PowerShell
```

Validation covers skill spec checks, strict YAML frontmatter parsing, output-path contracts, README local-link verification, artifact-index freshness, and golden example audits.
