# Output Format

기본 출력은 한국어다. `Order-driven company: yes`이고 정량 공시가 하나라도 있으면 아래 PNG 섹션을 생략하지 않는다.

```md
# <회사명> 수주잔고 분석

기준일: YYYY-MM-DD

## 판별
- Order-driven company: yes / no / deferred
- 판별 근거:
- Chart status: rendered / unavailable-no-quantifiable-disclosure

## 범위와 기준
- 회사명:
- 티커:
- 기준 공시 및 공시일:
- 측정 범위: 연결 / 별도 / 사업부 / 계약공시 표본
- 차트 기준: official-revenue-schedule / official-contract-end-year / contract-disclosure-maturity-proxy / official-total-only
- 단위:

## 핵심 수주 지표
| 항목 | 값 | 기준일 | 범위 | 출처 | 비고 |
| --- | ---: | --- | --- | --- | --- |
| 공식 수주잔고 |  |  |  |  |  |
| 연도 배분 가능 금액 |  |  |  |  |  |
| 연도 미정 금액 |  |  |  |  |  |
| 금액 미공개 계약 |  |  |  |  |  |
| 최종 공시 연도 |  |  |  |  |  |
| 수주잔고 / 연간 매출 |  |  |  |  | 파생 지표 |
| 생산능력 참고 |  |  |  |  | 공시된 경우만, 기간·범위 필수 |

## 연도별 수주잔고 그래프

![<회사명> 연도별 수주잔고](assets/<company>-order-backlog.png)

- 그래프가 측정하는 것:
- 그래프가 측정하지 않는 것:
- 공식 총잔고와 그래프 합계의 차이:
- 생산능력 참고선과 측정 범위:
- 장기 운영·유지보수 계약 분리 여부:

## 연도별 분포
| 연도 또는 구간 | 금액 | 누적 금액 | 계약 수 | 상태 | 출처 |
| --- | ---: | ---: | ---: | --- | --- |

## 수주잔고 브리지
| 기초 | 신규·증감 | 매출 인식 | 취소·조정 | 기말 | 기준 |
| ---: | ---: | ---: | ---: | ---: | --- |

## 해석
- 매출 가시성:
- 마진·취소·환율·현금전환 한계:
- 다음 확인 공시:

## Source Map
| 주장 | 문서 | 공시일 | 섹션 또는 표 | 상태 | URL |
| --- | --- | --- | --- | --- | --- |
```

## Basis별 필수 문구

- `official-revenue-schedule`: `DART가 직접 공시한 예상 매출 인식 시점 기준`이라고 쓴다.
- `official-contract-end-year`: `프로젝트별 공시 잔여 수주액을 계약 종료연도에 묶은 값`이라고 쓴다.
- `contract-disclosure-maturity-proxy`: `개별 계약공시의 최신 유효 계약총액을 종료연도에 묶은 프록시이며 공식 잔여 수주잔고가 아니다`라고 쓴다.
- `official-total-only`: `공식 총잔고는 확인되지만 연도별 전환 스케줄은 미공시`라고 쓴다.

## 그래프 불가 예외

정량 수치가 전혀 없을 때만 PNG를 생략한다. 이 경우에도 아래를 남긴다.

```md
## 연도별 수주잔고 그래프

- Chart status: unavailable-no-quantifiable-disclosure
- 확인한 DART 섹션:
- 확인한 KRX/DART 계약공시 범위:
- 그래프를 만들지 않은 이유: 정량 근거가 없어 0 또는 추정치를 그리면 오해를 유발함
```
