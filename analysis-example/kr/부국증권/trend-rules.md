# 부국증권 Rule Screen

- 기준일: 2026-07-10
- 입력: `chart-data.json` (485개 일봉)
- 상태: RS percentile cache 미생성으로 부분 결과

## Rule Screen

| 항목 | 상태 | 값 / 근거 |
| --- | --- | --- |
| Minervini Trend Template | incomplete | 통합 KOSPI+KOSDAQ RS percentile 미산출 |
| KRX 52주 신고가 리더십 점수 | partial | RS 구성요소 미산출 |
| 종가 > MA50 근사(MA60) | fail | 56,300 < 65,107 |
| 종가 > MA150 근사(MA120) | fail | 56,300 < 70,344 |
| 52주 고점 근접 | fail | 52주 고점 104,600 대비 큰 괴리 |

해석: 기술적으로는 회복 추세 확인 전 단계다. 이 규칙 화면은 공시·밸류에이션 판단이 아닌 가격 데이터 보조지표다.
