#!/usr/bin/env node
'use strict';

// Screen the main weekly strategy's candidate list at a fixed close.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/trend-following-10y');
const DATA = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const TOP = path.join(OUT, 'largecap-momentum-backtest-2026-07-10.json');
const factor = require('./backtest-kr-factor-matrix');
const AS_OF = process.argv[2] || '2026-07-10', LIMIT = Number(process.argv[3] || 30);
if (!/^20\d{2}-\d{2}-\d{2}$/.test(AS_OF) || !Number.isInteger(LIMIT) || LIMIT < 1) throw Error('Usage: node screen-weekly-main-top30.js YYYY-MM-DD [limit]');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const idx = (b, d) => { let l = 0, h = b.length - 1, o = -1; while (l <= h) { const m = (l + h) >> 1; if (b[m].date <= d) { o = m; l = m + 1; } else h = m - 1; } return o; };
const pct = (rows, key) => { const a = rows.filter(x => Number.isFinite(x[key])).sort((a, b) => a[key] - b[key]); a.forEach((x, i) => { x[`${key}Pct`] = a.length < 2 ? 1 : i / (a.length - 1); }); };
const ordinary = x => /^\d{6}$/.test(x.ticker) && !/(ETF|ETN|SPAC|스팩|리츠|REIT|우선)/i.test(x.name || '') && (x.market === 'KOSPI' || x.market === 'KOSDAQ');

const top = read(TOP).universe.top300.filter(ordinary), states = new Map();
for (const u of top) {
  const f = path.join(DATA, 'normalized', `${u.ticker}.json`);
  if (!fs.existsSync(f)) continue;
  const x = read(f);
  if (x.bars.length >= 273 && !x.bars.some((b, i) => i && (b.close / x.bars[i - 1].close < .6 || b.close / x.bars[i - 1].close > 1.4))) states.set(u.ticker, { ...u, bars: x.bars });
}
const raw = factor.rawReports().raw, quarters = new Map([...raw].map(([ticker, years]) => [ticker, factor.series(years)]));
const rows = [], warnings = [];
for (const [ticker, state] of states) {
  const i = idx(state.bars, AS_OF), er = factor.epsRevenueAt(quarters.get(ticker) || [], AS_OF);
  if (i < 252 || state.bars[i].date !== AS_OF) { warnings.push(`${ticker}: no exact price on signal date`); continue; }
  if (!er) { warnings.push(`${ticker}: no eligible point-in-time EPS/revenue signal`); continue; }
  const r63 = state.bars[i].close / state.bars[i - 63].close - 1, r126 = state.bars[i].close / state.bars[i - 126].close - 1, r252 = state.bars[i].close / state.bars[i - 252].close - 1;
  rows.push({ ticker, name: state.name, market: state.market, close: state.bars[i].close, r63, r126, r252, rs: .4 * r63 + .3 * r126 + .3 * r252, fundamental: er.metrics, reportFilingDate: er.report.filing });
}
pct(rows, 'rs');
for (const k of ['revYoY', 'revQoQ', 'epsYoY', 'epsQoQ']) {
  const a = rows.filter(x => Number.isFinite(x.fundamental[k])).sort((a, b) => a.fundamental[k] - b.fundamental[k]);
  a.forEach((x, i) => { x[`${k}Pct`] = a.length < 2 ? 1 : i / (a.length - 1); });
}
for (const r of rows) {
  const keys = ['revYoYPct', 'revQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(k => Number.isFinite(r[k]));
  r.fundamentalScore = keys.length >= 3 ? keys.reduce((s, k) => s + r[k], 0) / keys.length : null;
  r.score = r.fundamentalScore === null ? null : .5 * r.rsPct + .5 * r.fundamentalScore;
}
const ranked = rows.filter(x => x.score !== null).sort((a, b) => b.score - a.score || b.rs - a.rs).map((x, i) => ({ rank: i + 1, ...x }));
const screen = ranked.slice(0, LIMIT), stem = `weekly-main-top${LIMIT}-${AS_OF}`;
const artifact = { generatedAt: new Date().toISOString(), asOf: AS_OF, strategy: { name: 'Weekly main strategy candidate screen', score: 'Minervini RS 3/6/12-month returns (40/30/30) percentile 50% + point-in-time EPS/revenue improvement percentile 50%', universe: 'Current KOSPI/KOSDAQ market-cap top 300 ordinary shares', rankingOnly: true, executionIfUsed: 'Signal close -> next trading-day open' }, universe: { eligible: top.length, priceUsable: states.size, fundamentalEligible: ranked.length }, top: screen, warnings };
fs.writeFileSync(path.join(OUT, `${stem}.json`), JSON.stringify(artifact, null, 2) + '\n');
const p = x => `${(x * 100).toFixed(2)}%`;
const table = screen.map(x => `|${x.rank}|${x.ticker}|${x.name}|${x.market}|${x.score.toFixed(4)}|${x.rsPct.toFixed(4)}|${x.fundamentalScore.toFixed(4)}|${p(x.r63)}|${p(x.r126)}|${p(x.r252)}|${x.reportFilingDate}|`).join('\n');
fs.writeFileSync(path.join(OUT, `${stem}.md`), `# 주별 메인 전략 상위 ${LIMIT} 후보 (${AS_OF})\n\n> 종목 추천이 아닌 규칙 기반 후보 화면이다. 실제 주간 전략의 체결은 신호일 종가 뒤 다음 거래일 시가를 가정한다.\n\n- 점수: 3·6·12개월 RS(40·30·30) 백분위 50% + DART 접수일 기준 EPS·매출 개선 백분위 50%\n- 유니버스: 현재 KOSPI·KOSDAQ 시가총액 상위 300개 중 보통주. 가격 사용 가능 ${states.size}개, 재무 신호 사용 가능 ${ranked.length}개.\n- 레짐·변동성 타기팅은 **투자 비중** 규칙이며 종목 순위에는 적용하지 않았다.\n\n|순위|코드|종목|시장|종합점수|RS 백분위|재무점수|3개월|6개월|12개월|최신 반영 공시일|\n|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|\n${table}\n\n## 한계\n\n현재 유니버스를 과거·현재에 적용한 구성이라 생존자 편향이 있고, 유동성·상장폐지·거래정지·시장충격은 반영하지 않았다.\n`);
console.log(JSON.stringify({ asOf: AS_OF, candidates: ranked.length, top: screen.map(x => ({ rank: x.rank, ticker: x.ticker, name: x.name, score: x.score })) }, null, 2));
