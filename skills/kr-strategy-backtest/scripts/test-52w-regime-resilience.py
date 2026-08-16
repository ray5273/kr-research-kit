#!/usr/bin/env python3
"""Fixture tests for the reboot-resilience behaviour of krx-52w-high-portfolio.py.

Covers the three failure modes that used to silently degrade the live regime job:
  1. a halted holding killing the whole run,
  2. the +/-3% hysteresis being lost when no regime state is persisted,
  3. the coverage floor / retry plumbing being importable at all.
Run: python3 skills/kr-strategy-backtest/scripts/test-52w-regime-resilience.py
"""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("regime_job", HERE / "krx-52w-high-portfolio.py")
job = importlib.util.module_from_spec(spec)
spec.loader.exec_module(job)

failures = []


def check(name, condition):
    if condition:
        print(f"  OK  {name}")
    else:
        print(f" FAIL {name}")
        failures.append(name)


def bar(close, volume=1000):
    return {"open": close, "high": close, "low": close, "close": close, "volume": volume}


# --- 1. halted holdings are reported, not fatal -----------------------------------
DATE = "2026-07-31"
tickers = ["000001", "000002", "000003"]
by = {
    "000001": {DATE: bar(1000)},
    # Naver emits a zero-OHLC, zero-volume row through a halt: present but untradable.
    "000002": {DATE: {"open": 0, "high": 0, "low": 0, "close": 5000, "volume": 0}},
    "000003": {},  # no bar at all
}
halted = job.halted_holdings(tickers, by, DATE)
check("halted_holdings flags the zero-volume halt row", "000002" in halted)
check("halted_holdings flags a missing bar", "000003" in halted)
check("halted_holdings leaves the tradable name alone", "000001" not in halted)
check("a partially halted portfolio is not fatal", len(halted) < len(tickers))
check(
    "a fully dark portfolio is still detected",
    len(job.halted_holdings(["000002", "000003"], by, DATE)) == 2,
)

# --- 2. hysteresis survives a lost state file -------------------------------------
# Rise well above the 200-day mean (latching ON), then park just inside the +/-3%
# dead zone. There a bare close>=SMA200 cross is a coin flip on noise; the hysteresis
# must keep holding the latched state.
closes = [100.0] * 200 + [130.0] * 60
for _ in range(30):                       # settle to +1% of the trailing SMA200
    closes.append(sum(closes[-200:]) / 200 * 1.01)
on_from_replay = job.replay_regime(closes)
close, sma, distance, on_no_state, restored = job.regime([{"close": c} for c in closes], {})
check("replay_regime returns a bool", isinstance(on_from_replay, bool))
check("regime() reports that it restored state", restored is True)
check("regime() with no prior state matches the replay", on_no_state == on_from_replay)

sma200 = sum(closes[-200:]) / 200
check("test fixture really sits inside the dead zone", abs(closes[-1] / sma200 - 1) < 0.03)
check("dead-zone state is held ON, not reset by a bare cross", on_no_state is True)

# a persisted state must win inside the dead zone
_, _, _, on_prior_off, restored_off = job.regime([{"close": c} for c in closes], {"regimeOn": False})
check("persisted OFF is respected inside the dead zone", on_prior_off is False)
check("regime() does not claim restoration when state exists", restored_off is False)

# outside the band the threshold overrides any prior state
spike = [100.0] * 200 + [200.0]
_, _, _, on_spike, _ = job.regime([{"close": c} for c in spike], {"regimeOn": False})
check("+3% breach forces ON regardless of prior state", on_spike is True)
crash = [100.0] * 200 + [50.0]
_, _, _, on_crash, _ = job.regime([{"close": c} for c in crash], {"regimeOn": True})
check("-3% breach forces OFF regardless of prior state", on_crash is False)

# --- 3. retry plumbing is wired ---------------------------------------------------
check("fetch retries are configurable", isinstance(job.FETCH_RETRIES, int) and job.FETCH_RETRIES >= 1)
try:
    job.fetch("https://127.0.0.1:9/never", timeout=1, retries=1)
    check("fetch raises after exhausting retries", False)
except RuntimeError as error:
    check("fetch raises after exhausting retries", "failed after 1 attempts" in str(error))

print()
if failures:
    print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
    sys.exit(1)
print("52w-high regime resilience tests passed")
