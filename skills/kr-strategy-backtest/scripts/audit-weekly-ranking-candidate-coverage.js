#!/usr/bin/env node
'use strict';

// Audits every raw year-end Top-300 constituent, not only the ranked names.
// It makes the candidate gate (ordinary share -> price -> DART -> compliance)
// explicit so a smaller fullRanking cannot be mistaken for a smaller universe.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const L = require('./lib/factor-backtest-core.js');
const A = require('./lib/annual-top300-universe.js');

const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const column = ref => ref.match(/^[A-Z]+/)[0];
const unescapeXml = value => value.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const unzip = (file, entry) => cp.execFileSync('unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const cellText = cell => { const inline = cell.match(/<is>\s*<t[^>]*>([\s\S]*?)<\/t>\s*<\/is>/); if (inline) return unescapeXml(inline[1]); const value = cell.match(/<v>([\s\S]*?)<\/v>/); return value ? unescapeXml(value[1]) : ''; };
function xlsxRows(file, year) {
  const workbook = unzip(file, 'xl/workbook.xml');
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="rId(\d+)"/g)].map(m => ({ name: unescapeXml(m[1]), id: Number(m[2]) }));
  const sheet = sheets.find(x => x.name === String(year)); if (!sheet) throw new Error(`Workbook has no ${year} sheet.`);
  const xml = unzip(file, `xl/worksheets/sheet${sheet.id}.xml`);
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => {
    const row = {}; for (const cell of match[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) { const ref = cell[1].match(/\br="([A-Z]+\d+)"/)?.[1]; if (ref) row[column(ref)] = cellText(cell[0]); } return row;
  });
}
function nonOrdinaryReason(row) {
  const name = String(row.name || '');
  if (!/^\d{6}$/.test(row.ticker || '')) return '유효한 6자리 종목코드가 아님';
  if (!['KOSPI', 'KOSDAQ'].includes(row.market)) return 'KOSPI·KOSDAQ 보통주 대상이 아님';
  if (/(ETF|ETN|SPAC|스팩|레버리지|인버스|커버드콜)/i.test(name) || /리츠\s*$|\bREIT(?:s)?\b/i.test(name)) return 'ETF·ETN·SPAC·실제 리츠 등 비보통주 상품';
  if (/(우선|[1-3]?우(?:B|C)?$)/.test(name)) return '우선주';
  return '보통주 필터 미통과';
}
function fundamentalDiagnostic(series, asOf) {
  const current = L.fundamentalAt(series, asOf);
  if (current) return { status: '가용', metricCount: Object.values(current.metrics).filter(x => x !== null).length, filingDate: current.report.filing, detail: '공시 1거래일 지연 기준으로 3개 이상 실적 개선 지표 가용' };
  if (!series.length) return { status: '결측', metricCount: 0, filingDate: null, detail: 'DART 분기 패널 없음' };
  const filed = series.filter(row => row.filing <= asOf);
  const complete = filed.filter(row => row.revenue !== null && row.eps !== null);
  if (!complete.length) return { status: '결측', metricCount: 0, filingDate: filed.at(-1)?.filing || null, detail: '기준일까지 매출·EPS가 함께 있는 DART 분기 공시 없음' };
  const improve = (current, previous) => current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0 ? null : (current - previous) / Math.abs(previous);
  let best = { count: 0, filingDate: complete.at(-1)?.filing || null };
  for (const report of complete) {
    const sameQuarterLastYear = series.find(row => row.year === report.year - 1 && row.quarter === report.quarter && row.revenue !== null && row.eps !== null);
    const index = series.indexOf(report), priorQuarter = index > 0 ? series[index - 1] : null;
    const count = [improve(report.revenue, sameQuarterLastYear?.revenue ?? null), improve(report.revenue, priorQuarter?.revenue ?? null), improve(report.eps, sameQuarterLastYear?.eps ?? null), improve(report.eps, priorQuarter?.eps ?? null)].filter(value => value !== null).length;
    if (count >= best.count) best = { count, filingDate: report.filing };
  }
  return { status: '불충분', metricCount: best.count, filingDate: best.filingDate, detail: 'YoY·QoQ 비교 가능 실적 지표가 3개 미만' };
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const rankingFile = arg('--ranking-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/weekly-full-ranking-2026-07-13.json'));
const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger-2015-2025.json'));
const rawWorkbook = arg('--raw-workbook', path.join(ROOT, '한국_시가총액_상위300_2016-2025.xlsx'));
const outputBase = arg('--output-base', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/candidate-coverage-2026-07-13'));
const ranking = read(rankingFile), signalDate = ranking.signalDate, rankingYear = Number(ranking.universe?.rankingYear || Number(signalDate.slice(0, 4)) - 1);
if (ranking.schemaVersion !== 'krx-weekly-ranking-workbook/v1') throw new Error('ranking file has an unsupported schema');
const annual = A.loadAnnualUniverse(universeFile), snapshot = annual.byYear.get(rankingYear); if (!snapshot) throw new Error(`missing ${rankingYear} annual snapshot`);
const raw = xlsxRows(rawWorkbook, rankingYear).slice(2).filter(row => row.A && row.B).map(row => ({ rank: Number(row.A), ticker: String(row.B).padStart(6, '0'), name: row.C, market: row.D })).filter(row => row.rank >= 1 && row.rank <= snapshot.rawTop300Count).sort((a, b) => a.rank - b.rank);
if (raw.length !== snapshot.rawTop300Count) throw new Error(`raw workbook count ${raw.length} does not match snapshot count ${snapshot.rawTop300Count}`);
const common = new Set(snapshot.constituents.map(row => row.ticker));
const fullRanking = new Map(ranking.fullRanking.map(row => [String(row.ticker).padStart(6, '0'), row]));
const compliance = new Set((ranking.complianceExclusions || []).map(x => String(x.ticker || x).padStart(6, '0')));
const { series } = L.loadSeriesByTicker();
const kospi = read(path.join(L.DATA, 'normalized/_KS11.json')).bars;
const signalIndex = kospi.findIndex(row => row.date === signalDate); if (signalIndex < 1) throw new Error(`signal date ${signalDate} is absent from KOSPI cache`);
const fundamentalAsOf = kospi[signalIndex - 1].date;

const rows = raw.map(rawRow => {
  const row = { rawRank: rawRow.rank, ticker: rawRow.ticker, name: rawRow.name, market: rawRow.market, universeStatus: '', priceStatus: '', dartStatus: '', fundamentalMetricCount: null, filingDate: null, complianceStatus: '', rankingStatus: '', rank: null, score: null, primaryReason: '' };
  if (!common.has(row.ticker)) {
    row.universeStatus = '제외'; row.priceStatus = '미평가'; row.dartStatus = '미평가'; row.complianceStatus = '미평가'; row.rankingStatus = '미랭킹'; row.primaryReason = nonOrdinaryReason(rawRow); return row;
  }
  row.universeStatus = '통과';
  const file = path.join(L.DATA, 'normalized', `${row.ticker}.json`);
  let bars = null;
  if (!fs.existsSync(file)) row.priceStatus = '결측: 가격 캐시 파일 없음';
  else { bars = read(file).bars || []; const index = L.lastIndex(bars, signalDate); if (bars.length < 273) row.priceStatus = '결측: 273거래일 미만'; else if (index < 252 || bars[index]?.date !== signalDate) row.priceStatus = '결측: 신호일 종가 없음'; else row.priceStatus = '가용'; }
  const fundamental = fundamentalDiagnostic(series.get(row.ticker) || [], fundamentalAsOf); row.dartStatus = fundamental.status; row.fundamentalMetricCount = fundamental.metricCount; row.filingDate = fundamental.filingDate;
  row.complianceStatus = compliance.has(row.ticker) ? '제외' : '통과';
  const ranked = fullRanking.get(row.ticker); if (ranked) { row.rankingStatus = '랭킹 가능'; row.rank = ranked.rank; row.score = ranked.score; row.primaryReason = '가격·DART·컴플라이언스 조건 모두 통과'; return row; }
  row.rankingStatus = '미랭킹';
  if (row.complianceStatus === '제외') row.primaryReason = '컴플라이언스 제외(005930)';
  else if (row.priceStatus !== '가용') row.primaryReason = row.priceStatus;
  else row.primaryReason = fundamental.detail;
  return row;
});
const counts = Object.fromEntries(['랭킹 가능', '미랭킹'].map(status => [status, rows.filter(row => row.rankingStatus === status).length]));
const reasonCounts = Object.entries(rows.reduce((map, row) => { map[row.primaryReason] = (map[row.primaryReason] || 0) + 1; return map; }, {})).sort((a, b) => b[1] - a[1]);
const payload = { generatedAt: new Date().toISOString(), signalDate, executionDate: ranking.executionDate, fundamentalAsOf, rankingYear, rawTop300Count: raw.length, commonShareCount: snapshot.commonShareCount, rankedCount: fullRanking.size, counts, reasonCounts: Object.fromEntries(reasonCounts), rows };
write(`${outputBase}.json`, payload);
const headers = ['원시순위', '코드', '종목', '시장', '유니버스', '가격', 'DART', '실적지표수', '공시일', '컴플라이언스', '랭킹상태', '랭킹', '점수', '주요 사유'];
fs.writeFileSync(`${outputBase}.csv`, [headers, ...rows.map(row => [row.rawRank, row.ticker, row.name, row.market, row.universeStatus, row.priceStatus, row.dartStatus, row.fundamentalMetricCount ?? '', row.filingDate ?? '', row.complianceStatus, row.rankingStatus, row.rank ?? '', row.score ?? '', row.primaryReason])].map(row => row.map(csvCell).join(',')).join('\n') + '\n');
const table = rows.map(row => `|${row.rawRank}|${row.ticker}|${row.name}|${row.universeStatus}|${row.priceStatus}|${row.dartStatus}${row.fundamentalMetricCount === null ? '' : ` (${row.fundamentalMetricCount})`}|${row.complianceStatus}|${row.rankingStatus}${row.rank ? ` #${row.rank}` : ''}|${row.primaryReason}|`).join('\n');
fs.writeFileSync(`${outputBase}.md`, `# Top 300 후보별 랭킹 가능 여부 — ${signalDate} 신호\n\n- 원시 유니버스: ${raw.length}개 · 보통주 통과: ${snapshot.commonShareCount}개 · 최종 랭킹 가능: ${fullRanking.size}개\n- 실적 기준일: ${fundamentalAsOf}까지 접수된 DART 공시(신호일 1거래일 전)\n- 컴플라이언스 제외: ${[...compliance].join(', ') || '없음'}\n\n## 요약\n\n|구분|종목 수|\n|---|---:|\n${reasonCounts.map(([reason, count]) => `|${reason}|${count}|`).join('\n')}\n\n## 전 종목 원장\n\n|원시순위|코드|종목|유니버스|가격|DART(지표수)|컴플라이언스|랭킹|주요 사유|\n|---:|---|---|---|---|---|---|---|---|\n${table}\n`);
console.log(JSON.stringify({ ok: true, outputBase, raw: raw.length, common: snapshot.commonShareCount, ranked: fullRanking.size, reasons: Object.fromEntries(reasonCounts) }, null, 2));
