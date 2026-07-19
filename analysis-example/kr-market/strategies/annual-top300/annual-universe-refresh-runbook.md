# 연간 유니버스 갱신 런북 (라이브 top300.json)

라이브 52주 신고가 전략이 쓰는 `top300.json`을 **시점일치 백테스트와 일치**시키는 절차.

> **철칙:** 이 유니버스는 **연 1회(연말/1월)** 만 갱신한다. 일간·월간 갱신은
> 연중 시총 생존자 유니버스를 몰래 끼워넣어 **전략을 변질**시킨다(룩어헤드+생존편향).
> 거래연도 `Y`는 반드시 **직전 연말 `Y-1` 스냅샷**을 쓴다.

## 정본 원장 (중요)

- **정본:** `universe-ledger-2015-2025.json` (2025 연말 = 공통주 **298**종목, 우선주 제외, 메리츠금융지주 포함).
- **폐기:** `universe-ledger-2016-2025-partial.json` 은 버그본이다 — 로드 시 2025 유니버스가 **288**종목으로 줄고 **메리츠금융지주(rank 33)** + 꼬리 9종목이 누락된다(구버전 추출로 우선주가 스며들어 공통주 자리를 밀어냄). 백테스트·라이브 어디에도 쓰지 말 것.

## 연 1회 갱신 절차 (매년 1월 첫 영업일들)

1. **연말 스냅샷 추출.** `extract_top300_marcap.py`의 `[설정]`에서 `END_YEAR`를 새 연도로
   올리고(예: 2026), `EXCLUDE_PREFERRED=True` 확인 후 실행 → `한국_시가총액_상위300_2015-<END_YEAR>.xlsx`.
   marcap parquet(`marcap/data/`)에 새 연도 데이터가 채워진 뒤여야 함.
   ```bash
   python extract_top300_marcap.py
   ```
2. **원장 재구축.** XLSX → 정규화 JSON 원장.
   ```bash
   node skills/kr-strategy-backtest/scripts/build-annual-top300-universe.js \
     --input 한국_시가총액_상위300_2015-<END_YEAR>.xlsx \
     --out analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-<END_YEAR>.json
   ```
   출력의 `common`(공통주 수)이 연도별로 ~290±10인지, 우선주가 안 섞였는지 확인.
3. **라이브 유니버스 방출.** 새 거래연도의 `top300.json`을 Hermes 캐시에 씀.
   ```bash
   node skills/kr-strategy-backtest/scripts/build-live-top300.js \
     --ledger analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-<END_YEAR>.json \
     --trading-year <새 거래연도> \
     --out ~/.cache/krx-trend-portfolio-monitor/top300.json --force
   ```
   (Hermes 박스 192.168.50.252에서 실행하거나, 레포에서 방출 후 scp 배포.)
4. **일치 검증.** 방출 직후 반드시 확인.
   ```bash
   node skills/kr-strategy-backtest/scripts/build-live-top300.js \
     --trading-year <새 거래연도> --check ~/.cache/krx-trend-portfolio-monitor/top300.json
   # status: OK / exit 0 이어야 함. DRIFT/exit 2면 재방출.
   ```

## 상시 드리프트 감시 (읽기 전용, 언제든 안전)

라이브 파일이 백테스트 스냅샷과 어긋났는지 점검만 함(쓰지 않음). 월 1회나 이상 신호 시:
```bash
node skills/kr-strategy-backtest/scripts/build-live-top300.js \
  --trading-year <현재 연도> --check ~/.cache/krx-trend-portfolio-monitor/top300.json
```
- `OK` (exit 0): 라이브 = 백테스트 스냅샷. 정상.
- `DRIFT` (exit 2): `missingFromLive`/`extraInLive` 확인 → 절차 3으로 재방출.
- `MISSING` (exit 2): 라이브 파일 없음 → 절차 3으로 최초 방출.

## 스케줄 주의

- 갱신(절차 3)은 **연 1회만**. Hermes cron에 걸려면 **1월 1~3일 1회성** 잡으로만.
- 드리프트 감시(`--check`)는 쓰기가 없으므로 월간/이상시 돌려도 안전.
- 라이브 52w-high 빌더(`build-live-krx-52w-monthly.py`)는 이 `top300.json`을 **읽기만** 하고,
  종목 랭킹(월간 리밸런싱)은 별개다. 유니버스 자체는 절대 월간으로 바꾸지 않는다.
