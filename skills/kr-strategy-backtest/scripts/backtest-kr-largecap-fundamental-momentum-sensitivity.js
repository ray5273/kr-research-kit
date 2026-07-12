#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..');
const OUT=path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y');
const DATA=path.join(ROOT,'.tmp/kr-strategy-backtest/2026-07-10/normalized');
const LABEL=process.env.CUTOFF||'2025-12-31';
const INPUT=path.join(OUT,`fundamental-momentum-backtest-through-${LABEL}.json`);
const BASE=path.join(OUT,'backtest-2026-07-10.json');
const CAPS=[5,10,15,20],COST=.0025,INITIAL=1e8;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');
const input=read(INPUT),base=read(BASE),calendar=input.strategy.dailyEquity.map(x=>x.date),
  selections=input.strategy.monthlySelections;
const tickers=[...new Set(selections.flatMap(x=>x.holdings.map(h=>h.ticker)))];
const states=new Map();
for(const t of tickers){const f=path.join(DATA,`${t}.json`);if(fs.existsSync(f)){const x=read(f);states.set(t,{bars:x.bars});}}
function last(bars,d){let l=0,h=bars.length-1,o=-1;while(l<=h){const m=(l+h)>>1;if(bars[m].date<=d){o=m;l=m+1}else h=m-1}return o}
function price(t,d,field){const s=states.get(t);if(!s)return null;const i=last(s.bars,d);if(i<0)return null;return field==='close'?s.bars[i].close:(s.bars[i].date===d?s.bars[i][field]:null)}
function stats(e){const daily=e.slice(1).map((x,i)=>x.equity/e[i].equity-1),mean=daily.reduce((a,b)=>a+b,0)/Math.max(1,daily.length),v=Math.sqrt(daily.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,daily.length-1)),vol=v*Math.sqrt(252);let peak=0,mdd=0;for(const x of e){peak=Math.max(peak,x.equity);mdd=Math.min(mdd,x.equity/peak-1)}const years=(Date.parse(e.at(-1).date)-Date.parse(e[0].date))/86400000/365.25,months=new Map();e.forEach(x=>months.set(x.date.slice(0,7),x.equity));const mv=[...months.values()],mr=mv.slice(1).map((x,i)=>x/mv[i]-1);return{startEquity:e[0].equity,endEquity:e.at(-1).equity,totalReturn:e.at(-1).equity/e[0].equity-1,cagr:(e.at(-1).equity/e[0].equity)**(1/years)-1,annualizedVolatility:vol,sharpeZeroRf:v?mean/v*Math.sqrt(252):0,maxDrawdown:mdd,monthWinRate:mr.filter(x=>x>0).length/Math.max(1,mr.length),sessions:e.length}}
function run(cap){const orders=new Map();for(const m of selections){if(!m.executionDate)continue;orders.set(m.executionDate,{signalDate:m.signalDate,tickers:m.holdings.slice(0,cap).map(x=>x.ticker)});}const pos=new Map(),trades=[];let cash=INITIAL,turnover=0;const value=(d,f)=>{let v=cash;for(const[t,q]of pos){const p=price(t,d,f);if(p!==null)v+=q*p}return v};const eq=[];for(const d of calendar){const o=orders.get(d);if(o){const before=value(d,'open'),names=o.tickers.filter(t=>price(t,d,'open')!==null),all=new Set([...pos.keys(),...names]);let lo=0,hi=before;for(let z=0;z<32;z++){let c=cash,inv=(lo+hi)/2;for(const t of all){const p=price(t,d,'open');if(p===null)continue;const old=pos.get(t)||0,target=names.includes(t)?inv/names.length/p:0,delta=target-old;c-=delta*p+Math.abs(delta)*p*COST}if(c>=0)lo=inv;else hi=inv}for(const t of all){const p=price(t,d,'open');if(p===null)continue;const old=pos.get(t)||0,target=names.includes(t)?lo/names.length/p:0,delta=target-old;if(Math.abs(delta)<1e-8)continue;const n=Math.abs(delta)*p,fee=n*COST;cash-=delta*p+fee;turnover+=n/Math.max(before,1);if(target)pos.set(t,target);else pos.delete(t);trades.push({date:d,signalDate:o.signalDate,ticker:t,side:delta>0?'BUY':'SELL',notional:n,estimatedCost:fee})}}eq.push({date:d,equity:value(d,'close'),cash,holdings:pos.size})}return{summary:{...stats(eq),tradeCount:trades.length,turnover},dailyEquity:eq,trades}}
const results={};for(const c of CAPS)results[c]=run(c);
const benchmark=stats(base.benchmark.dailyEquity.filter(x=>x.date>=input.period.start&&x.date<=input.period.end));
const artifact={generatedAt:new Date().toISOString(),period:input.period,source:INPUT,assumptions:{caps:CAPS,costOneWay:COST,signal:'same monthly selections and next-trading-day open execution'},benchmark,strategies:Object.fromEntries(CAPS.map(c=>[String(c),{summary:results[c].summary,dailyEquity:results[c].dailyEquity,trades:results[c].trades}]))};
const json=path.join(OUT,`fundamental-momentum-holdings-sensitivity-through-${LABEL}.json`);
const pct=x=>`${(x*100).toFixed(2)}%`;
const rows=CAPS.map(c=>{const s=results[c].summary;return`|${c}|${pct(s.totalReturn)}|${pct(s.cagr)}|${pct(s.annualizedVolatility)}|${s.sharpeZeroRf.toFixed(2)}|${pct(s.maxDrawdown)}|${pct(s.monthWinRate)}|${s.tradeCount}|${s.turnover.toFixed(2)}|`}).join('\n');
const md=path.join(OUT,`fundamental-momentum-holdings-sensitivity-through-${LABEL}.md`);
fs.writeFileSync(md,`# 가격 모멘텀 + EPS·매출 개선 전략 — 보유 종목 수 민감도\n\n- 기간: ${input.period.start}~${input.period.end}\n- 동일한 신호·공시일 필터·다음 거래일 시가 체결·편도 25bp 비용을 적용하고 보유 상한만 변경했다.\n\n|보유 상한|누적 수익률|CAGR|변동성|Sharpe|MDD|월 승률|거래 수|회전율|\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\n|벤치마크|${pct(benchmark.totalReturn)}|${pct(benchmark.cagr)}|${pct(benchmark.annualizedVolatility)}|${benchmark.sharpeZeroRf.toFixed(2)}|${pct(benchmark.maxDrawdown)}|${pct(benchmark.monthWinRate)}|—|—|\n\n주의: 현재 구성종목 기반 시뮬레이션이며 생존자 편향, 유동성·호가·시장충격·세금은 반영하지 않는다. 보유 종목 수를 바꾸면 위 결과를 사용해야 하며 기존 20종목 CAGR을 그대로 적용하면 안 된다.\n`);
write(json,artifact);console.log(JSON.stringify(Object.fromEntries(CAPS.map(c=>[c,results[c].summary])),null,2));
