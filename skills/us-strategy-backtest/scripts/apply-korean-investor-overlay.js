#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const required = (value, message) => { if (!value) throw new Error(message); return value; };
const pct = value => `${(value * 100).toFixed(2)}%`;
const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
function csv(file, columns) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/), header = lines.shift().split(',').map(x => x.trim());
  for (const column of columns) if (!header.includes(column)) throw new Error(`${file}: missing ${column} column`);
  return lines.filter(Boolean).map((line, index) => {
    const values = line.split(',').map(x => x.trim()), row = Object.fromEntries(header.map((key, i) => [key, values[i]]));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error(`${file}:${index + 2}: date must be YYYY-MM-DD`);
    return row;
  });
}
function main() {
  const resultFile = required(arg('--result'), 'Usage: --result result.json --fx usdkrw.csv [--contributions contributions.csv] [--initial-krw 100000000] [--fx-cost .001] [--out result-korean-net.json]');
  const fxFile = required(arg('--fx'), '--fx is required; it must contain date,usdkrw daily values');
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  const fx = new Map(csv(fxFile, ['date', 'usdkrw']).map(row => [row.date, Number(row.usdkrw)]));
  if ([...fx.values()].some(value => !Number.isFinite(value) || value <= 0)) throw new Error('--fx contains invalid usdkrw values');
  const initialKrw = Number(arg('--initial-krw') || '100000000'), fxCost = Number(arg('--fx-cost') || '.001'), taxRate = Number(arg('--tax-rate') || '.22'), deduction = Number(arg('--tax-deduction-krw') || '2500000');
  if (![initialKrw, fxCost, taxRate, deduction].every(Number.isFinite) || initialKrw <= 0 || fxCost < 0 || taxRate < 0 || deduction < 0) throw new Error('Invalid Korean-investor parameters');
  const contributions = arg('--contributions') ? csv(arg('--contributions'), ['date', 'krw']).map(row => ({ date: row.date, krw: Number(row.krw) })) : [{ date: result.dailyEquity[0].date, krw: initialKrw }];
  if (contributions.some(x => !Number.isFinite(x.krw) || x.krw <= 0)) throw new Error('--contributions contains invalid krw values');
  const byDate = new Map(result.dailyEquity.map(x => [x.date, x]));
  for (const contribution of contributions) if (!byDate.has(contribution.date)) throw new Error(`Contribution date ${contribution.date} is not a strategy session; use the next available session explicitly`);
  const additions = new Map(); for (const contribution of contributions) additions.set(contribution.date, (additions.get(contribution.date) || 0) + contribution.krw);
  let units = 0, totalContributed = 0;
  const dailyKrwEquity = result.dailyEquity.map(point => {
    const rate = fx.get(point.date); if (!rate) throw new Error(`Missing USD/KRW rate for ${point.date}`);
    const addedKrw = additions.get(point.date) || 0;
    if (addedKrw) { units += addedKrw * (1 - fxCost) / rate / point.equity; totalContributed += addedKrw; }
    return { date: point.date, usdkrw: rate, addedKrw, portfolioUnits: units, grossKrwEquity: units * point.equity * rate };
  });
  const final = dailyKrwEquity.at(-1), finalAfterFxExit = final.grossKrwEquity * (1 - fxCost), taxableProfitApprox = finalAfterFxExit - totalContributed, taxReserve = Math.max(0, taxableProfitApprox - deduction) * taxRate, netKrwEquity = finalAfterFxExit - taxReserve;
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceResult: resultFile,
    fxFile,
    assumptions: {
      funding: 'Existing USD cash and existing USD positions stay in USD. Only an added KRW contribution is converted at its contribution-date USD/KRW rate.',
      fxCostOneWay: fxCost,
      tax: `Full liquidation at the final date; reserve max(0, KRW profit - ${deduction}) × ${taxRate}. This is a Korean-investor estimate, not a tax filing calculation.`,
    },
    contributions,
    totalContributedKrw: totalContributed,
    final: { date: final.date, usdkrw: final.usdkrw, grossKrwEquity: final.grossKrwEquity, afterFxExitKrwEquity: finalAfterFxExit, taxReserveKrw: taxReserve, netKrwEquity, grossReturn: finalAfterFxExit / totalContributed - 1, netReturn: netKrwEquity / totalContributed - 1 },
    dailyKrwEquity,
  };
  const out = arg('--out') || resultFile.replace(/\.json$/, '.korean-net.json');
  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  const md = out.replace(/\.json$/, '.md');
  fs.writeFileSync(md, `# 미국 전략 한국 투자자 세후·환율 오버레이\n\n- 기간: ${result.sourcePeriod.start}~${result.sourcePeriod.end}\n- 원화 납입액: ${won(totalContributed)}\n- 최종 USD/KRW: ${final.usdkrw.toFixed(2)}\n- 환전 후·세전 평가액: ${won(finalAfterFxExit)} (${pct(output.final.grossReturn)})\n- 22% 양도세 추정 적립액: ${won(taxReserve)}\n- 세후 추정 평가액: ${won(netKrwEquity)} (${pct(output.final.netReturn)})\n\n## 가정\n\n- 기존 달러는 재환전하지 않고, 원화 추가 납입분만 해당 날짜의 USD/KRW로 환전한다.\n- 마지막 날 전량 청산·원화 환전을 가정했다. 실제 세금은 종목별 실현손익·원화 환산·다른 해외주식 손익으로 신고 시 달라진다.\n- 원본: [JSON](${path.basename(resultFile)})\n`);
  console.log(JSON.stringify({ out, markdown: md, grossReturn: output.final.grossReturn, netReturn: output.final.netReturn }, null, 2));
}
main();
