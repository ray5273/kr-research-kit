# KrResearchKit — Korean + U.S. Equity Research

AI skills for U.S. and Korean stock analysis, KRX portfolio monitoring, and Korea-focused sector research. Native to both **Claude Code** and **OpenAI Codex CLI**.

Languages:

- English — [README.md](README.md)
- 한국어 — [README-kr.md](README-kr.md)

Strongest with Korean equities, now with a U.S. SEC precision stage: one Korean ticker question goes through DART filings, KRX chart pack, sell-side consensus, foreign-IB coverage, trade-flow proxy checks, and Naver-blog publishing; U.S. stock work can start from SEC EDGAR/XBRL evidence packs before the final memo. Stock artifacts land in `analysis-example/<market>/<company>/memo.md`.

Recent example: [부국증권 보통주·우선주 결정 메모](<analysis-example/kr/부국증권/memo.md>).

New sector blog draft: [K-조선 미 해군 MRO, 정비에서 신조까지](<analysis-example/kr-sector/shipbuilding/k-조선-미해군-mro-네이버초안.md>).

Global sector deep dive: [LFP 양극재 3편 — 미국 ESS는 왜 양극재 선택지가 좁은가](<analysis-example/global-sector/us-lfp-cathode-choice-constraints.md>).

Global sector Naver draft: [LFP 양극재 3편 — 미국 ESS는 왜 양극재 선택지가 좁은가](<analysis-example/global-sector/naver-post-us-lfp-cathode-choice-constraints.md>).

Chart/valuation example: [대양전기공업 지지·저항선 및 연단위 PER·PBR](<analysis-example/kr/대양전기공업/technical-levels.md>).

Chart-only Naver draft example: [대양전기공업 스윙 차트 체크리스트](<analysis-example/kr/대양전기공업/chart-blog.md>).

Capacity/backlog example: [대양전기공업 캐파·가동률·수주잔고 비교](<analysis-example/kr/대양전기공업/capacity-utilization.md>).

New example: [한화엔진(082740) 12–24개월 신규 매수 판단 메모](<analysis-example/kr/한화엔진/memo.md>).

New skill: [KRX strategy backtest](skills/kr-strategy-backtest/SKILL.md) — KOSPI/KOSDAQ 일봉 데이터를 바탕으로 전략 규칙을 설계하고, 비용·다음날 시가 체결·편향 한계를 명시한 재현 가능한 Markdown/JSON 결과를 남깁니다.

New skill: [U.S. equity strategy backtest](skills/us-strategy-backtest/SKILL.md) — Yahoo 수정주가 프록시 모드와 별도로, WRDS CRSP/Compustat 입력 시 상장폐지·시점일치 상위 500 유니버스를 검증하는 point-in-time 모드를 제공합니다. 한국 거주자 보고에는 편도 20bp 비용, USD/KRW 납입일 환산, 22% 세후 추정 오버레이를 함께 기록합니다. [WRDS Top-500 실행 템플릿](examples/us-strategy-backtest/README.md)을 참고하세요.

무료 프록시 예시: [미국 상위 500 Minervini·실적·레짐 주간 검증](analysis-example/us-market/strategies/us-minervini-earnings-regime-free-proxy/weekly-free-proxy-backtest-2026-07-15.md) — 현재 상장 종목 기반의 생존자 편향 결과로, WRDS point-in-time 결과와 분리해 해석합니다.

연도별 재구성 무료 예시: [미국 전년 Top 500 Minervini·실적 주간 검증](analysis-example/us-market/strategies/us-minervini-earnings-regime-annual-free-partial/weekly-annual-ranked-free-partial-2025-12-31.md) — 제공된 전년 시총 랭킹으로 매년 유니버스를 교체했으며, Yahoo·SEC 캐시가 있는 종목만 남긴 부분표본입니다.

연도별 재구성 모멘텀 예시: [미국 전년 Top 500 Minervini 모멘텀 주간 검증](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-partial/weekly-annual-ranked-price-only-free-partial-2025-12-31.md) — 재무 점수 없이 Trend Template과 3·6·12개월 RS만 사용한 가격 모멘텀 부분표본입니다.

