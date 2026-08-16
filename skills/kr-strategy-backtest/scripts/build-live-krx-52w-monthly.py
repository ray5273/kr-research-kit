#!/usr/bin/env python3
"""Build the MONTHLY 52-week-high KRX target from live prices (top-15 + band).

Replaces the weekly RS+EPS builder for the 52w-high strategy. Selection is pure
52-week-high proximity (close / trailing-252 max), point-in-time DART-covered
universe (fundamentals.json), Samsung (005930) excluded. Rebalances only once per
calendar month (first run of the month); otherwise it is a no-op so the daily
regime job keeps the standing holdings. A rebalancing band keeps incumbents ranked
within HOLD_BUFFER_RANK. A new candidate whose signal-close return versus its
previous trading close is >=25% is skipped and the slot is filled by the next
ranked candidate. Incumbents within the band are never subject to this jump gate.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
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
NEW_ENTRY_JUMP_THRESHOLD = 0.25
FORCE_REBUILD = os.environ.get("HERMES_FORCE_REBUILD") == "1"
REQUESTED_SIGNAL_DATE = os.environ.get("HERMES_SIGNAL_DATE")
FETCH_RETRIES = int(os.environ.get("HERMES_FETCH_RETRIES", "4"))

def read(p, d):
    try: return json.loads(p.read_text())
    except FileNotFoundError: return d

def parse_naver_rows(text):
    rows = re.findall(
        r'\["(\d{8})",\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)',
        text,
    )
    return [{
        "date": f"{d[:4]}-{d[4:6]}-{d[6:]}",
        "open": float(o),
        "high": float(h),
        "low": float(l),
        "close": float(c),
        "volume": float(v),
    } for d, o, h, l, c, v in rows if float(c) > 0]

def tradable(bar):
    return all(float(bar.get(k, 0)) > 0 for k in ("open", "high", "low", "close", "volume"))

def select_target(rows, prior_holdings, holdings=HOLDINGS, hold_buffer_rank=HOLD_BUFFER_RANK, jump_threshold=NEW_ENTRY_JUMP_THRESHOLD):
    """Apply the band first, then the inclusive jump gate to NEW candidates."""
    rank_by = {row["ticker"]: index + 1 for index, row in enumerate(rows)}
    kept = [
        str(holding["ticker"]).zfill(6)
        for holding in prior_holdings
        if rank_by.get(str(holding["ticker"]).zfill(6), 10 ** 9) <= hold_buffer_rank
    ]
    kept_set = set(kept)
    vacancies = max(0, holdings - len(kept))
    fill, blocked = [], []
    if vacancies:
        for row in rows:
            if row["ticker"] in kept_set:
                continue
            if float(row["oneDayReturn"]) >= jump_threshold:
                blocked.append({
                    "ticker": row["ticker"],
                    "name": row["name"],
                    "originalRank": row["rank52"],
                    "oneDayReturn": row["oneDayReturn"],
                    "signalDate": row["signalDate"],
                    "previousTradingDate": row["previousTradingDate"],
                    "previousTradingClose": row["previousTradingClose"],
                    "signalClose": row["signalClose"],
                })
                continue
            fill.append(row["ticker"])
            if len(fill) == vacancies:
                break
    target = (kept + fill)[:holdings]
    target_set = set(target)
    unfiltered_fill = [row["ticker"] for row in rows if row["ticker"] not in kept_set][:vacancies]
    added_by_filter = [ticker for ticker in fill if ticker not in set(kept + unfiltered_fill)]
    removed_by_filter = [ticker for ticker in unfiltered_fill if ticker not in target_set]
    replacement_by_ticker = {ticker: added_by_filter[index] if index < len(added_by_filter) else None for index, ticker in enumerate(removed_by_filter)}
    for item in blocked:
        item["causedPortfolioReplacement"] = item["ticker"] in replacement_by_ticker
        item["replacementTicker"] = replacement_by_ticker.get(item["ticker"])
    incumbent_exemptions = [{
        "ticker": ticker,
        "name": next(row["name"] for row in rows if row["ticker"] == ticker),
        "rank": rank_by[ticker],
        "oneDayReturn": next(row["oneDayReturn"] for row in rows if row["ticker"] == ticker),
    } for ticker in kept if next(row["oneDayReturn"] for row in rows if row["ticker"] == ticker) >= jump_threshold]
    return {
        "target": target,
        "kept": kept,
        "blocked": blocked,
        "addedByFilter": added_by_filter,
        "incumbentExemptions": incumbent_exemptions,
    }

def naver(t):
    # Retry with backoff: this job fires on days 1-3 and the box reboots every few
    # days, so a fetch that hits a not-yet-ready network must not silently drop the
    # ticker out of the candidate set.
    q = urllib.parse.urlencode({"symbol": t, "requestType": 1, "startTime": "20240101", "endTime": "20300101", "timeframe": "day"})
    last = None
    for attempt in range(FETCH_RETRIES):
        try:
            r = urllib.request.Request("https://api.finance.naver.com/siseJson.naver?" + q, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"})
            return parse_naver_rows(urllib.request.urlopen(r, timeout=25).read().decode("euc-kr", "ignore"))
        except Exception as error:
            last = error
            if attempt + 1 < FETCH_RETRIES: time.sleep(2 ** attempt)
    raise RuntimeError(f"{t}: {last}")

def main():
    raw = read(CACHE / "top300.json", [])
    universe = raw if isinstance(raw, list) else raw.get("top300", raw.get("listings", []))
    universe = [x for x in universe if x.get("ticker") and x.get("market") in ("KOSPI", "KOSDAQ")][:300]
    excluded = {str(t).zfill(6) for t in read(COMPLIANCE_FILE, {}).get("excludedTickers", [])}
    universe = [x for x in universe if str(x.get("ticker", "")).zfill(6) not in excluded]
    fundamentals = read(CACHE / "fundamentals.json", {}).get("byTicker", {})

    prices, fetch_failures = {}, []
    with ThreadPoolExecutor(max_workers=16) as ex:
        futures = {ex.submit(naver, str(x["ticker"]).zfill(6)): x for x in universe}
        for f in as_completed(futures):
            t = str(futures[f]["ticker"]).zfill(6)
            try: prices[t] = f.result()
            except Exception as error: fetch_failures.append({"ticker": t, "name": futures[f].get("name", t), "error": str(error)[:200]})
    # Price-coverage floor, mirroring the backtest's 90% annual coverage gate. Without
    # it a transient network failure silently rebalances off a partial universe.
    coverage = len(prices) / len(universe) if universe else 0
    if coverage < 0.9:
        raise RuntimeError(f"Price coverage {coverage:.1%} ({len(prices)}/{len(universe)}) is below the 90% floor; refusing to rebalance on a partial universe")

    if REQUESTED_SIGNAL_DATE:
        datetime.strptime(REQUESTED_SIGNAL_DATE, "%Y-%m-%d")
    available_dates = [
        bar["date"]
        for series in prices.values()
        for bar in series
        if tradable(bar) and (not REQUESTED_SIGNAL_DATE or bar["date"] <= REQUESTED_SIGNAL_DATE)
    ]
    if not available_dates: raise RuntimeError("No tradable KRX bars are available")
    signal = REQUESTED_SIGNAL_DATE or max(available_dates)

    rows, stale_or_untradable = [], []
    for x in universe:
        t = str(x["ticker"]).zfill(6)
        raw_series = [bar for bar in prices.get(t, []) if bar["date"] <= signal]
        series = [bar for bar in raw_series if tradable(bar)]
        # Require a genuinely tradable signal-date bar. Naver emits zero-OHLC,
        # zero-volume rows with a repeated close during trading halts; accepting
        # those rows can rank a suspended or delisted security near its 52w high.
        if not series or series[-1]["date"] != signal:
            if raw_series: stale_or_untradable.append({"ticker": t, "name": x.get("name", t), "lastRawDate": raw_series[-1]["date"], "lastTradableDate": series[-1]["date"] if series else None})
            continue
        # Require >=253 tradable sessions (52w) and DART coverage to match the backtest universe.
        if len(series) < 253 or t not in fundamentals: continue
        closes = [bar["close"] for bar in series]
        high52 = max(closes[-252:])
        proximity = closes[-1] / high52 if high52 > 0 else 0
        rows.append({
            "ticker": t,
            "name": x.get("name", t),
            "market": x.get("market"),
            "proximity": proximity,
            "filing": fundamentals[t].get("filingDate"),
            "signalDate": signal,
            "signalClose": closes[-1],
            "previousTradingDate": series[-2]["date"],
            "previousTradingClose": closes[-2],
            "oneDayReturn": closes[-1] / closes[-2] - 1,
        })
    if len(rows) < HOLDINGS: raise RuntimeError(f"Only {len(rows)} eligible rows after price/DART validation")

    rows.sort(key=lambda r: r["proximity"], reverse=True)
    for i, r in enumerate(rows): r["score"] = r["proximity"]; r["rank52"] = i + 1

    d = datetime.strptime(signal, "%Y-%m-%d").date() + timedelta(days=1)
    while d.weekday() > 4: d += timedelta(days=1)
    execution = d.isoformat()

    state = read(OUT, {"selections": []})
    selections = state.get("selections", [])
    # Monthly gate: if a selection already exists for this execution month, keep it.
    this_month = execution[:7]
    if any(s.get("executionDate", "")[:7] == this_month for s in selections) and not FORCE_REBUILD:
        print(json.dumps({"summary": f"52w-high monthly target already set for {this_month}; no rebalance.", "success": True, "wakeAgent": False}, ensure_ascii=False)); return

    # Rebalancing band + soft roll: keep prior incumbents still within the band,
    # then apply the inclusive 25% gate only while filling NEW-entry slots.
    prior_holdings = selections[-1]["holdings"] if selections else []
    target_result = select_target(rows, prior_holdings)
    target = target_result["target"]
    by_ticker = {r["ticker"]: r for r in rows}
    holdings = [by_ticker[t] for t in target if t in by_ticker]
    if len(holdings) != HOLDINGS: raise RuntimeError(f"Target contains {len(holdings)} holdings; expected {HOLDINGS}")
    holdings.sort(key=lambda r: r["score"], reverse=True)
    for rank, h in enumerate(holdings, start=1): h["rank"] = rank; h["targetWeight"] = round(1.0 / len(holdings), 6)

    event = {
        "signalDate": signal,
        "executionDate": execution,
        "candidates": len(rows),
        "strategy": "52w-high monthly top15 + band45 + new-entry jump filter",
        "holdings": holdings,
        "excludedTickers": sorted(excluded),
        "staleOrUntradable": stale_or_untradable,
        "priceCoverage": {"fetched": len(prices), "universe": len(universe), "ratio": round(coverage, 4), "failures": fetch_failures},
        "entryJumpFilter": {
            "enabled": True,
            "threshold": NEW_ENTRY_JUMP_THRESHOLD,
            "thresholdPct": NEW_ENTRY_JUMP_THRESHOLD * 100,
            "inclusive": True,
            "appliesTo": "new entries only; rank-45 incumbents exempt",
            "keptIncumbents": target_result["kept"],
            "excludedCandidates": target_result["blocked"],
            "addedByFilter": target_result["addedByFilter"],
            "incumbentExemptions": target_result["incumbentExemptions"],
        },
        "forcedRebuild": FORCE_REBUILD,
        "generatedAt": datetime.now().isoformat(),
    }
    prior = [s for s in selections if s.get("executionDate") != execution]; prior.append(event)
    prior = sorted(prior, key=lambda s: s["executionDate"])[-104:]
    OUT.write_text(json.dumps({"selections": prior}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"summary": f"52w-high MONTHLY rebalance for {this_month}: {len(holdings)} holdings, execution {execution}; {len(target_result['blocked'])} new-entry jumps >=25% screened; {len(stale_or_untradable)} stale/untradable excluded; price coverage {coverage:.1%} ({len(fetch_failures)} fetch failures)", "success": True, "signal": {"signalDate": signal, "executionDate": execution, "holdings": [h["name"] for h in holdings], "entryJumpExcluded": [x["ticker"] for x in target_result["blocked"]]}, "wakeAgent": False}, ensure_ascii=False))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"summary": "52w-high monthly rebalance failed", "success": False, "error": str(e), "wakeAgent": True}, ensure_ascii=False)); sys.exit(1)
