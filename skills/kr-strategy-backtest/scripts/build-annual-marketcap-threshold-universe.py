#!/usr/bin/env python3
"""Build a point-in-time KRX common-share universe above an annual cap floor.

The snapshot of year t is intended only for use in t+1.  It is deliberately
separate from the annual Top-300 workbook because a fixed cap floor can contain
substantially more than 300 names.
"""

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

import pyarrow.parquet as pq


MARKETS = {"KOSPI", "KOSDAQ", "KOSDAQ GLOBAL"}
PRODUCT_RE = re.compile(r"ETF|ETN|SPAC|스팩|리츠|REIT|레버리지|인버스|커버드콜", re.I)
PREFERRED_RE = re.compile(r"우선|[1-3]?우(?:B|C)?$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def iso_date(value) -> str:
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    return str(value)[:10]


def common_share(name: str, market: str) -> bool:
    return market in MARKETS and not PRODUCT_RE.search(name) and not PREFERRED_RE.search(name)


def snapshot(file: Path, year: int, threshold: int | None, top_n: int | None) -> dict:
    table = pq.read_table(file, columns=["Date", "Code", "Name", "Market", "Marcap"])
    rows = table.to_pylist()
    last = max(iso_date(row["Date"]) for row in rows)
    ending = [row for row in rows if iso_date(row["Date"]) == last]
    common = []
    for row in ending:
        name, market, cap = str(row["Name"]), str(row["Market"]), row["Marcap"]
        if common_share(name, market) and isinstance(cap, (int, float)) and cap > 0:
            common.append({
                "ticker": str(row["Code"]).zfill(6), "name": name,
                "market": "KOSDAQ" if market == "KOSDAQ GLOBAL" else market,
                "marketCap": int(cap),
            })
    common.sort(key=lambda row: (-row["marketCap"], row["ticker"]))
    # A few historical source snapshots contain duplicate codes.  Retain the
    # highest-cap row before assigning the market-cap rank.
    unique, seen = [], set()
    for row in common:
        if row["ticker"] not in seen:
            unique.append(row)
            seen.add(row["ticker"])
    ranked = [{**row, "rank": rank} for rank, row in enumerate(unique, start=1)]
    constituents = ranked[:top_n] if top_n else [row for row in ranked if row["marketCap"] >= threshold]
    return {
        "rankingYear": year,
        "asOfDate": last,
        # Kept for compatibility with the annual-universe reader.  This is the
        # raw KOSPI/KOSDAQ listing count, not a Top-300 count.
        "rawTop300Count": len(ending),
        "rawListedCount": len(ending),
        "commonListedCount": len(unique),
        "commonShareCount": len(constituents),
        "marketCapThreshold": threshold,
        "maxConstituents": top_n or max(1, len(constituents)),
        "sourceFile": str(file),
        "sourceSha256": sha256_file(file),
        "constituents": constituents,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--marcap-dir", default="marcap/data")
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--min-market-cap", type=int, default=300_000_000_000)
    parser.add_argument("--top-n", type=int)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.start_year > args.end_year or (args.top_n is None and args.min_market_cap <= 0) or (args.top_n is not None and args.top_n <= 0):
        raise SystemExit("invalid year range, market-cap threshold, or top-n")
    root = Path(args.marcap_dir)
    snapshots = []
    for year in range(args.start_year, args.end_year + 1):
        source = root / f"marcap-{year}.parquet"
        if not source.exists():
            raise SystemExit(f"missing source: {source}")
        entry = snapshot(source, year, None if args.top_n else args.min_market_cap, args.top_n)
        if not entry["constituents"]:
            raise SystemExit(f"{year}: no ordinary shares above threshold")
        snapshots.append(entry)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "schemaVersion": 1,
        "source": "FinanceData/marcap KRX daily parquet, year-end close snapshots",
        "methodology": "year-end-market-cap-rank" if args.top_n else "year-end-market-cap-threshold",
        "marketCapThreshold": None if args.top_n else args.min_market_cap,
        "topN": args.top_n,
        "applicationRule": "snapshot year t is eligible only in t+1",
        "snapshots": snapshots,
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"out": str(out), "threshold": None if args.top_n else args.min_market_cap, "topN": args.top_n, "snapshots": [{"year": x["rankingYear"], "asOfDate": x["asOfDate"], "count": x["commonShareCount"]} for x in snapshots]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
