# A2 — 공식 총수익(official-total-return) 아카이빙 체크리스트

이 문서는 `official-total-return` 산출물을 만들기 위해 **사람이 획득해야 하는 데이터**와 그 정확한 입력 스키마를 정리한다. 코드 배관은 이미 존재하지만(아래), 산출물이 없는 이유는 아카이빙된 공식 원문서가 없기 때문이다. `--strict-events`는 설계상 미검증 이벤트가 하나라도 있으면 **산출 전에 실패**한다.

> **선행 조건:** official-total-return 배관 4개 파일이 현재 메인에서 **미커밋(untracked)** 상태다. 먼저 커밋해야 한다:
> `skills/kr-strategy-backtest/scripts/lib/official-total-return.js`,
> `build-official-corporate-action-ledger.js`, `prepare-official-total-return-cache.js`, `run-official-total-return-backtest.js`.

## 규모 (정직하게)

- 유니버스: `annual-cap300b` (전년말 시총 ≥3,000억원 보통주, 다음 해 적용).
- **합집합 = 2015–2025년 1,180개 고유 종목** + 병합·분할 승계 종목 + KOSPI 지수(=`KOSPI_INDEX`).
- 각 종목에 대해 (1) 2015–2026 공식 KRX 원시 일봉 OHLC, (2) 해당 기간 **모든** 기업행사를 KRX·DART **이중 소스**로 아카이빙.
- 상폐·합병 종목이 반드시 포함돼야 한다(생존편향 제거의 핵심). Yahoo가 못 주는 바로 그 종목들.

## 파이프라인 (3단계)

```
① candidate-corporate-actions.json  ──build-official-corporate-action-ledger.js──▶  corporate-actions.json (검증 원장)
② official-raw-prices.json (+원장)  ──prepare-official-total-return-cache.js────▶  .tmp/.../official-total-return/ (총수익 캐시)
③ run-annual-top300-...regime.js --price-mode official-total-return --strict-events ──▶  analysis-example/.../official-total-return/
```

## ① 기업행사 이벤트 스키마 (`candidate-corporate-actions.json`)

`{ "events": [ … ] }`. 각 이벤트 **공통 필수**:

| 필드 | 규칙 |
|---|---|
| `id` | 고유 문자열 |
| `type` | `stock_split` `reverse_split` `capital_reduction` `rights_issue` `cash_dividend` `stock_dividend` `merger` `spin_off` `ticker_change` `delisting` 중 하나 |
| `effectiveDate` | `YYYY-MM-DD` |
| `verificationStatus` | 반드시 `"verified"` |
| `securityId` | 대상 증권 ID (승계형은 `oldSecurityId`/`newSecurityId`) |
| `sources` | **KRX 소스 1개 + DART 소스 1개 필수.** 각 소스: `{ publisher:"KRX"\|"DART", url:"https://…", retrievedAt, archiveFile:"<로컬 아카이브 경로>", sha256:"<64 hex>" }` — 빌더가 `archiveFile` 존재+해시 검증 |

**타입별 추가 필수:**
- `stock_split`/`reverse_split`/`capital_reduction`/`stock_dividend`: `shareRatio > 0` (신주/구주 배수)
- `cash_dividend`: `cashPerShare > 0`
- `rights_issue`: `rightsPerShare > 0`, `subscriptionPrice > 0`, `participation:"fully-subscribed"`
- `merger`/`spin_off`: `consideration: [{ securityId, cashPerShare?, sharesPerOldShare? }]` (비어있으면 실패)
- `delisting`: `cashPerShare > 0` (상폐 현금 대가 — **없으면 실패**)
- `capital_reduction`에 `cashPerShare`가 있으면: 명시적 `adjustmentFactor` 필요

**이벤트 템플릿:**
```json
{
  "id": "005930-2018-split-50to1",
  "type": "stock_split",
  "securityId": "005930",
  "effectiveDate": "2018-05-04",
  "shareRatio": 50,
  "verificationStatus": "verified",
  "sources": [
    { "publisher": "KRX",  "url": "https://…", "retrievedAt": "2026-07-18", "archiveFile": "sources/005930-2018-split-krx.pdf",  "sha256": "…64hex…" },
    { "publisher": "DART", "url": "https://…", "retrievedAt": "2026-07-18", "archiveFile": "sources/005930-2018-split-dart.html", "sha256": "…64hex…" }
  ]
}
```
상폐 예시(가장 중요): `{"id":"…","type":"delisting","securityId":"XXXXXX","effectiveDate":"YYYY-MM-DD","cashPerShare": <정리매매/합병교부금 등 실수령액, 0이면 완전손실은 아주 작은 양수 대신 정확값>, "verificationStatus":"verified","sources":[KRX,DART]}`

