### Rule Screen

- Minervini Trend Template: `fail`
- KRX 52주 신고가 리더십 점수: `10/100` (Grade `D`)

| 항목 | 상태 | 세부 |
| --- | --- | --- |
| Minervini / 현재가 > SMA50/SMA150/SMA200 | fail | 현재가 799000.00 / SMA50 1007320.00 / SMA150 1193560.00 / SMA200 1315180.00 |
| Minervini / SMA150 > SMA200 | fail | SMA150 1193560.00 / SMA200 1315180.00 |
| Minervini / SMA50 > SMA150 and SMA200 | fail | SMA50 1007320.00 / SMA150 1193560.00 / SMA200 1315180.00 |
| Minervini / SMA200이 최근 20거래일 전보다 상승 | fail | 현재 SMA200 1315180.00 / 20거래일 전 1362930.00 |
| Minervini / 현재가 >= 52주 저가의 130% | fail | 현재가/52주 저가 100.0% |
| Minervini / 현재가 >= 52주 고가의 75% | fail | 현재가/52주 고가 37.8% |
| Minervini / RS percentile >= 70 | fail | RS percentile 29.7 |
| Leadership / 52주 고가 근접도 | 0/25 | 현재가/52주 고가 37.8% |
| Leadership / 최근 신고가 recency | 5/25 | 마지막 신고가 이후 179거래일 |
| Leadership / 최근 60거래일 신고가 경신 빈도 | 0/15 | 0회 |
| Leadership / 통합 KRX RS percentile | 0/20 | RS percentile 29.7 |
| Leadership / 추세/거래량 확인 | 5/15 | 정배열 no / 거래량 125.2% |

Minervini Trend Template 기준으로는 7개 조건이 미충족이라 아직 엄격한 통과 구간은 아닙니다. 한국형 52주 신고가 리더십 점수는 10/100, 등급 D입니다. 차트 흐름은 bearish continuation 쪽으로 읽히며, RS percentile 29.7 기준 시장 내 상대강도까지 함께 확인됩니다.

- RS 기준: 2026-11-18 통합 KOSPI+KOSDAQ 일반주 2,529개 시도, 2,472개 RS 적격, 5개 수집 실패. 캐시 생성 2026-11-19. 거래량 지표는 Yahoo 일봉 기준이며 거래소 확정치와 제공 범위가 다를 수 있다.
- 52주 고가·저가 및 신고가 빈도는 252거래일 **종가** 기준이다. 장중 고저가 기준 시장 시세 화면과 값이 다를 수 있다.
