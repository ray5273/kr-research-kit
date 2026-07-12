#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..'),OUT=path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y');
const x=require(path.join(OUT,'alternative-factor-matrix-backtest-through-2026-07-10.json'));
const keys=Object.keys(x.strategies);assert.strictEqual(keys.length,12,'4x3 matrix');
for(const [key,s] of Object.entries(x.strategies)){assert(s.monthlySelections.every(m=>m.holdings.length<=10),`${key}: holdings cap`);assert(s.trades.every(t=>t.date>t.signalDate),`${key}: next-session execution`);assert(s.trades.every(t=>/^\d{6}$/.test(t.ticker)),`${key}: ticker format`);assert(s.monthlySelections.flatMap(m=>m.holdings).every(h=>Number.isFinite(h.score)),`${key}: finite scores`);}
const high=x.strategies.high52__epsRevenue.monthlySelections.flatMap(m=>m.holdings).map(h=>h.high52).filter(v=>v!==null);assert(high.length&&high.every(v=>v>0&&v<=1.0000001),'52-week high range');
const old=require(path.join(OUT,'fundamental-momentum-holdings-sensitivity-through-2026-07-10.json')).strategies['10'].summary;const now=x.strategies.momentum__epsRevenue.summary;assert(Math.abs(old.cagr-now.cagr)<.01,'baseline regression');assert(x.data.hashes.priceManifestSha256&&x.data.hashes.dartPanelManifestSha256,'input hashes');
console.log(JSON.stringify({pass:true,combinations:keys.length,maxHoldings:10,baselineCagrDelta:now.cagr-old.cagr},null,2));
