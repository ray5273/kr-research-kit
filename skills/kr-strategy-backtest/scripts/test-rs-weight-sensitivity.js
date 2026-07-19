#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..'),OUT=path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y');
const x=require(path.join(OUT,'rs-weight-sensitivity-backtest-through-2026-07-10.json'));
const old=require(path.join(OUT,'alternative-factor-matrix-backtest-through-2026-07-10.json')).strategies.minerviniRS__epsRevenue.summary;
assert(Math.abs(x.strategies.standard.summary.cagr-old.cagr)<.01,'40/30/30 must reproduce existing Minervini RS baseline');
for(const [name,s]of Object.entries(x.strategies)){assert(s.monthlySelections.every(m=>m.holdings.length<=10),`${name}: holdings cap`);assert(s.trades.every(t=>t.date>t.signalDate),`${name}: next-session execution`);assert(s.trades.every(t=>t.estimatedCost>0),`${name}: costs`);}
assert.notStrictEqual(x.strategies.fast.summary.cagr,x.strategies.standard.summary.cagr,'weight variation must produce distinct result');
console.log(JSON.stringify({pass:true,standardCagr:x.strategies.standard.summary.cagr,fastCagr:x.strategies.fast.summary.cagr},null,2));
