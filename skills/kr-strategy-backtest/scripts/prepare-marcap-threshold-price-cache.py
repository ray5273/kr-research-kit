#!/usr/bin/env python3
"""Create a reproducible KRX price cache for a year-end cap-threshold universe.

The marcap source is raw KRX OHLC.  This normalizer applies a split-only
back-adjustment when the close move is confirmed by a reciprocal, near-integer
change in listed shares.  Rights issues and dividends are deliberately not
treated as splits and remain a stated limitation of the resulting price return
series.
"""

import argparse, json, math
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq


def close_enough_integer(value):
    if value <= 0: return False
    reciprocal = 1 / value
    # Korean par-value changes can produce 50:1 or 100:1 share ratios
    # (for example Samsung Electronics' 2018 split), not just 2:1/5:1.
    return any(abs(value - n) / n < .02 or abs(reciprocal - n) / n < .02 for n in range(2, 101))


def split_adjust(rows):
    rows.sort(key=lambda row: row['date'])
    factor = 1.0
    events = []
    for index in range(len(rows) - 1, 0, -1):
        previous, current = rows[index - 1], rows[index]
        if previous['close'] <= 0 or previous['stocks'] <= 0 or current['stocks'] <= 0: continue
        price_ratio, stock_ratio = current['close'] / previous['close'], current['stocks'] / previous['stocks']
        # A split/reverse split has a reciprocal price/share move and an
        # integer-ish share ratio.  Do not adjust ordinary rights issuance.
        if close_enough_integer(stock_ratio) and abs(price_ratio * stock_ratio - 1) < .06:
            factor *= price_ratio
            events.append({'date': current['date'], 'priceRatio': price_ratio, 'stockRatio': stock_ratio})
        previous['adjustmentFactor'] = factor
    if rows: rows[-1]['adjustmentFactor'] = 1.0
    for row in rows:
        row['open'] *= row['adjustmentFactor']; row['high'] *= row['adjustmentFactor']
        row['low'] *= row['adjustmentFactor']; row['close'] *= row['adjustmentFactor']
        row.pop('stocks', None)
    return events


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--universe-file', required=True); p.add_argument('--marcap-dir', default='marcap/data')
    p.add_argument('--out-cache', required=True); p.add_argument('--start-year', type=int, default=2015); p.add_argument('--end-year', type=int, default=2026)
    args = p.parse_args()
    universe = json.loads(Path(args.universe_file).read_text())
    listings = {row['ticker']: row for snapshot in universe['snapshots'] for row in snapshot['constituents']}
    bars = defaultdict(list)
    columns = ['Date', 'Code', 'Open', 'High', 'Low', 'Close', 'Volume', 'Stocks']
    for year in range(args.start_year, args.end_year + 1):
        source = Path(args.marcap_dir) / f'marcap-{year}.parquet'
        table = pq.read_table(source, columns=columns, filters=[('Code', 'in', list(listings))])
        for row in table.to_pylist():
            ticker = str(row['Code']).zfill(6)
            values = [row.get(k) for k in ['Open', 'High', 'Low', 'Close', 'Stocks']]
            if ticker not in listings or not all(isinstance(value, (int, float)) and value > 0 for value in values): continue
            bars[ticker].append({'date': str(row['Date'])[:10], 'open': float(row['Open']), 'high': float(row['High']), 'low': float(row['Low']), 'close': float(row['Close']), 'volume': float(row['Volume'] or 0), 'stocks': float(row['Stocks'])})
    out = Path(args.out_cache) / 'normalized'; out.mkdir(parents=True, exist_ok=True)
    manifest = {'methodology': 'KRX marcap raw OHLC with split-only inferred adjustment', 'universeFile': args.universe_file, 'requested': len(listings), 'written': 0, 'missing': [], 'splitEvents': 0, 'limitations': ['Not dividend adjusted.', 'Only reciprocal near-integer listed-share changes are treated as splits; rights issues and other capital changes are not adjusted.']}
    for ticker, listing in listings.items():
        series = bars.get(ticker, [])
        if not series: manifest['missing'].append(ticker); continue
        events = split_adjust(series); manifest['splitEvents'] += len(events)
        (out / f'{ticker}.json').write_text(json.dumps({'ticker': ticker, 'name': listing['name'], 'market': listing['market'], 'source': 'FinanceData/marcap KRX daily raw OHLC; split-only inferred normalization', 'splitEvents': events, 'bars': series}, ensure_ascii=False) + '\n')
        manifest['written'] += 1
    (Path(args.out_cache) / 'marcap-threshold-price-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['requested', 'written', 'splitEvents', 'missing']}, ensure_ascii=False))


if __name__ == '__main__': main()
