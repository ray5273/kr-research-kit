#!/usr/bin/env node
'use strict';

// Render a compact, auditable annual view from a representative-strategy
// artifact.  A period's opening/closing portfolios are snapshots; the JSON
// keeps every five-session rebalance rather than implying buy-and-hold.

const fs = require('fs');
const path = require('path');

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const pct = value => `${(value * 100).toFixed(2)}%`;
const portfolio = entry => (entry?.holdings || []).map(row => ({ ticker: row.ticker, name: row.name, score: row.score }));

function main() {
  const input = arg('--input', null);
  const outDir = arg('--out-dir', null);
  if (!input || !outDir) throw new Error('--input and --out-dir are required');
  const artifact = read(input);
  const periodEnd = artifact.period?.end;
  if (!periodEnd || !Array.isArray(artifact.dailyEquity) || !Array.isArray(artifact.rebalancingLedger)) throw new Error('input is not a representative annual Top-300 artifact');

  const periods = [];
  for (const year of [...new Set(artifact.dailyEquity.map(row => row.date.slice(0, 4)))]) {
    const equity = artifact.dailyEquity.filter(row => row.date.startsWith(year));
    const prior = artifact.dailyEquity.filter(row => row.date < `${year}-01-01`).at(-1);
    const openingEquity = prior?.equity ?? artifact.summary.startEquity;
    const rebalances = artifact.rebalancingLedger.filter(row => row.executionDate.startsWith(year));
    const firstInvested = rebalances.find(row => Array.isArray(row.holdings) && row.holdings.length);
    periods.push({
      year: Number(year),
      startDate: equity[0].date,
      endDate: equity.at(-1).date,
      startEquity: openingEquity,
      endEquity: equity.at(-1).equity,
      return: equity.at(-1).equity / openingEquity - 1,
      rebalances: rebalances.length,
      firstInvestedPortfolio: { executionDate: firstInvested?.executionDate || null, holdings: portfolio(firstInvested) },
      closingPortfolio: { executionDate: rebalances.at(-1)?.executionDate || null, holdings: portfolio(rebalances.at(-1)) },
    });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceArtifact: input,
    period: artifact.period,
    methodology: artifact.methodology,
    caveat: 'Opening/closing portfolios are snapshots. The strategy rebalances every five sessions; use the source artifact rebalancingLedger for each intervening change.',
    periods,
  };
  const stem = `period-portfolios-and-returns-through-${periodEnd}`;
  write(path.join(outDir, `${stem}.json`), report);
  const sections = periods.map(row => {
    const formatPortfolio = snapshot => snapshot.holdings.length
      ? snapshot.holdings.map(item => `${item.ticker} ${item.name}`).join(', ')
      : '없음';
    return `## ${row.year}\n\n- 기간: ${row.startDate}~${row.endDate}; 수익률 ${pct(row.return)}; 리밸런싱 ${row.rebalances}회\n- 최초 실제 투자 포트폴리오 (${row.firstInvestedPortfolio.executionDate || '없음'}): ${formatPortfolio(row.firstInvestedPortfolio)}\n- 기말 포트폴리오 (${row.closingPortfolio.executionDate || '없음'}): ${formatPortfolio(row.closingPortfolio)}`;
  }).join('\n\n');
  const markdown = `# 연도별 Top 300 기간별 포트폴리오·수익\n\n- 원본: [대표 전략 JSON](${path.basename(input)})\n- 기간: ${artifact.period.start}~${artifact.period.end}\n- 주의: 각 기간의 최초 실제 투자·기말 포트폴리오는 스냅샷이다. 전략은 5거래일마다 다시 순위를 매겨 교체하며, 모든 교체 내역은 [기간별 JSON](${stem}.json)과 원본 JSON의 \`rebalancingLedger\`에 있다.\n- 데이터 성격: KRX 원가격·분할 추론 보정 부분 가격수익 진단이며, 배당·유증·합병·상장폐지 대가의 완결 검증은 포함하지 않는다.\n\n|기간|수익률|기초 자산|기말 자산|리밸런싱|\n|---:|---:|---:|---:|---:|\n${periods.map(row => `|${row.year}|${pct(row.return)}|${Math.round(row.startEquity).toLocaleString('ko-KR')}원|${Math.round(row.endEquity).toLocaleString('ko-KR')}원|${row.rebalances}|`).join('\n')}\n\n${sections}\n`;
  fs.writeFileSync(path.join(outDir, `${stem}.md`), markdown);
  console.log(JSON.stringify({ json: path.join(outDir, `${stem}.json`), markdown: path.join(outDir, `${stem}.md`), periods: periods.map(row => ({ year: row.year, return: row.return, rebalances: row.rebalances })) }, null, 2));
}

if (require.main === module) main();
