#!/usr/bin/env node
'use strict';

// Produce a live *model* screen from today's ordinary-share Top 300 together
// with the prior year-end Top 300.  Keeping the two membership flags makes it
// explicit which names exist only because of the requested union.

const fs = require('fs'), path = require('path'), https = require('https');
const Annual = require('./lib/annual-top300-universe.js');
const factor = require('./backtest-kr-factor-matrix.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE = path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-10');
const PANEL = path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel');
const DEFAULT_LEDGER = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json');
const DEFAULT_OUT = path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300');
const N = 10, VOL_TARGET = .18;

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const nextWeekday = date => { const d = new Date(`${date}T00:00:00Z`); do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };
const indexAt = (bars, date) => { let lo = 0, hi = bars.length - 1, out = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) { out = m; lo = m + 1; } else hi = m - 1; } return out; };
const ordinary = row => {
  const name = String(row.name || row.stockName || '');
  return /^\d{6}$/.test(String(row.ticker || row.itemCode || ''))
    && (row.market === 'KOSPI' || row.market === 'KOSDAQ')
    && row.stockEndType !== 'etf' && row.stockEndType !== 'etn'
    && !/(ETF|ETN|SPAC|스팩|리츠|REIT|레버리지|인버스|커버드콜)/i.test(name)
    && !/(우선|[1-3]?우(?:B|C)?$)/.test(name);
};
const quality = bars => bars.length >= 273 && !bars.some((bar, i) => i && (bar.close / bars[i - 1].close < .6 || bar.close / bars[i - 1].close > 1.4));
function percentile(rows, key) { const values = rows.filter(x => Number.isFinite(x[key])).sort((a, b) => a[key] - b[key]); values.forEach((x, i) => { x[`${key}Pct`] = values.length <= 1 ? 1 : i / (values.length - 1); }); }
function getJson(url) { return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => { let body = ''; response.on('data', x => { body += x; }); response.on('end', () => { if (response.statusCode !== 200) return reject(new Error(`${url}: HTTP ${response.statusCode}`)); try { resolve(JSON.parse(body)); } catch (error) { reject(error); } }); }).on('error', reject)); }

