#!/usr/bin/env python3
"""Build the MONTHLY 52-week-high KRX target from live prices (top-15 + band).

Replaces the weekly RS+EPS builder for the 52w-high strategy. Selection is pure
52-week-high proximity (close / trailing-252 max), point-in-time DART-covered
universe (fundamentals.json), Samsung (005930) excluded. Rebalances only once per
calendar month (first run of the month); otherwise it is a no-op so the daily
regime job keeps the standing holdings. A rebalancing band keeps incumbents ranked
within HOLD_BUFFER_RANK; freed slots are filled from the top of the fresh ranking.
"""
import json, os, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
NAME = "krx-weekly-regime-vol-portfolio"          # shared config dir (compliance, caches)
CONFIG = HOME / "config" / NAME
COMPLIANCE_FILE = CONFIG / "compliance-exclusions.json"
CACHE = Path.home() / ".cache" / "krx-trend-portfolio-monitor"
OUT = CACHE / "live-52w-high-selections.json"
HOLDINGS = 15
HOLD_BUFFER_RANK = 45

def read(p, d):
    try: return json.loads(p.read_text())
    except FileNotFoundError: return d

def naver(t):
    q = urllib.parse.urlencode({"symbol": t, "requestType": 1, "startTime": "20240101", "endTime": "20300101", "timeframe": "day"})
    r = urllib.request.Request("https://api.finance.naver.com/siseJson.naver?" + q, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"})
    x = urllib.request.urlopen(r, timeout=25).read().decode("euc-kr", "ignore")
    return [(f"{d[:4]}-{d[4:6]}-{d[6:]}", float(c)) for d, _, _, _, c in re.findall(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', x) if float(c) > 0]

def main():
    raw = read(CACHE / "top300.json", [])
    universe = raw if isinstance(raw, list) else raw.get("top300", raw.get("listings", []))
    universe = [x for x in universe if x.get("ticker") and x.get("market") in ("KOSPI", "KOSDAQ")][:300]
    excluded = {str(t).zfill(6) for t in read(COMPLIANCE_FILE, {}).get("excludedTickers", [])}
    universe = [x for x in universe if str(x.get("ticker", "")).zfill(6) not in excluded]
    fundamentals = read(CACHE / "fundamentals.json", {}).get("byTicker", {})

    prices = {}
    with ThreadPoolExecutor(max_workers=16) as ex:
        futures = {ex.submit(naver, str(x["ticker"]).zfill(6)): x for x in universe}
        for f in as_completed(futures):
            try: prices[str(futures[f]["ticker"]).zfill(6)] = f.result()
            except Exception: pass

    rows, asof = [], None
    for x in universe:
        t = str(x["ticker"]).zfill(6); series = prices.get(t, [])
        # Require >=253 sessions (52w) and DART coverage to match the backtest universe.
        if len(series) < 253 or t not in fundamentals: continue
        closes = [v for _, v in series]
        high52 = max(closes[-252:])
        proximity = closes[-1] / high52 if high52 > 0 else 0
        rows.append({"ticker": t, "name": x.get("name", t), "market": x.get("market"), "proximity": proximity, "filing": fundamentals[t].get("filingDate")})
        asof = max(asof or series[-1][0], series[-1][0])
    if len(rows) < HOLDINGS: raise RuntimeError(f"Only {len(rows)} eligible rows after price/DART validation")

    rows.sort(key=lambda r: r["proximity"], reverse=True)
    rank_by = {r["ticker"]: i + 1 for i, r in enumerate(rows)}
    for i, r in enumerate(rows): r["score"] = r["proximity"]; r["rank52"] = i + 1

    signal = asof
    d = datetime.strptime(signal, "%Y-%m-%d").date() + timedelta(days=1)
    while d.weekday() > 4: d += timedelta(days=1)
    execution = d.isoformat()

    state = read(OUT, {"selections": []})
    selections = state.get("selections", [])
    # Monthly gate: if a selection already exists for this execution month, keep it.
    this_month = execution[:7]
    if any(s.get("executionDate", "")[:7] == this_month for s in selections):
        print(json.dumps({"summary": f"52w-high monthly target already set for {this_month}; no rebalance.", "success": True, "wakeAgent": False}, ensure_ascii=False)); return

    # Rebalancing band + soft roll: keep prior incumbents still within the band,
    # fill remaining slots from the top of the fresh ranking.
    prior_holdings = selections[-1]["holdings"] if selections else []
    kept = [h["ticker"] for h in prior_holdings if rank_by.get(h["ticker"], 10 ** 9) <= HOLD_BUFFER_RANK]
    fill = [r["ticker"] for r in rows if r["ticker"] not in kept][: max(0, HOLDINGS - len(kept))]
    target = (kept + fill)[:HOLDINGS]
    by_ticker = {r["ticker"]: r for r in rows}
    holdings = [by_ticker[t] for t in target if t in by_ticker]
    holdings.sort(key=lambda r: r["score"], reverse=True)
    for rank, h in enumerate(holdings, start=1): h["rank"] = rank; h["targetWeight"] = round(1.0 / len(holdings), 6)

    event = {"signalDate": signal, "executionDate": execution, "candidates": len(rows), "strategy": "52w-high monthly top15 + band", "holdings": holdings, "excludedTickers": sorted(excluded), "generatedAt": datetime.now().isoformat()}
    prior = [s for s in selections if s.get("executionDate") != execution]; prior.append(event)
    prior = sorted(prior, key=lambda s: s["executionDate"])[-104:]
    OUT.write_text(json.dumps({"selections": prior}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"summary": f"52w-high MONTHLY rebalance for {this_month}: {len(holdings)} holdings, execution {execution}", "success": True, "signal": {"signalDate": signal, "executionDate": execution, "holdings": [h["name"] for h in holdings]}, "wakeAgent": False}, ensure_ascii=False))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"summary": "52w-high monthly rebalance failed", "success": False, "error": str(e), "wakeAgent": True}, ensure_ascii=False)); sys.exit(1)
