# 핸드오프 — 코스피 52주 신고가 전략 + Hermes 배포

## 1. 최종 전략 (확정)
**52주 신고가 근접 모멘텀 · 월간 · 연도별 Top-300 · 상위 15 · 밴드45 · 연초롤 완화 · KOSPI SMA200 레짐 · 삼성(005930) 제외**
- 러너 커맨드: `run-annual-top300-minervini-earnings-regime.js --eps-weight 0 --momentum-type high52w --holdings 15 --hold-buffer-rank 45 --soft-annual-roll --cadence 21`
- honest 백테스트(생존편향 제거 + 배당 총수익): **CAGR 16.4% / Sharpe 0.90 / MDD −26% / OOS 14.0% / DSR 통과(유일)**
- 비용: 수수료 25bp + 거래세 0.18% 반영됨(net). 슬리피지 20-30bp 추가 시 실전 **~13-14%**.
- 레짐: 6번 OFF, 전체 45% 시간 현금. 지금 ON(2025-05~).

## 2. 라이브 Hermes 상태 (192.168.50.252, ~/.hermes)
- **게이트웨이 실행중** (launchd ai.hermes.gateway, PID 80834). cron 자동 발동.
- **활성 잡:**
  - `krx-52w-high-portfolio` (매일 17:25) — 레짐 체크 + Telegram 발송. 레짐 OFF면 그날 알림.
  - `krx-52w-high-rebalance` (매월 1-3일 19:10, monthly gate) — 새 top-15 생성. **다음 8/1 자동.**
- **정지된 옛 잡:** `krx-weekly-regime-vol-portfolio`, `krx-weekly-live-rebalance`.
- 스크립트: `~/.hermes/scripts/{build-live-krx-52w-monthly.py, krx-52w-high-portfolio.py}` (저장소 소스 정렬 커밋됨).
- 상태/선택 파일(격리): `~/.cache/krx-trend-portfolio-monitor/live-52w-high-selections.json`, `~/.hermes/config/krx-weekly-regime-vol-portfolio/state-52w-high.json`.
- 백업: `~/.hermes/backup-52w-*`, `~/.hermes/cron/jobs.json.bak-52w-*`.
- 첫 라이브 Telegram 발송 성공(2026-07 top15: S-Oil·GS·더존비즈온·... ). Hermes는 **신호 자동화, 실주문은 수동**.

## 3. 남은 할 일 (TODO)
1. **[중요/연말 전] top300.json 자동 갱신 — 아직 없음.** 현재 7/12 정체, WRITE 잡 없음. **연 1회(연말/1월)만 갱신해야 백테스트(연간 point-in-time)와 매칭.** 일간/월간 갱신은 전략 변질(유니버스 드리프트)이므로 금지. → 12월/1월에 새 연도 Top-300으로 갱신하는 연간 잡 or 수동 갱신 필요.
2. **[검토] 리밸런싱 체결 타이밍** — 현재 19:10 days1-3 → 실행 ~2일차. "종가신호→다음시가" 모델과 대체로 일치. 첫거래일 정렬 원하면 조기(장전) 스케줄로 변경 가능.
3. **[사용자 수동] EPS+RS → 52주 신고가 전환** — 현재 EPS+RS 보유. 8월 첫 거래일 리밸런싱 때 전량 교체 권장(둘 겹침 1/15=GS만). 그 전 레짐 OFF 뜨면 그냥 현금.
4. **[표시] 슬리피지 반영** — 라이브 리포트 기대치를 net~14%로 보수 표시할지(러너 기본 비용에 20bp 슬리피지 추가 옵션).
5. **[선택] strict official 총수익 원장(A2)** — 감사용, 숫자는 안 바뀜(하이브리드로 확인됨).

## 4. 주요 도구/캐시/문서
- 분석 드라이버: `analyze-overlay-ablation.js`(runConfig: momentumType/eps/value/quality/lowVol/holdings/cadence/holdBufferRank/softAnnualRoll/regimeMode/buyCost/sellTax), `analyze-strategy-redesign.js`, `search-robust-strategies.js`.
- 데이터: `collect-dart-dividends.js`(OpenDART 배당, UA헤더 필수), `build-marcap-total-return-cache.js`, marcap parquet(저장소 내 `marcap/data/`).
- honest 캐시: `.tmp/kr-strategy-backtest/marcap-total-return` (생존편향 제거 + 배당). DART 패널: `.tmp/kr-strategy-backtest/dart-quarterly-panel`.
- 리포트: `analysis-example/kr-market/strategies/annual-top300/{robust-strategy-search, robust-lead-verification, universe-size-comparison, lowrisk-regime-design, portfolio-changes-2026, total-return-dividend-inclusive, strategy-policy.json}`.
- 메모리: `kr-strategy-backtest-review.md`.
- 브랜치 main, 최신 커밋 ~e5609a9. (세션 시작 시 다른 미커밋 WIP 있었음 — 무손상.)

## 5. 핵심 결론 (재확인)
- 코스피에서 **DSR 통과한 강건 팩터는 52주 신고가 하나뿐.** EPS·밸류·퀄리티·저변동·RS혼합 전부 미달.
- 최적점은 전부 중간값: **유니버스 Top-300, 보유 15, 주기 월간**(100/500, 10/20, 주간/2주는 다 열등).
- 단, 고회전(월 ~10종목 교체, 연 660%)이라 슬리피지 민감. 실전 기대치 low-teens.
- 스타일: 신고가=추세리더(연중 섹터순환), C(RS+EPS)=반도체·성장 편중. 1/15만 겹쳐 병행 시 분산 효과.
