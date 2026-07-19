#!/usr/bin/env python3
"""Boundary and band tests for the live 52w-high new-entry jump gate."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).with_name("build-live-krx-52w-monthly.py")
SPEC = importlib.util.spec_from_file_location("build_live_52w", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

def row(rank, ticker, one_day_return):
    return {
        "ticker": ticker,
        "name": ticker,
        "rank52": rank,
        "oneDayReturn": one_day_return,
        "signalDate": "2026-01-02",
        "signalClose": 125,
        "previousTradingDate": "2025-12-30",
        "previousTradingClose": 100,
    }

rows = [row(rank, f"{rank:06d}", 0.01) for rank in range(1, 20)]
rows[0] = row(1, "100001", 0.25)
rows[1] = row(2, "100002", 0.2499)
rows.append(row(20, "999999", 0.2845))

result = MODULE.select_target(rows, [{"ticker": "999999"}])
assert "999999" in result["target"], "rank-45 incumbent must survive a +28.45% day"
assert "100001" not in result["target"], "exact +25.00% new entry must be excluded"
assert "100002" in result["target"], "+24.99% new entry must remain eligible"
assert len(result["target"]) == 15, "the next-ranked candidate must backfill the slot"
assert result["blocked"][0]["ticker"] == "100001"
assert result["blocked"][0]["causedPortfolioReplacement"] is True
assert result["incumbentExemptions"][0]["ticker"] == "999999"

full = MODULE.select_target(rows, [{"ticker": item["ticker"]} for item in rows[:15]])
assert not full["blocked"], "no vacancy means there is no prospective new entry to screen"

print("live 52w-high entry-jump filter tests passed")
