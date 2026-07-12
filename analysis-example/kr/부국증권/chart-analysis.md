# Advanced Chart Analysis: 001270.KS

- Name: 부국증권
- Latest date: 2026-07-10
- Latest close: 56300.00
- Moving-average structure: mixed
- Today's moving averages: MA5 56540.00, MA20 58080.00, MA60 65106.67, MA120 70344.17, MA200 67889.50
- Bollinger read: mid-band
- Ichimoku read: below-cloud
- RSI state: neutral
- MACD state: bullish / below-zero
- ADX state: building-trend / bearish / flat
- Volume regime: light
- Chart-only flow: bearish continuation

## Moving Averages on Latest Date

| Date | MA5 | MA20 | MA60 | MA120 | MA200 |
| --- | --- | --- | --- | --- | --- |
| 2026-07-10 | 56540.00 | 58080.00 | 65106.67 | 70344.17 | 67889.50 |

## Volume Moving Averages on Latest Date

| Date | Volume | VolMA20 | VolMA60 | Volume / VolMA20 |
| --- | --- | --- | --- | --- |
| 2026-07-10 | 3489 | 6021 | 12480 | 57.9% |

## Chart Images

![부국증권 main trend chart](../assets/부국증권-chart.png)

![부국증권 volume chart](../assets/부국증권-chart-volume.png)

![부국증권 overlay chart](../assets/부국증권-chart-overlay.png)

![부국증권 momentum chart](../assets/부국증권-chart-momentum.png)

![부국증권 structure chart](../assets/부국증권-chart-structure.png)

![부국증권 pattern wave chart](../assets/부국증권-chart-pattern.png)

The main chart uses OHLC candlesticks with upper and lower wicks, plus MA5, MA20, MA60, MA120, MA200, and volume bars. The separate volume chart enlarges participation detail with volume bars plus VolMA20 / VolMA60 lines. The overlay chart separates Bollinger Bands, Ichimoku cloud lines, and RSI14, and reserves 26 forward slots for the projected cloud. The momentum chart focuses on MACD, signal, histogram, and ADX/DMI so crossovers, momentum acceleration, and trend strength are easier to see. The structure chart pairs candles with a horizontal volume-by-price gutter (POC highlighted) and ATR-tolerance clustered support/resistance zones drawn as horizontal price bands (up to 3 each, within ±30% of current price). The pattern chart adds recent swing-pivot wave candidates and Fibonacci retracement/extension levels; labels are drawn only for candidates with confidence >= 0.55, while all candidates are exported to a sibling `-waves.csv`. The full zone roster — including broken or distance-filtered zones — is exported to a sibling `-zones.csv`.

## Support / Resistance Zones (Structure Chart)

| Type | Zone | Center | Touches | Last Touch | Score | Status |
| --- | --- | --- | --- | --- | --- | --- |
| support | 52,100 ~ 54,000 | 53,050 | 7 | 2026-07-09 | 0.413 | active |
| resistance | 66,200 ~ 66,600 | 66,400 | 13 | 2026-06-05 | 0.389 | active |

Full zone roster (including broken / distance-filtered): `부국증권-chart-structure-zones.csv`

## Pattern / Wave Candidates

Selected drawable candidate: impulse / bearish / confidence 0.960.

| Kind | Direction | Status | Confidence | Points |
| --- | --- | --- | --- | --- |
| impulse | bearish | drawable | 0.960 | start:2026-04-10@78,000 → 1:2026-04-30@72,400 → 2:2026-05-06@80,300 → 3:2026-05-18@61,400 → 4:2026-06-05@66,300 → 5:2026-06-08@54,000 |
| corrective | bearish-correction | drawable | 0.906 | A:2026-06-08@54,000 → B:2026-06-17@63,900 → C:2026-06-24@52,100 |
| corrective | bullish-correction | drawable | 0.876 | A:2026-06-05@66,300 → B:2026-06-08@54,000 → C:2026-06-17@63,900 |
| impulse | bearish | drawable | 0.866 | start:2026-05-06@80,300 → 1:2026-05-18@61,400 → 2:2026-06-05@66,300 → 3:2026-06-08@54,000 → 4:2026-06-17@63,900 → 5:2026-06-24@52,100 |
| impulse | bullish | drawable | 0.775 | start:2026-01-22@58,500 → 1:2026-02-03@78,900 → 2:2026-02-06@66,600 → 3:2026-02-23@104,600 → 4:2026-03-04@66,200 → 5:2026-03-12@89,900 |

Full wave roster: `부국증권-chart-pattern-waves.csv`

## Indicators

| Metric | Value |
| --- | --- |
| MA 5 | 56540.00 |
| MA 20 | 58080.00 |
| MA 60 | 65106.67 |
| MA 120 | 70344.17 |
| MA 200 | 67889.50 |
| Bollinger Upper | 64277.94 |
| Bollinger Middle | 58080.00 |
| Bollinger Lower | 51882.06 |
| Bollinger Width | 21.34% |
| Tenkan | 57050.00 |
| Kijun | 59200.00 |
| Current Cloud A | 65050.00 |
| Current Cloud B | 68250.00 |
| Future Cloud A | 58125.00 |
| Future Cloud B | 66200.00 |
| RSI 14 | 44.09 |
| MACD | -1950.91 |
| Signal | -2116.72 |
| Histogram | 165.81 |
| MACD State | bullish / below-zero |
| Histogram State | expanding |
| ADX 14 | 22.95 |
| +DI | 17.94 |
| -DI | 26.89 |
| ADX State | building-trend / bearish / flat |
| Avg Volume 20 | 6021 |
| Avg Volume 60 | 12480 |
| Volume vs Avg 20 | 57.9% |
| 20D Breakout Level | 63900.00 |
| 20D Breakdown Level | 52100.00 |

## Read

- Trend structure: moving averages are mixed, so trend confirmation is still limited.
- Today's moving averages: MA5 56,540 / MA20 58,080 / MA60 65,107 / MA120 70,344 / MA200 67,890.
- Volatility: price is around the middle of the Bollinger range, and band width is stable.
- Cloud read: price is below the current cloud, tenkan is below kijun, and the projected cloud is bearish.
- Momentum and participation: RSI14 is neutral at 44.09; MACD remains above signal, and MACD is below zero; histogram momentum is expanding; ADX shows a trend that is building, with -DI slightly ahead, and trend strength is flat; volume is light versus the 20-day average.
- Practical checklist: nearest support watch is 52,100; first recovery check is 57,050, then 58,080; 20-day breakout level sits at 63,900; 20-day breakdown level sits at 52,100; chart-only flow still reads as bearish continuation.
