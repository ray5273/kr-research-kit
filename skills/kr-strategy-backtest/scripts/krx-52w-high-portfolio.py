#!/usr/bin/env python3
"""Daily regime check + Telegram delivery for the 52-week-high monthly KRX
portfolio. Regime-only exposure (KOSPI SMA200 +/-3% hysteresis; no volatility
target). Reads the standing monthly selection from live-weekly-selections.json.
Set HERMES_DRYRUN=1 to print the message instead of sending it.
"""
import json, math, os, re, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path

HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
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

def naver(ticker):
    query = urllib.parse.urlencode({"symbol": ticker, "requestType": 1, "startTime": "20260101", "endTime": "20300101", "timeframe": "day"})
    request = urllib.request.Request("https://api.finance.naver.com/siseJson.naver?" + query, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"})
    text = urllib.request.urlopen(request, timeout=20).read().decode("euc-kr", "ignore")
    rows = re.findall(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', text)
    return [{"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "close": float(c)} for d, o, _h, _l, c in rows if float(c) > 0]

def regime(kospi, prior):
    closes = [float(x["close"]) for x in kospi if x.get("close") is not None]
    if len(closes) < 200: raise RuntimeError("KOSPI history has fewer than 200 closes")
    close, sma = closes[-1], sum(closes[-200:]) / 200
    distance = close / sma - 1
    on = prior.get("regimeOn", close >= sma)
    if distance >= .03: on = True
    elif distance <= -.03: on = False
    return close, sma, distance, on

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
    latest = selections[-1]
    tickers = [str(x["ticker"]).zfill(6) for x in latest["holdings"]]
    if "005930" in tickers: raise RuntimeError("Compliance-excluded ticker 005930 is present")
    names = {str(x["ticker"]).zfill(6): x["name"] for x in latest["holdings"]}
    histories = {t: naver(t) for t in tickers}
    common = set.intersection(*(set(x["date"] for x in rows) for rows in histories.values()))
    dates = sorted(common)
    if len(dates) < 2: raise RuntimeError("Insufficient common daily price history")
    as_of = dates[-1]
    active = [s for s in selections if s.get("executionDate", "") <= as_of]
    # The latest selection is the standing target; if its execution date is still
    # in the next session, report it as the incoming portfolio rather than failing.
    weekly = active[-1] if active else selections[-1]
    if [str(x["ticker"]).zfill(6) for x in weekly["holdings"]] != tickers:
        tickers = [str(x["ticker"]).zfill(6) for x in weekly["holdings"]]
        names = {str(x["ticker"]).zfill(6): x["name"] for x in weekly["holdings"]}
        histories = {t: naver(t) for t in tickers}
        common = set.intersection(*(set(x["date"] for x in rows) for rows in histories.values())); dates = sorted(common); as_of = dates[-1]
    by = {t: {x["date"]: x for x in rows} for t, rows in histories.items()}

    close, sma, distance, on = regime(read(KOSPI, {}).get("bars", []), prior)
    equity = 1.0 if on else 0.0                    # regime-only: no volatility target (R1)
    ranked = sorted(weekly["holdings"], key=lambda item: float(item.get("score", float("-inf"))), reverse=True)
    rank_by = {str(item["ticker"]).zfill(6): rank for rank, item in enumerate(ranked, start=1)}
    n = len(tickers)
    changes = []
    for t in tickers:
        row = by[t][as_of]; prev = by[t].get(dates[-2]); change = (row["close"] / prev["close"] - 1) * 100 if prev else 0
        holding = next(item for item in ranked if str(item["ticker"]).zfill(6) == t)
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
    label = "ON" if on else "OFF"
    action = "레짐 ON 유지 · 다음 거래일 매도 없음" if on else "레짐 OFF · 다음 거래일 시가 전량 매도 후 현금화"
    message = "\n".join([
        f"KRX 52주 신고가 + 레짐 포트폴리오 ({as_of})",
        f"월간 신호 {weekly['signalDate']} → 적용 {weekly['executionDate']} · 매월 첫 거래일 재선정",
        f"KOSPI {close:,.2f} / SMA200 {sma:,.2f} / 괴리 {distance * 100:+.2f}% / {label}",
        f"확정: 주식 {equity * 100:.2f}% · 현금 {(1 - equity) * 100:.2f}% (변동성 타깃 없음, 레짐 단독)",
        f"컴플라이언스 제외: 005930",
        f"행동: {action}",
        "", f"보유 {n}종목 (52주 신고가 근접 순위 / 오늘 종가 / 목표비중)", *changes,
        *rebalance_lines,
    ])
    key = f"52w:{weekly['executionDate']}:{as_of}:{label}"
    if DRYRUN:
        print("=== DRYRUN (not sent) ===\n" + message)
    elif prior.get("sentKey") != key:
        send(values["TELEGRAM_BOT_TOKEN"], values["TELEGRAM_CHAT_ID"], message)
        prior["sentKey"] = key
    OUT.joinpath(as_of).mkdir(parents=True, exist_ok=True)
    OUT.joinpath(as_of, "report.md").write_text(message + "\n")
    if not DRYRUN:
        STATE.write_text(json.dumps({**prior, "asOf": as_of, "monthlySignal": weekly["signalDate"], "regimeOn": on, "equityPct": round(equity * 100, 4), "cashPct": round((1 - equity) * 100, 4)}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"summary": f"52w-high regime portfolio checked for {as_of} ({label}, {n} holdings){' [DRYRUN]' if DRYRUN else ''}", "success": True, "wakeAgent": False}, ensure_ascii=False))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"summary": "52w-high regime portfolio failed", "success": False, "error": str(e), "wakeAgent": True}, ensure_ascii=False)); sys.exit(1)