전략 변형 비교: [미국 전년 Top 500 모멘텀·레짐·실적·퀄리티 주간 비교](analysis-example/us-market/strategies/us-minervini-annual-variant-comparison/weekly-annual-variant-comparison-2025-12-31.md) — 동일한 2021–2025 부분표본에서 네 가지 규칙과 SPY를 비교합니다.

최근 보유종목 예시: [미국 전년 Top 500 Minervini 모멘텀 최근 2년·현재 포트폴리오](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current/portfolio-summary-2026-07-16.md) — 2024–2025 원장과 2026-07-13 신호의 목표 10종목을 분리해 기록합니다.

연도별 보유종목 표: [미국 전년 Top 500 Minervini 모멘텀 2021년 이후 포트폴리오](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current/portfolio-history-2021-2026-07-16.md) — 연도별 마지막 Top 10과 현재 모멘텀 상위 30을 한 표에 기록합니다.

주별 보유종목 표: [미국 전년 Top 500 Minervini 모멘텀 매주 목표 포트폴리오](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-current/weekly-target-portfolios-2021-2026-07-13.md) — 2021년부터 모든 5거래일 리밸런싱의 신호·체결일·현금 레짐·목표 10종목을 기록합니다.

2026 YTD 예시: [미국 전년 Top 500 Minervini 모멘텀 주간 YTD 검증](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-ytd/weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.md) — 2026-01-02 현금에서 별도로 시작해 STX 가격 결측 이월을 제거한 결과입니다.

한국 투자자 세후 민감도: [미국 주간 모멘텀 2026 YTD 비용·양도세 시나리오](analysis-example/us-market/strategies/us-minervini-momentum-annual-free-ytd-net/korean-net-ytd-scenarios-2026-07-16.md) — 편도 10·20·30bp 비용과 연 250만원 공제 후 22% 양도세의 전량 청산 가정을 비교합니다.

Codex 통합 정리: [전체 전략 방법론과 성과 비교](docs/CODEX-STRATEGY-METHODOLOGY-PERFORMANCE.md) — 한국·미국 전략의 수익률·Sharpe·MDD·OOS·다중검정과 데이터 신뢰도 차이를 한 문서에서 비교합니다.

## 한국 전략 기본값

한국 시장 엔진의 보수적 기본값은 **Minervini RS(3·6·12개월, 40/30/30) + DART EPS·매출 개선 + KOSPI SMA200 레짐 단독(R1)**이다. 5거래일마다 상위 10개를 고르고, 신호 다음 거래일 시가에 체결하며, 매수 25bp·매도 25bp+증권거래세 0.18%를 적용한다. 60일 18% 변동성 타깃은 정직 캐시에서 수익 드래그로 확인돼 2026-07-18 제거됐다. 별도의 강건성 검색에서 가장 강했던 **52주 신고가 근접 모멘텀 + 월간 Top 15 + 밴드 45 + 레짐**에는 2026-07-19부터 신규 후보의 신호일 수익률이 +25% 이상이면 제외하고 차순위를 충원하는 운영 제약을 적용한다. 밴드 내 기존 보유는 면제한다.

대표 결과: [R1 배당 포함 총수익 진단](<analysis-example/kr-market/strategies/annual-top300/annual-top300-R1-total-return-2017-01-02-through-2026-07-16.md>) · [52주 신고가 모멘텀 모델](<analysis-example/kr-market/strategies/annual-top300/live-52w-high-momentum-2026-07-16.md>)

채택된 운영 제약: [52주 신고가 신규진입 25% 급등 필터](<analysis-example/kr-market/strategies/annual-top300/52w-high-new-entry-jump-filter-sensitivity-2017-01-02-through-2026-07-16.md>) — 신규 후보의 신호일 1일 급등만 거르고 기존 보유는 밴드 규칙으로 유지합니다. 전체표본은 개선됐지만 OOS CAGR은 낮아졌고 표본은 8건뿐이므로 추격 위험 제한으로만 해석합니다.

연도별 거래 품질: [메인 52주 신고가 전략의 2017~2026 승률·손익비](<analysis-example/kr-market/strategies/annual-top300/52w-high-yearly-win-payoff-2017-through-2026-07-16.md>) — 부분 리밸런싱을 완결 보유 사이클로 합쳐 연도별 승률·평균 손익비·Profit Factor를 계산하며, 2026년 실제 청산분과 7월 16일 시점 최신 종가 가상청산 참고치를 분리합니다.

