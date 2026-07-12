#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const OUT = path.join(ROOT, 'analysis-example/kr-market');
const AS_OF = '2026-07-10';
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const quality = bars => bars.some((b, i) => i && (b.close / bars[i - 1].close < .6 || b.close / bars[i - 1].close > 1.4));
const range = bars => Math.max(...bars.map(x => x.high)) / Math.min(...bars.map(x => x.low)) - 1;

function scan() {
  const listings = json(path.join(CACHE, 'universe.json')).listings;
  const rows = [];
  for (const l of listings) {
    const file = path.join(CACHE, 'normalized', `${l.ticker}.json`);
    if (!fs.existsSync(file)) continue;
    const bars = json(file).bars;
    if (bars.length < 273 || quality(bars)) continue;
    const i = bars.length - 1, last = bars[i];
    if (last.date !== AS_OF) continue;
    const sma = n => avg(bars.slice(i - n + 1, i + 1).map(x => x.close));
    const ma50 = sma(50), ma150 = sma(150), ma200 = sma(200);
    const ma200Past = avg(bars.slice(i - 219, i - 19).map(x => x.close));
    const year = bars.slice(i - 251, i + 1), high52 = Math.max(...year.map(x => x.high)), low52 = Math.min(...year.map(x => x.low));
    const r63 = last.close / bars[i - 63].close - 1, r126 = last.close / bars[i - 126].close - 1, r252 = last.close / bars[i - 252].close - 1;
    rows.push({ ticker: l.ticker, name: l.name, market: l.market, close: last.close, volume: last.volume, ma50, ma150, ma200, ma200Past, high52, low52, r63, r126, r252, rsRaw: r63 * .4 + r126 * .3 + r252 * .3, bars });
  }
  rows.sort((a, b) => b.rsRaw - a.rsRaw || a.ticker.localeCompare(b.ticker));
  const denom = Math.max(rows.length - 1, 1);
  rows.forEach((x, i) => { x.rsPercentile = rows.length === 1 ? 100 : (rows.length - 1 - i) / denom * 100; });
  const strict = [];
  for (const x of rows) {
    const p = x.close;
    const rules = {
      priceAboveMA: p > x.ma50 && p > x.ma150 && p > x.ma200,
      ma150Above200: x.ma150 > x.ma200,
      ma50Above: x.ma50 > x.ma150 && x.ma50 > x.ma200,
      ma200Rising: x.ma200 > x.ma200Past,
      above52Low: p >= x.low52 * 1.3,
      near52High: p >= x.high52 * .75,
      rs70: x.rsPercentile >= 70
    };
    if (!Object.values(rules).every(Boolean)) continue;
    const bars = x.bars, i = bars.length - 1;
    const pivot = Math.max(...bars.slice(i - 20, i).map(b => b.high));
    const vol50 = avg(bars.slice(i - 50, i).map(b => b.volume).filter(Number.isFinite));
    const recent10Range = range(bars.slice(i - 9, i + 1));
    const prior20Range = range(bars.slice(i - 30, i - 10));
    const base40High = Math.max(...bars.slice(i - 39, i + 1).map(b => b.high));
    const vcp = { pivot, breakout: p > pivot, volumeExpansion: Number.isFinite(vol50) && x.volume >= vol50 * 1.5, contraction: recent10Range <= .12 && recent10Range < prior20Range, nearBaseHigh: p >= base40High * .9, recent10Range, prior20Range, volumeRatio50: Number.isFinite(vol50) ? x.volume / vol50 : null };
    strict.push({ ...x, rules, vcp, sepaStylePass: vcp.breakout && vcp.volumeExpansion && vcp.contraction && vcp.nearBaseHigh });
  }
  return { allCount: rows.length, strict, sepa: strict.filter(x => x.sepaStylePass) };
}

const result = scan();
const compact = x => ({ ticker: x.ticker, name: x.name, market: x.market, close: x.close, rsPercentile: x.rsPercentile, return252: x.r252, ma50: x.ma50, ma150: x.ma150, ma200: x.ma200, vcp: x.vcp, rules: x.rules });
const artifact = { schemaVersion: 1, generatedAt: new Date().toISOString(), asOf: AS_OF, universe: { source: path.join(CACHE, 'universe.json'), ordinaryStocksWithUsableData: result.allCount }, strictTemplate: result.strict.map(compact), sepaStyle: result.sepa.map(compact), definitions: { strict: 'All Trend Template rules pass: price > 50/150/200 SMA, 50 > 150/200, 150 > 200, 200 SMA rising over 20 sessions, price >= 130% of 52-week low, price >= 75% of 52-week high, RS percentile >= 70.', sepaStyle: 'Strict Template plus 20-session pivot breakout, volume >= 1.5x prior 50-session average, 10-session range <= 12% and narrower than prior 20-session range, and close within 10% of 40-session high.' }, limitations: ['SEPA-style VCP is an objective proxy, not Mark Minervini discretionary chart reading.', 'Current-universe history carries survivorship bias.', 'Yahoo-adjusted data and corporate-action quality limits remain.'] };
const jsonPath = path.join(OUT, `minervini-screen-${AS_OF}.json`);
write(jsonPath, artifact);
const fmt = x => Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'N/A';
const table = rows => rows.map(x => `|${x.ticker}|${x.name}|${x.market}|${Math.round(x.close).toLocaleString('ko-KR')}|${x.rsPercentile.toFixed(1)}|${fmt(x.r252)}|${x.vcp ? (x.vcp.breakout ? '돌파' : '대기') : '—'}|`).join('\n') || '|해당 없음|—|—|—|—|—|—|';
const md = `# KOSPI·KOSDAQ Minervini 적용 화면 — ${AS_OF}\n\n> 투자 권유가 아닙니다. Strict Template은 객관적 추세 상태 필터이고, SEPA-style은 VCP를 수치화한 근사 규칙입니다.\n\n## 결과\n\n- 데이터 품질 필터 후 유니버스: ${result.allCount.toLocaleString('ko-KR')}개\n- **Strict Template 통과**: ${result.strict.length}개\n- **SEPA-style VCP·피벗 돌파 통과**: ${result.sepa.length}개\n\n## 1. Strict Template — 통과부터 불통과까지 보유 후보\n\n|티커|종목|시장|종가|RS 백분위|252일 수익률|VCP 상태|\n|---|---|---|---:|---:|---:|---|\n${table(result.strict.slice(0, 50))}\n\n## 2. SEPA-style — VCP·피벗 돌파 후보\n\n|티커|종목|시장|종가|RS 백분위|252일 수익률|VCP 상태|\n|---|---|---|---:|---:|---:|---|\n${table(result.sepa)}\n\n## 규칙\n\n- **Strict Hold**: 표의 Strict 조건을 처음 모두 통과한 종가 다음 시가에 진입하고, 이후 하나라도 불통과가 된 종가 다음 시가에 청산한다.\n- **SEPA-style**: Strict 조건에 더해 20일 피벗 돌파, 50일 평균 대비 1.5배 거래량, 최근 10일 변동폭 축소, 40일 고점 근접을 동시에 요구한다.\n\n## 한계\n\n- VCP는 원래 차트 문맥을 포함하는 재량적 개념이므로, 여기서는 재현 가능한 정량 근사치다.\n- 현재 구성종목을 과거에 적용한 데이터이므로 생존자 편향이 있다.\n`;
fs.writeFileSync(path.join(OUT, `minervini-screen-${AS_OF}.md`), md);
console.log(JSON.stringify({ json: jsonPath, strictPass: result.strict.length, sepaStylePass: result.sepa.length }, null, 2));