async function currentListings(allCurrent) {
  const rows = [];
  for (const market of ['KOSPI', 'KOSDAQ']) {
    const maxPages = allCurrent ? 40 : 3;
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await getJson(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`);
      const stocks = payload.stocks || [];
      if (!stocks.length) break;
      for (const stock of stocks) rows.push({ ticker: String(stock.itemCode).padStart(6, '0'), name: stock.stockName, market, marketCap: Number(stock.marketValueRaw), stockEndType: stock.stockEndType, marketStatus: stock.marketStatus, localTradedAt: stock.localTradedAt });
    }
  }
  const listings = rows.filter(ordinary).filter(x => Number.isFinite(x.marketCap) && x.marketCap > 0).sort((a, b) => b.marketCap - a.marketCap);
  const selected = allCurrent ? listings : listings.slice(0, 300);
  if (!allCurrent && selected.length !== 300) throw new Error(`Naver ordinary-share universe has only ${selected.length} names after filtering`);
  const times = [...new Set(selected.map(x => x.localTradedAt).filter(Boolean))].sort();
  return { listings: selected, sourceAsOf: times.at(-1) || null, fetchedAt: new Date().toISOString() };
}

async function main() {
  const ledgerFile = arg('--universe-file', DEFAULT_LEDGER), outDir = arg('--out-dir', DEFAULT_OUT), requestedAsOf = arg('--as-of', null);
  const universeMode = arg('--universe', 'union');
  if (!['union', 'all-current'].includes(universeMode)) throw new Error('--universe must be union or all-current');
  const current = await currentListings(universeMode === 'all-current');
  const annual = universeMode === 'union' ? Annual.loadAnnualUniverse(ledgerFile) : null;
  const rankingYear = universeMode === 'union' ? Number(arg('--ranking-year', String(new Date().getUTCFullYear() - 1))) : null;
  const snapshot = annual ? annual.byYear.get(rankingYear) : null; if (annual && !snapshot) throw new Error(`missing annual snapshot for ${rankingYear}`);
  const today = new Map(current.listings.map((x, i) => [x.ticker, { ...x, currentRank: i + 1 }]));
  const yearEnd = new Map((snapshot?.constituents || []).filter(ordinary).map(x => [x.ticker, x]));
  const merged = new Map();
  for (const [ticker, x] of today) merged.set(ticker, { ticker, name: x.name, market: x.market, currentRank: x.currentRank, currentMarketCap: x.marketCap, inCurrentTop300: true, inYearEndTop300: yearEnd.has(ticker), yearEndRank: yearEnd.get(ticker)?.rank || null });
  for (const [ticker, x] of yearEnd) if (!merged.has(ticker)) merged.set(ticker, { ticker, name: x.name, market: x.market, currentRank: null, currentMarketCap: null, inCurrentTop300: false, inYearEndTop300: true, yearEndRank: x.rank });

  const states = new Map(), missingPrice = [];
  for (const row of merged.values()) {
    const file = path.join(CACHE, 'normalized', `${row.ticker}.json`);
    if (!fs.existsSync(file)) { missingPrice.push({ ticker: row.ticker, reason: 'cache-file-missing' }); continue; }
    const bars = read(file).bars || [];
    if (!quality(bars)) { missingPrice.push({ ticker: row.ticker, reason: 'insufficient-or-discontinuous-history' }); continue; }
    states.set(row.ticker, { ...row, bars });
  }
  const kospiFile = path.join(CACHE, 'normalized', '_KS11.json');
  const kospi = read(kospiFile).bars || [];
  const latestCached = kospi.at(-1)?.date; const asOf = requestedAsOf || latestCached;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) throw new Error('no usable as-of date');
  if (asOf !== latestCached) throw new Error(`--as-of ${asOf} is not the latest available cache date (${latestCached}); refresh the price cache first`);
  const k = indexAt(kospi, asOf); if (k < 199 || kospi[k].date !== asOf) throw new Error(`KOSPI has no SMA200 observation for ${asOf}`);
  // One-session filing lag: today's close may use only information that was
  // public by the prior session, not filings that arrived on the signal date.
  const fundamentalAsOf = kospi[k - 1].date;
  const { raw, manifestHash } = factor.rawReports();
  const reports = new Map([...raw].map(([ticker, years]) => [ticker, factor.series(years)]));
  const rows = [], excluded = { noExactPrice: 0, noDart: 0 };
  for (const [ticker, state] of states) {
    const i = indexAt(state.bars, asOf), fundamental = factor.epsRevenueAt(reports.get(ticker) || [], fundamentalAsOf);
    if (i < 252 || state.bars[i].date !== asOf) { excluded.noExactPrice += 1; continue; }
    if (!fundamental) { excluded.noDart += 1; continue; }
    const r63 = state.bars[i].close / state.bars[i - 63].close - 1, r126 = state.bars[i].close / state.bars[i - 126].close - 1, r252 = state.bars[i].close / state.bars[i - 252].close - 1;
    rows.push({ ...state, close: state.bars[i].close, r63, r126, r252, rs: .4 * r63 + .3 * r126 + .3 * r252, fundamental, reportFilingDate: fundamental.report.filing });
  }
  percentile(rows, 'rs');
  for (const key of ['revYoY', 'revQoQ', 'epsYoY', 'epsQoQ']) { const a = rows.filter(x => Number.isFinite(x.fundamental.metrics[key])).sort((x, y) => x.fundamental.metrics[key] - y.fundamental.metrics[key]); a.forEach((x, i) => { x[`${key}Pct`] = a.length <= 1 ? 1 : i / (a.length - 1); }); }
  for (const row of rows) { const keys = ['revYoYPct', 'revQoQPct', 'epsYoYPct', 'epsQoQPct'].filter(key => Number.isFinite(row[key])); row.fundamentalScore = keys.length >= 3 ? mean(keys.map(key => row[key])) : null; row.score = row.fundamentalScore === null ? null : .5 * row.rsPct + .5 * row.fundamentalScore; }
  const ranked = rows.filter(x => x.score !== null).sort((a, b) => b.score - a.score || b.rs - a.rs).map((x, i) => ({ rank: i + 1, ...x }));
  const holdings = ranked.slice(0, N);
  const dailyReturns = [];
  for (let offset = 60; offset > 0; offset -= 1) { const before = kospi[k - offset].date, after = kospi[k - offset + 1].date; const returns = holdings.map(x => { const a = x.bars[indexAt(x.bars, before)], b = x.bars[indexAt(x.bars, after)]; return a?.date === before && b?.date === after ? b.close / a.close - 1 : null; }).filter(Number.isFinite); if (returns.length === holdings.length) dailyReturns.push(mean(returns)); }
  const realizedVolatility = dailyReturns.length >= 59 ? stdev(dailyReturns) * Math.sqrt(252) : null;
  const sma200 = mean(kospi.slice(k - 199, k + 1).map(x => x.close)), distance = kospi[k].close / sma200 - 1;
  const regimeOn = distance >= .03; // no prior state in a standalone live screen
  const exposure = regimeOn && realizedVolatility ? Math.min(1, VOL_TARGET / realizedVolatility) : 0;
  const policy = universeMode === 'all-current'
    ? 'all currently listed KOSPI/KOSDAQ ordinary shares'
    : 'today ordinary-share Top 300 UNION prior year-end ordinary-share Top 300';
  const artifact = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), modelOnly: true,
    asOf, signalDate: asOf, expectedExecution: nextWeekday(asOf),
    universe: { policy, currentSource: 'Naver Finance marketValue API', currentSourceAsOf: current.sourceAsOf, currentFetchedAt: current.fetchedAt, rankingYear, yearEndSnapshotDate: snapshot?.asOfDate || null, currentTop300Count: universeMode === 'union' ? today.size : null, currentListingCount: universeMode === 'all-current' ? today.size : null, yearEndTop300Count: yearEnd.size || null, unionCount: merged.size, overlapCount: [...today.keys()].filter(ticker => yearEnd.has(ticker)).length, currentOnlyCount: [...today.keys()].filter(ticker => !yearEnd.has(ticker)).length, yearEndOnlyCount: [...yearEnd.keys()].filter(ticker => !today.has(ticker)).length },
    rules: { selection: '3/6/12-month RS (40/30/30) percentile 50% + point-in-time EPS/revenue improvement percentile 50%, top 10', filingAvailabilityLagSessions: 1, execution: 'signal close -> next trading session open', overlay: 'KOSPI SMA200 +3% ON threshold (standalone screen) and 60-session 18% volatility target', rankingOnly: false },
    coverage: { unionCount: merged.size, priceUsable: states.size, priceCoverage: states.size / merged.size, dartCandidateCount: ranked.length, excluded, missingPrice },
    overlay: { kospiClose: kospi[k].close, kospiSma200: sma200, distanceToSma200: distance, regimeOn, realizedVolatility, targetVolatility: VOL_TARGET, exposure, cashWeight: 1 - exposure, perHoldingTargetWeight: exposure / holdings.length },
    holdings: holdings.map(x => ({ rank: x.rank, ticker: x.ticker, name: x.name, market: x.market, close: x.close, score: x.score, rs: x.rs, rsPercentile: x.rsPct, fundamentalScore: x.fundamentalScore, reportFilingDate: x.reportFilingDate, inCurrentTop300: x.inCurrentTop300, currentRank: x.currentRank, inYearEndTop300: x.inYearEndTop300, yearEndRank: x.yearEndRank, targetWeight: exposure / holdings.length })),
    data: { priceCache: CACHE, dartPanel: PANEL, dartPanelManifestSha256: manifestHash },
    limitations: ['This is a live model screen, not investment advice or an order.', ...(universeMode === 'union' ? ['The union intentionally mixes a current constituent list and a prior year-end list; it is not valid for historical performance measurement.'] : ['The current-listing universe must not be applied retrospectively in a backtest because it has survivorship bias.']), 'Only existing cached daily prices and DART panel records are usable; missing items are logged rather than silently substituted.']
  };
  const stem = universeMode === 'all-current' ? `live-all-current-krx-model-${asOf}` : `live-union-top300-model-${asOf}`; write(path.join(outDir, `${stem}.json`), artifact);
  const pct = x => x === null || x === undefined ? '—' : `${(x * 100).toFixed(2)}%`;
  const table = artifact.holdings.map(x => `|${x.rank}|${x.ticker}|${x.name}|${x.close.toLocaleString('ko-KR')}|${x.score.toFixed(4)}|${x.inCurrentTop300 ? x.currentRank : '—'}|${x.inYearEndTop300 ? x.yearEndRank : '—'}|${pct(x.targetWeight)}|`).join('\n');
  const universeLine = universeMode === 'all-current'
    ? `Naver 현재 상장 KOSPI·KOSDAQ 보통주 전체(${today.size}개, ${current.sourceAsOf || '조회시점'})`
    : `${rankingYear}년말 보통주 Top 300(${snapshot.asOfDate}) ∪ Naver 최신 보통주 Top 300(${current.sourceAsOf || '조회시점'})`;
  const membershipNote = universeMode === 'all-current'
    ? '- 시가총액 상위 300 제약을 적용하지 않았다. 현재 상장 보통주 전체를 후보로 쓰므로, 이 유니버스를 과거에 그대로 적용한 백테스트는 생존자 편향을 가진다.'
    : '- 최신 Top 300에 없지만 연도말 Top 300에 있던 종목도 후보에 남기기 위한 합집합이다. 따라서 이 파일은 연도별 백테스트나 최신 유니버스 백테스트의 성과 수치로 사용하면 안 된다.';
  const title = universeMode === 'all-current' ? '현재 상장 KRX 전체 보통주 모델 포트폴리오' : '최신 + 연도말 Top 300 합집합 모델 포트폴리오';
  fs.writeFileSync(path.join(outDir, `${stem}.md`), `# ${title} (${asOf})\n\n> 주문 지시가 아닌 규칙 기반 모델 화면이다. 신호일 종가 후 다음 거래일 시가 체결을 가정한다.\n\n- 유니버스: ${universeLine}\n- 후보 ${merged.size}개${universeMode === 'union' ? `: 공통 ${artifact.universe.overlapCount}개, 최신만 ${artifact.universe.currentOnlyCount}개, 연도말만 ${artifact.universe.yearEndOnlyCount}개` : ''}\n- 가격 가능 ${states.size}/${merged.size}, DART 후보 ${ranked.length}; DART는 ${fundamentalAsOf}까지 접수된 공시만 사용\n- 신호 ${asOf} 종가 → 예상 체결 ${artifact.expectedExecution} 시가\n- 점수: RS(3/6/12개월, 40/30/30) 백분위 50% + EPS·매출 개선 백분위 50%\n- 레짐: KOSPI ${kospi[k].close.toFixed(2)} / SMA200 ${sma200.toFixed(2)} / 괴리 ${pct(distance)} / ${regimeOn ? 'ON' : 'OFF'}; 60일 실현변동성 ${pct(realizedVolatility)}, 주식 ${pct(exposure)}, 현금 ${pct(1 - exposure)}\n\n|순위|코드|종목|신호 종가|점수|최신 순위|${rankingYear ? `${rankingYear}년말 순위` : '시총 제약'}|총자산 목표|\n|---:|---|---|---:|---:|---:|---:|---:|\n${table}\n\n## 해석\n\n${membershipNote}\n- 당일 공시는 다음 거래일 이후에만 반영하도록 1거래일 지연을 적용했다.\n`);
  console.log(JSON.stringify({ artifact: path.join(outDir, `${stem}.json`), holdings: artifact.holdings.map(x => ({ rank: x.rank, ticker: x.ticker, name: x.name, score: x.score })), universe: artifact.universe, coverage: artifact.coverage, overlay: artifact.overlay }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
