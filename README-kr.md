# KrResearchKit — Korean + U.S. Equity Research

종목 하나를 날짜와 출처가 박힌 리서치로 바꾸는 AI 스킬 모음입니다. **Claude Code**와 **OpenAI Codex CLI** 양쪽 네이티브입니다.

언어: English — [README.md](README.md) · 한국어 — [README-kr.md](README-kr.md)

한국 종목을 물어보면 체인이 알아서 돕니다. DART 공시, 수주산업의 필수 연도·만기별 수주잔고 그래프, KRX 차트 팩, 증권사 컨센서스, 한국어 뉴스에서 뽑아낸 외국계 IB 커버리지, 수출입 프록시 교차검증, 그리고 게시 직전 상태의 네이버 블로그 초안까지. 미국 종목은 SEC EDGAR/XBRL evidence pack에서 출발합니다. 모든 산출물은 채팅이 아니라 `analysis-example/kr/<company>/memo.md`에 `기준일`과 출처 맵을 달고 파일로 남습니다.

## 무엇을 하나

스킬 35개. 낱개로 쓰기보다 파이프라인으로 엮여 있습니다.

| 워크플로 | 체인 |
|---|---|
| 한국 주식 리서치 | `kr-stock-plan → kr-stock-chart → kr-stock-dart-analysis → kr-order-backlog-analysis → kr-trade-flow-analysis → kr-stock-data-pack → kr-stock-analysis` |
| 미국 주식 리서치 | `us-sec-analysis → us-stock-analysis` |
| 섹터 리서치 | `kr-sector-plan / -data-pack / -analysis / -compare / -audit / -update` |
| 데일리 시장 뉴스 → 블로그 | `kr-daily-market-news` / `us-daily-market-news → kr-naver-blog-publish` |
| 모니터링·후처리 | `kr-analyst-report-watch`, `kr-portfolio-guard`, `telegram-report-sender` |

일반 리서치 프롬프트와 다른 점:

- **한국어 뉴스에서 잡는 외국계 IB 커버리지.** 모건스탠리·골드만·JPM·노무라·CLSA의 view는 영어 리서치 포털이 아니라 한국어 기사로 흘러나옵니다. 수집된 모든 view는 날짜가 찍힌 한국 뉴스 URL과 1:1로 연결됩니다.
- **공시에 발 딛은 분석.** DART Recheck가 `confirmed` / `partially supported` / `not separately disclosed`를 구분한 뒤에야 밸류에이션과 stance로 넘어갑니다.
- **수주잔고의 시간축을 정직하게 표시.** 수주산업은 DART/KRX 근거로 연도·만기 그래프를 반드시 만들고, 총잔고만 공시됐으면 임의 배분 없이 `연도 미공시`로 그립니다.
- **발행에는 게이트가 있습니다.** 네이버 게시는 스크린샷 미리보기로 사용자가 명시 승인해야만 진행됩니다. 자동 게시는 없습니다.
- **npm 의존성 없음.** 번들 스크립트는 전부 Node stdlib만으로 돕니다.

## 빠른 설치

Claude Code에서:

```text
/plugin marketplace add ray5273/kr-research-kit
/plugin install kr-research-kit@kr-research-kit-marketplace
```

Anthropic 커뮤니티 마켓플레이스 등록은 심사 중입니다 — 승인되면 별도 `marketplace add` 없이 공식 카탈로그에서 바로 검색됩니다. [docs/MARKETPLACE.md](docs/MARKETPLACE.md) 참조.

<details>
<summary>수동 설치 (Codex / Claude Code git clone)</summary>

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

OpenDART API 키, SEC EDGAR `User-Agent`, macOS Naver fallback, Windows PowerShell, 커스텀 설치 경로, Chrome 확장 DART 경로는 모두 [docs/INSTALL.md](docs/INSTALL.md)에 있습니다.

</details>

## 첫 실행

각 프롬프트는 Claude Code(`/skill`) 또는 Codex(`$skill`)에서 그대로 동작합니다.

**종목에서 블로그 게시까지 한 사이클 (약 10분).** 메모를 기획하고 차트·DART·국내 증권사·외국계 IB·블로거 인사이트를 채운 뒤 네이버 초안을 승인 대기 상태로 만듭니다.

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

