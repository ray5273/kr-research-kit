#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..'),OUT=path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y');
const x=require(path.join(OUT,'regime-ma-window-sensitivity-through-2026-07-10.json'));
const old=require(path.join(OUT,'mdd-overlay-backtest-through-2026-07-10.json')).strategies.minerviniRS__E.summary;
assert.deepStrictEqual(Object.keys(x.strategies),['ma60','ma120','ma150','ma200']);
assert(Math.abs(x.strategies.ma200.summary.cagr-old.cagr)<1e-9,'200-day result must reproduce current strategy');
for(const [name,s]of Object.entries(x.strategies)){assert(s.trades.every(t=>t.date>t.signalDate),`${name}: next-session execution`);assert(s.trades.every(t=>t.estimatedCost>0),`${name}: costs`);}
console.log(JSON.stringify({pass:true,ma200Cagr:x.strategies.ma200.summary.cagr,ma60Cagr:x.strategies.ma60.summary.cagr},null,2));
