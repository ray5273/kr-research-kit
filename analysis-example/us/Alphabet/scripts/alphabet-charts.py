"""Reproduce the Alphabet memo chart and author-assumption valuation scenarios.

Run from any directory: python3 alphabet-charts.py
Inputs (quarterly-series.json, scenario-inputs.json) and outputs stay beside the memo. No network calls.
"""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
REPO = BASE.parents[2]
series = json.loads((BASE / 'quarterly-series.json').read_text())
series = series if isinstance(series, list) else series['quarters']
inputs = json.loads((BASE / 'scenario-inputs.json').read_text())

# Valuation: market cap uses class A price for unlisted class B.
sh = inputs['shares_outstanding_million']
price_a, price_c = inputs['reference_price_usd'], inputs['reference_price_goog_usd']
market_cap_bn = ((sh['class_a'] + sh['class_b']) * price_a + sh['class_c'] * price_c) / 1000
ev_bn = market_cap_bn - inputs['net_cash_bn']
ttm = inputs['ttm']
rows = []
for item in inputs['scenarios']:
    low, high = (round(item['eps_2027'] * pe, 1) for pe in item['pe'])
    rows.append(dict(item, value_usd=[low, high],
                     price_change_percent=[round((v / price_a - 1) * 100, 1) for v in (low, high)]))
result = dict(
    basis=inputs['basis'], reference_date=inputs['reference_date'], reference_price_usd=price_a,
    market_cap_bn=round(market_cap_bn, 1), ev_bn=round(ev_bn, 1),
    pe_on_consensus_2027=round(price_a / inputs['consensus_2027_eps']['value'], 1),
    fcf_yield_ttm_percent=round(ttm['fcf_bn'] / market_cap_bn * 100, 2),
    ocf_yield_ttm_percent=round(ttm['ocf_bn'] / market_cap_bn * 100, 2),
    ev_to_fcf_ttm=round(ev_bn / ttm['fcf_bn'], 1), ev_to_ocf_ttm=round(ev_bn / ttm['ocf_bn'], 1),
    scenarios=rows,
)
(BASE / 'scenario-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

font_path = REPO / 'skills/kr-stock-analysis/assets/fonts/NotoSansKR-Regular.ttf'
font_manager.fontManager.addfont(str(font_path))
plt.rcParams['font.family'] = font_manager.FontProperties(fname=str(font_path)).get_name()
plt.rcParams['axes.unicode_minus'] = False

labels = [r['quarter'].replace('20', "'", 1).replace('Q', ' Q') for r in series]
x = range(len(series))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.8))

cloud = [r['cloud_rev_bn'] for r in series]
margin = [r['cloud_oi_bn'] / r['cloud_rev_bn'] * 100 for r in series]
ax1.bar(x, cloud, color='#4c78a8', width=0.65, label='Cloud 매출 ($B)')
for i, v in enumerate(cloud):
    ax1.text(i, v + 0.5, f'{v:.1f}', ha='center', fontsize=8)
ax1b = ax1.twinx()
ax1b.plot(x, margin, color='#d1495b', marker='o', lw=2, label='Cloud 영업이익률 (%)')
ax1b.set_ylim(0, 45)
ax1.set_ylim(0, 36)
ax1.set_title('Google Cloud: 매출과 영업이익률')
ax1.set_xticks(list(x), labels, rotation=45, fontsize=8)
h1, l1 = ax1.get_legend_handles_labels()
h2, l2 = ax1b.get_legend_handles_labels()
ax1.legend(h1 + h2, l1 + l2, loc='upper left', fontsize=8)
ax1.grid(axis='y', alpha=.2)

ax2.plot(x, [r['capex_bn'] for r in series], color='#d1495b', marker='o', lw=2, label='Capex')
ax2.plot(x, [r['ocf_bn'] for r in series], color='#4c78a8', marker='o', lw=2, label='영업현금흐름')
fcf = [r['fcf_bn'] for r in series]
ax2.bar(x, fcf, color=['#8fb996' if v >= 0 else '#e0a458' for v in fcf], width=0.6, label='FCF')
ax2.axhline(0, color='#333333', lw=0.8)
ax2.set_title('Alphabet: Capex·영업현금흐름·FCF ($B)')
ax2.set_xticks(list(x), labels, rotation=45, fontsize=8)
ax2.legend(loc='upper left', fontsize=8)
ax2.grid(axis='y', alpha=.2)

fig.suptitle('분기 실적 추이 (2024 Q3 ~ 2026 Q3, 회사 보도자료 기준)', fontsize=11)
fig.tight_layout()
fig.savefig(BASE / 'assets/cloud-capex-fcf.png', dpi=170)
print(json.dumps(result, ensure_ascii=False, indent=2))