전략별 거래 품질: [핵심 5개 전략의 2017~2026 연도별 승률·손익비 비교](<analysis-example/kr-market/strategies/annual-top300/strategy-yearly-win-payoff-comparison-2017-through-2026-07-16.md>) — 52주 최고가 근접, 기본 혼합, 이익성장, 시장 전체+200일선, 구형 전략을 동일한 FIFO 실현 사이클 기준으로 비교합니다.

New example: [KOSPI·KOSDAQ 10년 추세추종 비교](<analysis-example/kr-market/strategies/trend-following-10y/backtest-2026-07-10.md>) — 12개월 모멘텀과 Minervini Trend Template + RS를 현재 보통주 유니버스·편도 25bp 비용으로 같은 조건에서 비교합니다.

Point-in-time universe methodology: [KOSPI·KOSDAQ 연도별 Top 300 재구성](<analysis-example/kr-market/strategies/annual-top300/README.md>) — 전년말 보통주 Top 300을 다음 해에만 적용하고, 기존 결과는 최신 유니버스 생존자 편향 기준선으로 분리합니다.

공식 총수익 검증 경로: [3,000억원 유니버스 공식 총수익 실행 규약](skills/kr-strategy-backtest/SKILL.md#official-total-return-3000억원-universe) — KRX 원시 OHLC와 KRX·DART 교차검증 기업행사 원장을 별도 보존하고, 미검증 행사·상장폐지 대가 누락·90% 미만 가격 커버리지는 결과 생성을 중단합니다. 기존 Yahoo 조정가격과 원시 KRX 결과는 각각 제한적 기준선·미검증 진단으로 유지합니다.

Portfolio comparison: [최신 Top 300 기준선 vs 연도별 Top 300](<analysis-example/kr-market/strategies/annual-top300/latest-vs-annual-top300-portfolio-comparison-2026-07-10.md>) — RS·실적·레짐 전략의 실제 보유종목 중복률, 연초 강제 교체, 마지막 포트폴리오를 비교합니다.

Model portfolio: [다음 주 연도별 Top 300 RS·실적·레짐 포트폴리오](<analysis-example/kr-market/strategies/annual-top300/next-week-portfolio-2026-07-20.md>) — 2026-07-16 종가 기준의 모델 목표 비중과 다음 정규 리밸런싱 일정을 기록합니다.

컴플라이언스 제외 오버레이: [삼성전자 제외 Top 300 모델 포트폴리오](<analysis-example/kr-market/strategies/annual-top300/compliance-excluded-005930-portfolio-2026-07-20.md>) — 005930 목표비중을 현금으로 유지하고 다음 정규 신호에서 제외 조건으로 재순위화하는 개인별 제약 예시입니다.

후보 가능 여부 원장: [2026-07-13 신호 Top 300 전 종목 게이트 감사](<analysis-example/kr-market/strategies/annual-top300/candidate-coverage-2026-07-13.md>) — 원시 시총순위 300개 각각에 대해 보통주·가격·DART·컴플라이언스·랭킹 가능 여부와 제외 사유를 기록합니다.

3,000억원 진단 모델: [다음 주 3,000억원 이상 포트폴리오](<analysis-example/kr-market/strategies/annual-cap300b-raw-diagnostic/next-week-portfolio-2026-07-20.md>) — 2026-07-16 종가 기준의 원시 KRX·분할 추정 보정 진단이며, 기업행사·총수익 검증 전에는 공식 모델 포트폴리오로 사용하지 않습니다.

3,000억원 자본변동 부분표본: [감자·분할·병합 보정 및 종료가격 현금화 10년 검증](<analysis-example/kr-market/strategies/annual-cap300b-capital-actions-partial/annual-cap300b-capital-actions-partial-2017-01-02-through-2026-07-16.md>) — 배당·유증·합병은 제외하고 가격·주식수 구조 변화와 장기 종료 가격시리즈만 처리한 가격수익률 부분표본입니다.

3,000억원 Yahoo 정합 비교: [현재 유니버스 30% 기준선과 기간·비용·가격을 맞춘 연도별 유니버스 검증](<analysis-example/kr-market/strategies/annual-cap300b-yahoo-adjusted-comparison/current-vs-annual-cap300b-yahoo-adjusted-comparison-2017-01-02-through-2026-07-10.md>) — Yahoo 조정가격·매도 거래세 0%·동일 기간으로 정렬한 비공식 비교본이며, 사용 불가 종목을 제외했으므로 공식 총수익 검증을 대체하지 않습니다.

연도별 Top 500 Yahoo 정합 비교: [전년 말 Top 500을 다음 해에 적용한 RS·실적·레짐 검증](<analysis-example/kr-market/strategies/annual-top500-yahoo-adjusted-comparison/annual-top500-yahoo-adjusted-2017-01-02-through-2026-07-10.md>) — 동일 기간·Yahoo 조정가격·매도 거래세 0% 조건에서 Top 500으로 유니버스만 넓힌 비공식 비교본입니다.

연도별 Top 300 Yahoo 정합 비교: [전년 말 Top 300을 다음 해에 적용한 RS·실적·레짐 검증](<analysis-example/kr-market/strategies/annual-top300-yahoo-adjusted-comparison/annual-top300-yahoo-adjusted-2017-01-02-through-2026-07-10.md>) — 동일 기간·Yahoo 조정가격·매도 거래세 0% 조건의 비공식 비교본입니다.

연도별 Top 300 KRX 가격수익 진단: [2016-07-11~2026-07-16 RS·실적·레짐 재실행](<analysis-example/kr-market/strategies/annual-top300-marcap-split-diagnostic/annual-top300-marcap-split-partial-2016-07-11-through-2026-07-16.md>) — `marcap` KRX 원가격에 분할만 추론 보정한 부분 진단입니다. 배당·유증·합병·상장폐지 대가는 검증하지 않아 공식 총수익 성과가 아닙니다.

기간별 Top 300 포트폴리오: [2026년 6월 말까지 연도별 기초·기말 포트폴리오와 수익](<analysis-example/kr-market/strategies/annual-top300-marcap-split-diagnostic/period-portfolios-and-returns-through-2026-06-30.md>) — 연중 5거래일 단위 재순위화의 기초·기말 스냅샷과 각 연도 수익률을 함께 기록합니다.

연도별 Top 200 Yahoo 정합 비교: [전년 말 Top 200을 다음 해에 적용한 RS·실적·레짐 검증](<analysis-example/kr-market/strategies/annual-top200-yahoo-adjusted-comparison/annual-top200-yahoo-adjusted-2017-01-02-through-2026-07-10.md>) — 동일 기간·Yahoo 조정가격·매도 거래세 0% 조건의 비공식 비교본입니다.

Live union model: [최신 + 2025년말 Top 300 합집합 모델 포트폴리오](<analysis-example/kr-market/strategies/annual-top300/live-union-top300-model-2026-07-16.md>) — 최신 시총 Top 300과 2025년말 Top 300에만 있던 종목을 함께 후보로 남긴 일회성 모델 화면입니다.

Live broad model: [현재 상장 KRX 전체 보통주 모델 포트폴리오](<analysis-example/kr-market/strategies/annual-top300/live-all-current-krx-model-2026-07-16.md>) — 시가총액·연도말 Top 300 제한 없이 현재 상장 KOSPI·KOSDAQ 보통주 전체를 후보로 조회합니다.

Expanded example: [추가 추세추종 3종 10년 비교](<analysis-example/kr-market/strategies/trend-following-10y/expanded-backtest-2026-07-10.md>) — Donchian 55/20, 10개월 SMA, 12개월 절대 모멘텀을 같은 KRX 캐시·비용 조건으로 추가 비교합니다.

Screen example: [KOSPI·KOSDAQ Minervini Strict/SEPA 화면](<analysis-example/kr-market/minervini-screen-2026-07-10.md>) — Strict Template 통과 후보와 객관화한 VCP·피벗 돌파 SEPA-style 후보를 분리합니다.

State-hold example: [Minervini Strict/SEPA 상태 기반 10년 백테스트](<analysis-example/kr-market/strategies/trend-following-10y/minervini-state-backtest-2026-07-10.md>) — Template 통과 시 진입하고 이탈 시 청산하는 보유 기간 기반 규칙을 검증합니다.

Large-cap example: [KOSPI·KOSDAQ 시가총액 상위 300 모멘텀 백테스트](<analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.md>) — 대형주 300개에서 12개월·2/3/4개월 상승 모멘텀 상위 20개를 월간 리밸런싱합니다.

Pre-2026 example: [대형주 모멘텀 2025년 말 기준 결과](<analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-through-2025-12-31.md>) — 2026년 관측치를 제외한 동일 전략의 성과입니다.

Fundamental momentum example: [가격 모멘텀 + EPS·매출 개선 상위 20 백테스트](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-momentum-backtest-through-2025-12-31.md>) — DART 공시일 기준 EPS·매출 개선과 12개월 가격 모멘텀을 결합했습니다.

Sensitivity example: [보유 종목 수 5·10·15·20개 비교](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-momentum-holdings-sensitivity-through-2025-12-31.md>) — 동일 전략에서 보유 상한만 바꾼 결과입니다.

2026 YTD example: [2026년 7월 10일 기준 가격·EPS·매출 개선 백테스트](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-momentum-backtest-through-2026-07-10.md>) 및 [보유 수 민감도](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-momentum-holdings-sensitivity-through-2026-07-10.md>).

Minervini RS comparison: [3·6·12개월 RS + EPS·매출 개선 백테스트](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-minervini-rs-backtest-through-2026-07-10.md>) — 가격 모멘텀을 Minervini식 RS로 교체한 결과입니다.

Comparison: [가격 모멘텀과 Minervini RS 비교표](<analysis-example/kr-market/strategies/trend-following-10y/fundamental-momentum-vs-minervini-rs-comparison-through-2026-07-10.md>).

Alternative indicators: [52주 고점·변동성 조정·TTM 총이익성 비교](<analysis-example/kr-market/strategies/trend-following-10y/alternative-indicators-backtest-through-2026-07-10.md>) — 기존 EPS·매출 전략과 세 가지 대체 점수를 같은 조건으로 비교합니다.

Factor matrix: [가격 신호 × 재무 신호 12개 조합](<analysis-example/kr-market/strategies/trend-following-10y/alternative-factor-matrix-backtest-through-2026-07-10.md>) — 가격 4종과 재무 3종의 교차 조합 결과입니다.

MDD overlays: [레짐·절대모멘텀·변동성 타겟·트레일링 스톱 비교](<analysis-example/kr-market/strategies/trend-following-10y/mdd-overlay-backtest-through-2026-07-10.md>) — 상위 3개 가격·EPS 전략에 MDD 감소 오버레이를 적용하고, 기존 비용 기준 baseline 재현을 함께 검증합니다.
Weekly portfolio example: [주간 포트폴리오 성과와 월간 업데이트 비교](<analysis-example/kr-market/strategies/trend-following-10y/weekly-portfolio-performance-and-monthly-comparison-through-2026-07-10.md>) — 동일한 Minervini RS·EPS·매출 상위 10개 규칙을 주간과 월간으로 비교하고, 주간 레짐·변동성 타기팅의 MDD 관리 결과를 정리합니다.

Daily main-strategy example: [2017년부터 일별·주별 동적 리밸런싱 비교](<analysis-example/kr-market/strategies/trend-following-10y/daily-vs-weekly-main-strategy-from-2017-through-2026-07-10.md>) — 이전 보유종목을 고정하지 않고 Minervini RS·EPS·매출 순위를 각 리밸런싱 시점마다 다시 계산합니다.

Exit analysis: [주별 메인 전략의 익절·손절 실현손익 분석](<analysis-example/kr-market/strategies/trend-following-10y/weekly-main-exit-analysis-through-2026-07-10.md>) — 완결 보유 사이클을 FIFO로 매칭해 익절·손절 비율과 손실 폭 분포를 확인합니다.

Candidate screen: [주별 메인 전략 상위 30 후보](<analysis-example/kr-market/strategies/trend-following-10y/weekly-main-top30-2026-07-10.md>) — 동일 RS·EPS·매출 점수식으로 2026-07-10 종가 기준 후보를 순위화합니다.

Filing impact: [분기 실적 공시와 주별 포트폴리오 교체](<analysis-example/kr-market/strategies/trend-following-10y/weekly-filing-impact-analysis-through-2026-07-10.md>) — 새 DART 재무 공시가 점수에 반영된 주의 종목 교체 폭을 비교합니다.

Filing-lag sensitivity: [DART 공시 1거래일 지연 검증](<analysis-example/kr-market/strategies/trend-following-10y/weekly-filing-lag-sensitivity-from-2017-through-2026-07-10.md>) — 장 마감 후 공시의 당일 신호 반영 가능성을 제거한 주별 메인 전략 비교입니다.

Extended history: [2015-07부터의 주별 메인 전략](<analysis-example/kr-market/strategies/trend-following-10y/weekly-main-strategy-from-20150701-filing-lag1-through-2026-07-10.md>) — 현 캐시의 최초 가격일에서 시작하며, 재무·가격 이력 충족 전까지는 현금으로 유지합니다.

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

## Use Cases

Seven end-to-end scenarios. Each prompt works as-is in Claude Code (`/skill`) or Codex (`$skill`).

### 1. Naver KOL — one cycle from ticker to blog post (10 min)

```text
/kr-stock-plan SOOP(067160) 결정 메모 작성한 다음, 차트·DART·증권사·외국계 IB·블로거 인사이트까지 채우고, 마지막에 Naver 블로그에 올려줘 (게시 직전에 미리보기 보여줘)
```

Chain: `kr-stock-plan` → `kr-stock-chart` → `kr-stock-dart-analysis` → `kr-foreign-analyst` + `kr-analyst-report-*` → `kr-naver-blogger` + `kr-naver-insight` → `kr-stock-analysis` → `kr-naver-blog-publish` (publish requires explicit user approval via screenshot review — never auto-publishes).

Output: a complete memo + 5-panel charts + Naver SmartEditor draft. See [HMM memo example](analysis-example/kr/HMM/memo.md).

### 2. Foreign-IB consensus tracking (3 min, USP)

```text
/kr-foreign-analyst 삼성전자(005930)에 대한 외국계 IB 최근 6개월 커버리지를 한국 뉴스에서 수집해 ## Street / Alternative Views 블록으로 정리해줘. 모든 view는 날짜·broker·rating·TP·한국 뉴스 URL과 1:1 매칭되게 해줘.
```

Why this matters: foreign IBs in Korea leak views through Korean-language news, not English research portals. This skill captures Morgan Stanley / Goldman / JPM / Nomura / CLSA / UBS / HSBC / Macquarie / Citi / BofA / Daiwa coverage directly. Every view links to a dated Korean news URL.

### 3. DART single-supply contract timeline (5 min)

```text
/kr-stock-dart-analysis 한미글로벌이 최근 24개월 동안 공시한 단일판매·공급계약을 모두 행별로 정리하고, 현재 유효 계약 금액 중 2027년까지, 2028년까지, 그 이후 연도별로 얼마나 종료되는지 만기 분포 표도 추가해줘. 공시에서 수주잔고를 따로 밝히지 않으면 정식 backlog가 아니라 계약 기간 기준 커버리지라는 점을 분명히 적어줘.
```

Output: row-by-row contract timeline + maturity distribution + explicit "disclosed vs derived" labels. Sample: [한미글로벌 수주계약리스트](<analysis-example/kr/한미글로벌/수주계약리스트.md>).

### 4. Daily KOSPI + KOSDAQ leadership screen (2 min)

```text
/kr-market-leaders 오늘 기준 KOSPI + KOSDAQ 통합 universe에서 단기·중기·구조 lens별 leadership 스크리닝 돌려줘. RS, 거래량, 52주 신고가 트리거 포함하고, 어제 leaders-YYYY-MM-DD.md와 비교해서 오늘 신규 진입한 top-20 종목을 별도 표로 정리해줘.
```

Output: `analysis-example/kr-market/leaders-<YYYY-MM-DD>.md` + `.json` cache with prior-day diff. Daily artifact, regenerated each run. Example: [leaders-2026-07-04](analysis-example/kr-market/leaders-2026-07-04.md).

Optional Telegram delivery is a separate post-processing step, never part of collection or Naver publishing:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/leaders-2026-07-04.json --dry-run
```

### 5. Undisclosed customer / end-demand reverse tracking (CSV-first)

```text
/kr-trade-flow-analysis 엘앤에프(066970)의 중국 NCM 관련 수출입 CSV를 trade-flow-data.json으로 정규화하고, DART/peer/기존 공급계약과 교차검증해서 공시 확인 사실과 high-confidence investment inference를 분리한 trade-flow-analysis.md를 작성해줘. Tesla EV LFP는 제외하고 Samsung SDI/미국향 ESS LFP는 별도 thesis로 추적해줘.
```

Output: `analysis-example/kr/<company>/trade-flow-analysis.md` + `trade-flow-data.json`. Use case: 비공개 고객사/최종 수요를 수출입 지표로 역추적하되, `Trade Flow Inference`와 `confirmed disclosure`를 분리한다. Skill files: [kr-trade-flow-analysis](skills/kr-trade-flow-analysis/SKILL.md), [output format](skills/kr-trade-flow-analysis/references/output-format.md).

Example: [엘앤에프 trade-flow-analysis.md](analysis-example/kr/엘앤에프/trade-flow-analysis.md), [trade-flow-data.json](analysis-example/kr/엘앤에프/trade-flow-data.json).

### 6. Korean brokerage report watch

```text
Use $kr-analyst-report-watch in daily mode for today's Korean brokerage report flow. Summarize the Top 10 public reports, compare narrative changes by topic, and write analysis-example/kr-reports/report-watch-daily-YYYY-MM-DD.md and .json.
```

Output: `analysis-example/kr-reports/report-watch-<mode>-<YYYY-MM-DD>.md` + `.json`, with topic keys, narrative delta labels, source quality gaps, and links back to public report sources. Skill files: [kr-analyst-report-watch](skills/kr-analyst-report-watch/SKILL.md), [output format](skills/kr-analyst-report-watch/references/output-format.md).

To send the report summary and attachment to Telegram after generation, configure [`.env.telegram.example`](.env.telegram.example) values in the `telegram-report-sender` skill folder's gitignored `.env`, then run `node skills/telegram-report-sender/scripts/send-telegram.js --input <artifact>`.

### 7. Codex Desktop daily market-news automation

```text
Use $kr-daily-market-news to create today's Korean market-wide and sector daily news report for blog publication. Write analysis-example/kr-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Output: `analysis-example/kr-market/daily-news-<YYYY-MM-DD>.md` + `.json` and a dated Naver publish manifest. Examples: [daily-news-2026-06-28](analysis-example/kr-market/daily-news-2026-06-28.md), [daily-news-2026-06-29](analysis-example/kr-market/daily-news-2026-06-29.md), [daily-news-2026-07-02](analysis-example/kr-market/daily-news-2026-07-02.md), [2026-06-29 Naver post](analysis-example/kr-market/naver-post-2026-06-29.md), [2026-07-02 Naver post](analysis-example/kr-market/naver-post-2026-07-02.md), [2026-06-29 publish manifest](analysis-example/kr-market/naver-publish-2026-06-29.json), [2026-07-02 publish manifest](analysis-example/kr-market/naver-publish-2026-07-02.json). Sector collection uses the default seed list at [examples/kr/daily-sector-stocks.json](examples/kr/daily-sector-stocks.json).

U.S. daily market news uses the same artifact contract with U.S. sources, New York date filtering, and GICS-style sector seeds:

```text
Use $us-daily-market-news to create today's U.S. market-wide and sector daily news report for blog publication. Write analysis-example/us-market/daily-news-YYYY-MM-DD.md and .json, then use $kr-naver-blog-publish in scheduled mode.
```

Sector collection uses [examples/us/daily-sector-stocks.json](examples/us/daily-sector-stocks.json) and the optional watchlist compatibility file at [examples/us/daily-watchlist.json](examples/us/daily-watchlist.json). The evidence-first workflow writes an editorial queue; reviewed Korean copy must cite body evidence IDs using [daily-market-editorial.example.json](examples/us/daily-market-editorial.example.json).

U.S. examples: [2026-07-09 daily report](analysis-example/us-market/daily-news-2026-07-09.md), [2026-07-10 daily report](analysis-example/us-market/daily-news-2026-07-10.md), [2026-07-09 Naver post](analysis-example/us-market/naver-post-2026-07-09.md), and [2026-07-09 publish manifest](analysis-example/us-market/naver-publish-2026-07-09.json).

Telegram delivery is available for Korean/U.S. daily-news JSON or Markdown artifacts as an explicit follow-up command. It sends a short summary plus the matching `.md` file when present:

```bash
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/kr-market/daily-news-2026-07-02.json --dry-run
node skills/telegram-report-sender/scripts/send-telegram.js --input analysis-example/us-market/daily-news-2026-07-02.json --summary-only
```

Remove `--dry-run` only after `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in the sender skill folder `.env` or passed with CLI flags.

U.S. SEC filing precision uses official SEC submissions, companyfacts, and filing archive documents:

```text
Use $us-sec-analysis for AAPL and create a Korean SEC evidence pack from the latest 10-K and 10-Q with XBRL facts and Source Map.
```

Output: `analysis-example/us/<company>/sec-analysis.md` plus optional `sec-reference.md` and `sec-cache.json`. Examples: [Tesla SEC analysis](analysis-example/us/Tesla/sec-analysis.md) and [Tesla full memo](analysis-example/us/Tesla/memo.md). Offline validation fixtures: [AAPL submissions sample](examples/us-sec-analysis/submissions-aapl-sample.json), [AAPL companyfacts sample](examples/us-sec-analysis/companyfacts-aapl-sample.json), and [AAPL 10-K HTML sample](examples/us-sec-analysis/filing-10k-aapl-sample.html).

More scenarios (sector compare, portfolio health, post-earnings update) → [docs/MARKETPLACE.md § Use cases](docs/MARKETPLACE.md). Full prompt catalog for every shipped skill → [docs/USAGE.md](docs/USAGE.md).

## Outputs Preview

Memos lead with the decision question, not a generic company description. From HD현대중공업:

> 무엇이 투자판단을 가장 크게 바꾸나? 2026년 하반기에도 1Q26의 15%대 OPM이 유지되는지, 그리고 고선가/엔진/해양/특수선 옵션이 실제 이익으로 이어지는지가 핵심이다.

DART recheck distinguishes `confirmed`, `partially supported`, and `not separately disclosed` claims before moving to valuation and stance. Chart artifacts ship alongside the memo so the writeup and visuals stay in sync:

![HD현대중공업 main trend chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart.png)

![HD현대중공업 momentum chart](analysis-example/kr/HD현대중공업/assets/HD현대중공업-chart-momentum.png)

Full index of 35+ example artifacts and fixtures (memos, Naver posts, DART references, SEC fixtures, chart packs, sector reports) → [docs/EXAMPLES.md](docs/EXAMPLES.md).

## What's Inside

30 skills. Korean stock pipeline: `kr-stock-plan → kr-stock-chart → kr-stock-dart-analysis → kr-trade-flow-analysis → kr-stock-data-pack → kr-stock-analysis`. Daily market workflows: `kr-daily-market-news` / `us-daily-market-news → kr-naver-blog-publish`; report monitoring: `kr-analyst-report-watch`; Telegram follow-up: `telegram-report-sender`. U.S. stocks: `us-sec-analysis → us-stock-analysis`. Sector workflow: `kr-sector-plan / -data-pack / -analysis / -compare / -audit / -update`.

Full catalog + per-skill behavior + bundled helpers → [docs/SKILLS.md](docs/SKILLS.md).

## Docs

- Installation (Plugin / Codex / Claude Code / OpenDART / SEC User-Agent / Chrome extension / fonts / known issues) — [docs/INSTALL.md](docs/INSTALL.md)
- Skills catalog & behavior — [docs/SKILLS.md](docs/SKILLS.md)
- Prompt catalog for every skill — [docs/USAGE.md](docs/USAGE.md)
- Analysis examples index — [docs/EXAMPLES.md](docs/EXAMPLES.md)
- Marketplace submission tracker — [docs/MARKETPLACE.md](docs/MARKETPLACE.md)
- Quality rubrics for memo audits — [docs/quality-rubrics.md](docs/quality-rubrics.md)

## Validation

```bash
bash ./scripts/validate-skills.sh        # Linux / macOS
.\scripts\validate-skills.ps1            # Windows PowerShell
```

Validation covers skill spec checks, strict YAML frontmatter parsing, output-path contracts, README local-link verification, and golden example audits.
