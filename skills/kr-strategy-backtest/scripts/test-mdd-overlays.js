#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..');
const x=require(path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y/mdd-overlay-backtest-through-2026-07-10.json'));
assert(x.baselineReproduction.pass,'legacy 25bp baseline must reproduce');
assert(Math.abs(x.baselineReproduction.actualCagr-.48082380556788173)<.01,'legacy CAGR tolerance');
for(const [key,s] of Object.entries(x.strategies)){
  assert(s.trades.every(t=>t.date>t.signalDate),`${key}: a trade must execute after its signal`);
  assert(s.trades.every(t=>t.estimatedCost>0),`${key}: every trade must pay cost`);
  assert(s.monthlySelections.every(m=>m.names.length<=10),`${key}: max holdings`);
  assert(s.dailyEquity.every(p=>p.cash>=-.01),`${key}: cash may not be materially negative`);
}
assert.notStrictEqual(x.strategies.mddFactor__mddRank.summary.cagr,x.strategies.momentum__baseline.summary.cagr,'MDD rank factor must differ from baseline');
assert.notStrictEqual(x.strategies.mddFactor__calmar.summary.cagr,x.strategies.momentum__baseline.summary.cagr,'Calmar factor must differ from baseline');
assert(x.strategies.momentum__E.summary.maxDrawdown>x.strategies.momentum__baseline.summary.maxDrawdown,'regime+vol should reduce MDD in this run');
console.log(JSON.stringify({pass:true,strategies:Object.keys(x.strategies).length,baselineCagr:x.strategies.momentum__baseline.summary.cagr,overlayMdd:x.strategies.momentum__E.summary.maxDrawdown},null,2));
