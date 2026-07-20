# kr-market-sentiment 리포트 형식

`score-sentiment-bottom.js`가 산출하는 Markdown 리포트의 표준 구조. 사용자에게 전달할 때
이 형식을 유지한다.

## 필수 섹션

1. **제목** — `# 한국 시장 투심 바닥 지표 판단 — 기준일 YYYY-MM-DD`
2. **종합 판단** — 판단 밴드(이모지+라벨), 합성 점수(/+2), 한 줄 해석, 채점 지표 수와
   바닥/과열 신호 개수. 텍스트 게이지 바로 위치 시각화.
3. **확정 신호 체크리스트** — 외국인 순매수 전환 / KOSPI 20일선 회복 / RSI14 ≥ 40의
   충족 여부(✅/⬜/❔)와 `충족 n/3`. 저점 '확정'은 이 게이트로만.
4. **지표별 상세** — 표: 지표 · 값 · 기준일 · 신호(▲/▼ ±n) · 출처. (맥락) 태그는 가중치 0.
5. **카테고리별 평균 신호** — 카테고리별 가중 평균 신호와 지표 수.
6. **지수 스냅샷** — KOSPI(주지표)·KOSDAQ(보조) 종가/낙폭/이격/RSI, 기준일.
7. **데이터 공백 / 미채점** — 값 없음·미인식 값 목록(있을 때만).
8. **경고** — 수집 실패·수동 지표 누락 경고(있을 때만).
9. **해석 원칙** — 역발상·동행 지표 한계, 확정 조건, 사실/추론 구분 안내(고정 문구).

## score.json (기계판독)

`--json-out`으로 저장. 주요 필드:

- `composite` — 가중 합성 점수(대략 [−2, +2]).
- `judgment` — `{ emoji, label, detail }`.
- `scored[]` — 지표별 `{ id, label, value, signal, weight, signalLabel, asOfDate, source, category }`.
- `skipped[]` — 미채점 지표(값 없음/미인식).
- `categorySummary[]` — 카테고리별 `{ category, avgSignal, count }`.
- `confirmation` — `{ foreignNetBuyTurn, aboveSma20, rsiRecovering }` + `confirmedCount`.
- `tally` — `{ scoredCount, weightedCount, bottomSignals, overheatSignals }`.
- `warnings[]`.

## 톤·언어

- 한국어. 사실(수집값)과 추론(신호 해석)을 구분한다.
- "바닥 확정" 표현은 확정 게이트가 2/3 이상 충족될 때만 사용한다. 그 외에는 "바닥 근접",
  "바닥 신호 형성 중" 등으로 표현한다.
- 각 수치에 기준일을 병기한다.