**외국계 IB 컨센서스 트래킹 (약 3분).** 이 저장소의 대표 기능입니다. 한국어 뉴스에서 외국계 브로커 커버리지를 복원하되 rating과 목표주가를 전부 날짜가 찍힌 기사로 역추적합니다.

```text
/kr-foreign-analyst 삼성전자(005930)에 대한 외국계 IB 최근 6개월 커버리지를 한국 뉴스에서 수집해 ## Street / Alternative Views 블록으로 정리해줘. 모든 view는 날짜·broker·rating·TP·한국 뉴스 URL과 1:1 매칭되게 해줘.
```

나머지 end-to-end 시나리오 5개 — DART 계약 시계열, KRX 리더십 스크리닝, 수출입 역추적, 증권사 리포트 워치, 데일리 시장 뉴스 자동화 — 는 [docs/USAGE.md § End-to-end scenarios](docs/USAGE.md#end-to-end-scenarios)에 있습니다.

## 산출물

메모는 generic 회사 소개가 아니라 의사결정 질문으로 시작합니다. HD현대중공업 예:

> 무엇이 투자판단을 가장 크게 바꾸나? 2026년 하반기에도 1Q26의 15%대 OPM이 유지되는지, 그리고 고선가/엔진/해양/특수선 옵션이 실제 이익으로 이어지는지가 핵심이다.

차트 산출물은 메모와 함께 저장되어 본문과 시각화가 동기화됩니다.

![HD현대중공업 메인 추세 차트](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png)

![HD현대중공업 모멘텀 차트](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png)

대표 산출물: [한국 결정 메모](<analysis-example/kr/한화엔진/memo.md>) · [미국 SEC 기반 메모](analysis-example/us/Tesla/memo.md) · [한국 섹터 보고서](<analysis-example/kr-sector/국내 데이터센터.md>) · [전략 백테스트](<analysis-example/kr-market/strategies/annual-top300/live-52w-high-momentum-2026-07-16.md>)

감수된 대표 예시 → [docs/EXAMPLES.md](docs/EXAMPLES.md). 전체 산출물 인덱스 → [docs/ARTIFACTS.md](docs/ARTIFACTS.md).

## 한국 전략 기본값

한국 시장 엔진의 보수적 기본값은 **Minervini RS(3·6·12개월, 40/30/30) + DART EPS·매출 개선 + KOSPI SMA200 레짐 단독(R1)**입니다. 5거래일마다 상위 10개를 고르고, 신호 다음 거래일 시가에 체결하며, 매수 25bp·매도 25bp + 증권거래세 0.18%를 적용합니다. 강건성 검색에서 가장 강했던 변형은 52주 신고가 근접 모멘텀 + 월간 Top 15입니다.

전체 방법론, 데이터 등급, 한국·미국 전략별 성과 비교 → [docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md](docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md).

## 문서

- 설치 (Plugin / Codex / Claude Code / OpenDART / SEC User-Agent / Chrome 확장 / 폰트 / 알려진 이슈) — [docs/INSTALL.md](docs/INSTALL.md)
- 스킬 카탈로그와 동작 방식 — [docs/SKILLS.md](docs/SKILLS.md)
- 프롬프트 카탈로그와 end-to-end 시나리오 — [docs/USAGE.md](docs/USAGE.md)
- 감수된 대표 예시 — [docs/EXAMPLES.md](docs/EXAMPLES.md)
- 전체 산출물 인덱스 (자동 생성) — [docs/ARTIFACTS.md](docs/ARTIFACTS.md)
- 전략 방법론과 성과 비교 — [docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md](docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md)
- Marketplace 제출 추적 — [docs/MARKETPLACE.md](docs/MARKETPLACE.md)
- 메모 감수용 품질 루브릭 — [docs/quality-rubrics.md](docs/quality-rubrics.md)

## 검증

```bash
bash ./scripts/validate-skills.sh        # Linux / macOS
.\scripts\validate-skills.ps1            # Windows PowerShell
```

스킬 스펙 검사, strict YAML frontmatter 파싱, 출력 경로 contract, README local-link 검증, 산출물 인덱스 최신성, golden example 감사를 포함합니다.