## ② 공식 원가격 스키마 (`official-raw-prices.json`)

```json
{
  "schemaVersion": 1,
  "securities": [
    {
      "securityId": "005930",
      "ticker": "005930",
      "market": "KOSPI",
      "name": "삼성전자",
      "eventVerificationStatus": "verified-complete",
      "rawOHLC": [ { "date":"2015-01-02","open":…,"high":…,"low":…,"close":…,"volume":… }, … ],
      "sourceReferences": [ { "publisher":"KRX","url":"https://…","sha256":"…" } ]
    },
    { "securityId":"KOSPI_INDEX","ticker":"KOSPI_INDEX","market":"INDEX","rawOHLC":[…],"eventVerificationStatus":"verified-complete" }
  ]
}
```
- `rawOHLC`는 **무조정 공식 KRX 원가격**(분할·배당 미조정). 조정은 파이프라인이 원장 기준으로 수행.
- `KOSPI_INDEX`는 레짐/캘린더용으로 **반드시 포함**(≥200 세션).
- 각 security의 `eventVerificationStatus`는 그 종목의 모든 관련 이벤트를 원장에 넣었을 때만 `"verified-complete"`로 표기.

## 획득처 체크리스트

- [ ] **KRX 원시 OHLC**: KRX 정보데이터시스템(data.krx.co.kr) 개별종목 시세 — 상폐 종목 포함. export 파일별 sha256 기록.
- [ ] **KOSPI 지수** 일봉 → `KOSPI_INDEX`.
- [ ] **배당(cash_dividend)**: DART 배당 공시 + KRX 배당정보. 종목·연도별.
- [ ] **분할/병합/감자/유증(split/merger/capital_reduction/rights_issue)**: DART 주요사항보고서 + KRX 상장공시.
- [ ] **상폐/정리매매(delisting)**: KRX 상장폐지 공시 + DART — 대가(cashPerShare) 명시. **이 항목이 생존편향 제거의 핵심.**
- [ ] **티커변경/분할승계(ticker_change/spin_off/merger consideration)**: 승계 증권 ID 매핑.
- [ ] 모든 소스 문서를 로컬 `sources/`에 저장하고 url·retrievedAt·sha256 기록.

## ③ 실행 (아카이빙 완료 후)

```bash
node skills/kr-strategy-backtest/scripts/build-official-corporate-action-ledger.js \
  --input path/to/candidate-corporate-actions.json \
  --out path/to/corporate-actions.json

node skills/kr-strategy-backtest/scripts/prepare-official-total-return-cache.js \
  --input path/to/official-raw-prices.json \
  --event-ledger path/to/corporate-actions.json \
  --out-cache .tmp/kr-strategy-backtest/official-total-return

node skills/kr-strategy-backtest/scripts/run-annual-top300-minervini-earnings-regime.js \
  --universe annual-cap300b \
  --price-mode official-total-return --strict-events \
  --universe-file analysis-example/kr-market/strategies/annual-cap300b/universe-ledger-yearend-cap300b-2015-2025.json \
  --price-cache .tmp/kr-strategy-backtest/official-total-return \
  --event-ledger path/to/corporate-actions.json \
  --calendar-security-id KOSPI_INDEX \
  --compare-universe-file analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json \
  --out-dir analysis-example/kr-market/strategies/official-total-return
```

## Definition of Done (A2 → A4)

- [ ] `official-total-return/` 산출물(.json/.md) 존재, `--strict-events` 실패 없이 통과.
- [ ] 커버리지 게이트 전 연도 ≥90% (미검증 이벤트·상폐대가 누락 시 산출 안 됨).
- [ ] **official CAGR** 확정 → 이 값으로 A4 대표지표 교체:
  - `strategy-policy.json` `primaryStrategyStatement`
  - `annual-top300/README.md` 대표 수치
  - 21.78% raw-cache는 "보조 진단"으로 강등.
- [ ] Phase B/C 검증(vol타깃 제거=R1, forward MDD ~−30%대)을 official 캐시에서 재확인.

## 우선순위 힌트 (규모가 부담되면)

1,180종목 전량 대신 **상폐·합병 종목만 우선 아카이빙**하면 편향의 대부분을 잡는다(생존자는 Yahoo 배당조정 12.89%로 이미 근사됨; 빠진 건 상폐 손실). 상폐군만 official로 처리하고 생존군은 Yahoo 배당조정으로 채우는 **하이브리드 캐시**가 전량 아카이빙 전 중간 단계로 유효하다(단 이 경우 결과 라벨에 "부분 official" 명시).
