#!/usr/bin/env python3
"""Daily regime check + Telegram delivery for the 52-week-high monthly KRX
portfolio. Regime-only exposure (KOSPI SMA200 +/-3% hysteresis; no volatility
target). Reads the standing monthly selection from live-52w-high-selections.json
and displays the adopted >=25% new-entry jump-filter audit on rebalance days.
Set HERMES_DRYRUN=1 to print the message instead of sending it.
"""
import json, math, os, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
FETCH_RETRIES = int(os.environ.get("HERMES_FETCH_RETRIES", "4"))
CREDS = HOME / "config" / "krx-weekly-regime-vol-portfolio"   # reuse .env + compliance
STATE = CREDS / "state-52w-high.json"
CACHE = Path.home() / ".cache" / "krx-trend-portfolio-monitor"
LIVE_LEDGER = CACHE / "live-52w-high-selections.json"
KOSPI = CACHE / "kospi.json"
OUT = HOME / "artifacts" / "krx-52w-high-portfolio"
DRYRUN = os.environ.get("HERMES_DRYRUN") == "1"

def read(p, d):
    try: return json.loads(p.read_text())
    except FileNotFoundError: return d

def env():
    values = {}
    for line in (CREDS / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1); values[k.strip()] = v.strip().strip('"').strip("'")
    return values

def fetch(url, timeout=20, retries=None):
    # The box reboots every few days. A job that fires before the network is up
    # would otherwise lose the whole day's regime signal on the first exception.
    attempts = FETCH_RETRIES if retries is None else retries
    last = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"})
            return urllib.request.urlopen(request, timeout=timeout).read().decode("euc-kr", "ignore")
        except Exception as error:
            last = error
            if attempt + 1 < attempts: time.sleep(2 ** attempt)
    raise RuntimeError(f"Naver fetch failed after {attempts} attempts ({url.split('symbol=')[-1][:6]}): {last}")

def naver(ticker):
    query = urllib.parse.urlencode({"symbol": ticker, "requestType": 1, "startTime": "20260101", "endTime": "20300101", "timeframe": "day"})
    text = fetch("https://api.finance.naver.com/siseJson.naver?" + query)
    rows = re.findall(r'\["(\d{8})",\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)', text)
    return [{"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "open": float(o), "high": float(h), "low": float(l), "close": float(c), "volume": float(v)} for d, o, h, l, c, v in rows if float(c) > 0]

def tradable(bar):
    return all(float(bar.get(k, 0)) > 0 for k in ("open", "high", "low", "close", "volume"))

def halted_holdings(tickers, by, date):
    """Holdings without a genuinely tradable bar on `date`.

    A halted holding must not blind the regime monitor. Suspensions do happen in
    this universe (Naver keeps emitting zero-OHLC rows through a halt), and the
    caller used to raise on any of them -- killing the job every day until the halt
    lifted, exactly when a regime flip most needs delivering. Only a completely dark
    portfolio is a genuine failure.
    """
    return [t for t in tickers if date not in by.get(t, {}) or not tradable(by[t][date])]

def replay_regime(closes):
    """Derive the hysteresis state by walking the cached series forward.

    Used when no regime state is persisted (fresh box, wiped config, first run).
    Defaulting to a bare close>=SMA200 cross would silently drop the +/-3% buffer
    and whipsaw around the 200-day line in a way the backtest never does.
    """
    on = None
    for index in range(199, len(closes)):
        spot, mean = closes[index], sum(closes[index - 199 : index + 1]) / 200
        gap = spot / mean - 1
        if on is None: on = spot >= mean
        if gap >= .03: on = True
        elif gap <= -.03: on = False
    return on

def regime(kospi, prior):
    closes = [float(x["close"]) for x in kospi if x.get("close") is not None]
    if len(closes) < 200: raise RuntimeError("KOSPI history has fewer than 200 closes")
    close, sma = closes[-1], sum(closes[-200:]) / 200
    distance = close / sma - 1
    on = prior.get("regimeOn")
    restored = on is None
    if restored: on = replay_regime(closes)
    if distance >= .03: on = True
    elif distance <= -.03: on = False
    return close, sma, distance, on, restored

def send(token, chat_id, message):
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": message, "disable_web_page_preview": "true"}).encode()
    response = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body), timeout=30).read())
    if not response.get("ok"): raise RuntimeError("Telegram delivery failed")

