#!/usr/bin/env node
'use strict';

// Explain a rebuild instead of merely replacing a headline CAGR.  The report
// separates changes caused by coverage/parser fixes from changes caused by a
// longer price series, and keeps candidate/holding differences auditable.

const fs = require('fs');
const path = require('path');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); };
const summary = artifact => artifact.summary || artifact.strategy?.summary || artifact.strategies?.minerviniRS__E?.summary || null;
const tickers = artifact => new Set((artifact.rebalancingLedger || artifact.strategy?.rebalancingLedger || []).flatMap(row => row.tickers || row.selected || row.holdings?.map(x => x.ticker) || []));
function diffSet(before, after) { return { added: [...after].filter(x => !before.has(x)).sort(), removed: [...before].filter(x => !after.has(x)).sort() }; }
function candidateCount(candidate) { return candidate?.rankedCount ?? candidate?.rows?.filter(row => row.rankingStatus === '랭킹 가능').length ?? null; }
function main() {
  const beforeFile = arg('--before'), afterFile = arg('--after'), outBase = arg('--out-base');
  const beforeCandidateFile = arg('--before-candidate'), afterCandidateFile = arg('--after-candidate');
  if (!beforeFile || !afterFile || !outBase) throw new Error('Usage: report-coverage-rebuild-delta.js --before old.json --after new.json --out-base path [--before-candidate file --after-candidate file]');
  const before = read(beforeFile), after = read(afterFile), beforeCandidate = beforeCandidateFile && fs.existsSync(beforeCandidateFile) ? read(beforeCandidateFile) : null, afterCandidate = afterCandidateFile && fs.existsSync(afterCandidateFile) ? read(afterCandidateFile) : null;
  const beforeSummary = summary(before), afterSummary = summary(after);
  const changes = {};
  for (const key of ['totalReturn', 'cagr', 'annualizedVolatility', 'sharpeZeroRf', 'maxDrawdown', 'tradeCount', 'turnover']) if (Number.isFinite(beforeSummary?.[key]) && Number.isFinite(afterSummary?.[key])) changes[key] = afterSummary[key] - beforeSummary[key];
  const holdings = diffSet(tickers(before), tickers(after));
  const candidate = { before: candidateCount(beforeCandidate), after: candidateCount(afterCandidate) };
  candidate.delta = candidate.before === null || candidate.after === null ? null : candidate.after - candidate.before;
  const periodChanged = before.period?.end !== after.period?.end;
  const payload = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), beforeFile, afterFile,
    beforePeriod: before.period || null, afterPeriod: after.period || null,
    classification: { coverageOrParserChange: !periodChanged, timeSeriesExtension: periodChanged, note: periodChanged ? '종료일이 달라 가격 시계열 연장 효과와 커버리지 효과가 함께 있을 수 있다. 동일 종료일 재현본을 별도로 비교해야 한다.' : '동일 종료일 비교: 차이는 유니버스·가격·DART 커버리지 또는 파서 변경에서 발생한다.' },
    candidateCoverage: candidate, holdings, metrics: { before: beforeSummary, after: afterSummary, delta: changes },
  };
  write(`${outBase}.json`, payload);
  const p = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—';
  const markdown = `# Coverage rebuild delta — ${after.period?.end || 'unknown'}\n\n- 이전: \`${path.basename(beforeFile)}\`\n- 재구축: \`${path.basename(afterFile)}\`\n- 분류: ${payload.classification.note}\n\n|항목|이전|재구축|차이|\n|---|---:|---:|---:|\n|후보 수|${candidate.before ?? '—'}|${candidate.after ?? '—'}|${candidate.delta ?? '—'}|\n|누적 수익률|${p(beforeSummary?.totalReturn)}|${p(afterSummary?.totalReturn)}|${p(changes.totalReturn)}|\n|CAGR|${p(beforeSummary?.cagr)}|${p(afterSummary?.cagr)}|${p(changes.cagr)}|\n|Sharpe|${beforeSummary?.sharpeZeroRf?.toFixed(2) ?? '—'}|${afterSummary?.sharpeZeroRf?.toFixed(2) ?? '—'}|${changes.sharpeZeroRf?.toFixed(2) ?? '—'}|\n|MDD|${p(beforeSummary?.maxDrawdown)}|${p(afterSummary?.maxDrawdown)}|${p(changes.maxDrawdown)}|\n\n## 보유종목 차이\n\n- 신규 편입 이력: ${holdings.added.join(', ') || '없음'}\n- 제외 이력: ${holdings.removed.join(', ') || '없음'}\n`;
  fs.writeFileSync(`${outBase}.md`, markdown);
  console.log(JSON.stringify({ json: `${outBase}.json`, markdown: `${outBase}.md`, candidate, metricChanges: changes }, null, 2));
}
if (require.main === module) main();