def main():
    values = env()
    if not values.get("TELEGRAM_BOT_TOKEN") or not values.get("TELEGRAM_CHAT_ID"):
        raise RuntimeError("Dedicated Telegram credentials are missing")
    node = os.environ.get("HERMES_NODE", "/opt/homebrew/opt/node@22/bin/node")
    refresh = subprocess.run([node if Path(node).exists() else "node", str(HOME / "scripts" / "build-trend-monitor-cache.js")], text=True, capture_output=True)
    if refresh.returncode: raise RuntimeError("KOSPI/fundamentals cache refresh failed")
    prior = read(STATE, {})
    live = read(LIVE_LEDGER, {})
    selections = sorted(live.get("selections", []), key=lambda item: item.get("executionDate", ""))
    if not selections: raise RuntimeError("52w-high monthly selection ledger is unavailable")
    kospi_bars = read(KOSPI, {}).get("bars", [])
    close, sma, distance, on, regime_restored = regime(kospi_bars, prior)
    kospi_date = kospi_bars[-1]["date"] if kospi_bars else None
    if not kospi_date: raise RuntimeError("KOSPI cache has no dated bars")
    active = [s for s in selections if s.get("executionDate", "") <= kospi_date]
    # The latest selection is the standing target; if its execution date is still
    # in the next session, report it as the incoming portfolio rather than failing.
    weekly = active[-1] if active else selections[-1]
    tickers = [str(x["ticker"]).zfill(6) for x in weekly["holdings"]]
    if "005930" in tickers: raise RuntimeError("Compliance-excluded ticker 005930 is present")
    names = {str(x["ticker"]).zfill(6): x["name"] for x in weekly["holdings"]}
    histories = {t: naver(t) for t in tickers}
    by = {t: {x["date"]: x for x in rows} for t, rows in histories.items()}
    unavailable = halted_holdings(tickers, by, kospi_date)
    if len(unavailable) == len(tickers):
        labels = ", ".join(f"{names[t]}({t})" for t in unavailable)
        raise RuntimeError(f"No holding has a tradable {kospi_date} bar: {labels}")
    as_of = kospi_date
    equity = 1.0 if on else 0.0                    # regime-only: no volatility target (R1)
    ranked = sorted(weekly["holdings"], key=lambda item: float(item.get("score", float("-inf"))), reverse=True)
    rank_by = {str(item["ticker"]).zfill(6): rank for rank, item in enumerate(ranked, start=1)}
    n = len(tickers)                               # halted names still hold their target weight
    changes = []
    for t in tickers:
        holding = next(item for item in ranked if str(item["ticker"]).zfill(6) == t)
        previous_rows = [x for x in histories[t] if x["date"] < as_of and tradable(x)]
        prev = previous_rows[-1] if previous_rows else None
        if t in unavailable:
            last_seen = prev["date"] if prev else "없음"
            changes.append(f"- #{rank_by[t]} {names[t]}({t}): 미체결(거래정지 추정) · 마지막 체결 {last_seen} · 신고가근접 {float(holding['score']):.3f} · 목표 {equity * 100 / n:.2f}%")
            continue
        row = by[t][as_of]
        change = (row["close"] / prev["close"] - 1) * 100 if prev else 0
        changes.append(f"- #{rank_by[t]} {names[t]}({t}): {row['close']:,.0f}원 ({change:+.2f}%) · 신고가근접 {float(holding['score']):.3f} · 목표 {equity * 100 / n:.2f}%")
    rebalance_lines = []
    previous = active[-2] if len(active) > 1 else None
    if previous and weekly["executionDate"] == as_of:
        prev_t = {str(item["ticker"]).zfill(6) for item in previous.get("holdings", [])}
        cur_t = {str(item["ticker"]).zfill(6) for item in weekly["holdings"]}
        removed = [item for item in previous["holdings"] if str(item["ticker"]).zfill(6) not in cur_t]
        added = [item for item in weekly["holdings"] if str(item["ticker"]).zfill(6) not in prev_t]
        if removed or added:
            rebalance_lines = ["", f"월간 리밸런싱 ({weekly['executionDate']} 적용)",
                               f"- 제외 ({len(removed)}): " + (", ".join(f"{i['name']}({str(i['ticker']).zfill(6)})" for i in removed) or "없음"),
                               f"- 추가 ({len(added)}): " + (", ".join(f"#{rank_by[str(i['ticker']).zfill(6)]} {i['name']}({str(i['ticker']).zfill(6)})" for i in added) or "없음")]
    jump_filter = weekly.get("entryJumpFilter", {})
    jump_excluded = jump_filter.get("excludedCandidates", [])
    if weekly["executionDate"] == as_of and jump_filter.get("enabled"):
        rebalance_lines.extend([
            f"- 신규진입 급등필터: +{float(jump_filter.get('thresholdPct', 25)):.2f}% 이상, 기존 밴드 보유 면제",
            f"- 급등 제외 ({len(jump_excluded)}): " + (", ".join(f"{i['name']}({str(i['ticker']).zfill(6)}, {float(i['oneDayReturn']) * 100:+.2f}%)" for i in jump_excluded) or "없음"),
        ])
    label = "ON" if on else "OFF"
    action = "레짐 ON 유지 · 다음 거래일 매도 없음" if on else "레짐 OFF · 다음 거래일 시가 전량 매도 후 현금화"
    warnings = []
    if regime_restored:
        warnings.append("⚠ 레짐 상태파일 없음 → 캐시 시계열로 히스테리시스 재생해 판정 (재부팅/설정 초기화 의심)")
    if unavailable:
        warnings.append(f"⚠ 미체결 보유 {len(unavailable)}종목: " + ", ".join(f"{names[t]}({t})" for t in unavailable))
    message = "\n".join([
        f"KRX 52주 신고가 + 레짐 포트폴리오 ({as_of})",
        f"월간 신호 {weekly['signalDate']} → 적용 {weekly['executionDate']} · 매월 첫 거래일 재선정",
        f"KOSPI {close:,.2f} ({kospi_date}) / SMA200 {sma:,.2f} / 괴리 {distance * 100:+.2f}% / {label}",
        f"확정: 주식 {equity * 100:.2f}% · 현금 {(1 - equity) * 100:.2f}% (변동성 타깃 없음, 레짐 단독)",
        f"신규진입 급등필터: +{float(jump_filter.get('thresholdPct', 25)):.2f}% 이상 제외 · 기존 밴드 보유 면제",
        f"컴플라이언스 제외: 005930",
        f"행동: {action}",
        *warnings,
        "", f"보유 {n}종목 (52주 신고가 근접 순위 / 오늘 종가 / 목표비중)", *changes,
        *rebalance_lines,
    ])
    # Halt status is part of the key so a suspension starting or lifting re-delivers.
    key = f"52w:{weekly['executionDate']}:{as_of}:{label}:JUMP25:H{len(unavailable)}"

    def persist():
        STATE.write_text(json.dumps({**prior, "asOf": as_of, "monthlySignal": weekly["signalDate"], "regimeOn": on, "equityPct": round(equity * 100, 4), "cashPct": round((1 - equity) * 100, 4), "unavailableHoldings": unavailable}, ensure_ascii=False, indent=2) + "\n")

    if DRYRUN:
        print("=== DRYRUN (not sent) ===\n" + message)
    elif prior.get("sentKey") != key:
        send(values["TELEGRAM_BOT_TOKEN"], values["TELEGRAM_CHAT_ID"], message)
        prior["sentKey"] = key
        persist()   # persist right after delivery; a later crash must not re-send
    OUT.joinpath(as_of).mkdir(parents=True, exist_ok=True)
    OUT.joinpath(as_of, "report.md").write_text(message + "\n")
    if not DRYRUN:
        persist()
    print(json.dumps({"summary": f"52w-high regime portfolio checked for {as_of} ({label}, {n} holdings){' [DRYRUN]' if DRYRUN else ''}", "success": True, "wakeAgent": False}, ensure_ascii=False))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"summary": "52w-high regime portfolio failed", "success": False, "error": str(e), "wakeAgent": True}, ensure_ascii=False)); sys.exit(1)
