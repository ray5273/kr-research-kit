#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import https from 'node:https';
const root=process.env.KRX_TREND_CACHE||path.join(process.env.HOME,'.cache/krx-trend-portfolio-monitor'); const panel=path.join(root,'kr-strategy-backtest/dart-quarterly-panel'); const out=path.join(root,'fundamentals.json'); const kospi=path.join(root,'kospi.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')); const n=x=>{const v=Number(String(x??'').replaceAll(',',''));return Number.isFinite(v)?v:null};
// Revenue matching MUST mirror FINANCIAL_PROXY_REGISTRY in lib/dart-quarterly-panel.js
// (duplicated inline because this script is deployed standalone to ~/.hermes/scripts,
// without the lib/ tree). Banks and insurers report no 매출액 line, so a default-only
// matcher silently dropped every financial from fundamentals.json -- and since the
// 52w-high builder gates candidates on membership there, KB금융/신한지주/하나금융지주/
// 삼성화재/현대해상/코리안리 등 47 names vanished from the live universe while the
// backtest that authorised the strategy kept them.
const REV_DEFAULT=/^(매출액|수익\(매출액\)|영업수익|매출)$/;
const REV_FINANCIAL=[/^순이자이익$/,/^보험수익$/,/^영업수익$/,/^이자수익$/];
const isFinancialStatement=list=>list.some(x=>/^(순이자이익|보험수익)$/.test(String(x.account_nm||'')));
function findRevenue(list){
  const direct=list.find(x=>x.account_id==='ifrs-full_Revenue'||x.account_id==='ifrs_Revenue'||REV_DEFAULT.test(x.account_nm||''));
  if(direct)return direct;
  if(!isFinancialStatement(list))return null;
  for(const rule of REV_FINANCIAL){const hit=list.find(x=>rule.test(String(x.account_nm||'')));if(hit)return hit}
  return null;
}
function account(list,kind){return (kind==='rev'?findRevenue(list):list.find(x=>/BasicEarningsLossPerShare/.test(x.account_id||'')||/기본.*주당.*이익/.test(x.account_nm||'')))||null}
// Panel files come in two shapes: a bare {response} and the newer {attempts:[{response}]}
// written when a fetch was retried. Reading only the former made every retried ticker
// invisible here while lib/factor-backtest-core.js:loadRawReports saw both.
function panelResponse(x){const ok=(x.attempts||[]).find(a=>a.response?.status==='000');return ok?.response||x.response||null}
function fundamentals(){const by={};for(const f of fs.readdirSync(panel)){const m=f.match(/^(\d{6})-(\d{4})-(\d+)\.json$/);if(!m)continue;const x=read(path.join(panel,f));const response=panelResponse(x);if(response?.status!=='000')continue;const r=account(response.list,'rev'),e=account(response.list,'eps');if(!r||!e)continue;const d=String(r.rcept_no||e.rcept_no||'').slice(0,8);if(!/^\d{8}$/.test(d))continue;const v={date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`,revenue:n(r.thstrm_amount),eps:n(e.thstrm_amount)};if(v.revenue===null||v.eps===null)continue;(by[m[1]]??=[]).push(v)}const result={};for(const [t,a] of Object.entries(by)){a.sort((x,y)=>x.date.localeCompare(y.date));const z=a.at(-1),p=a.at(-2);if(p)result[t]={salesNow:z.revenue,salesPrev:p.revenue,epsNow:z.eps,epsPrev:p.eps,filingDate:z.date}}return {generatedAt:new Date().toISOString(),byTicker:result}}
function get(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'}){return new Promise((resolve,reject)=>https.get(url,{headers},r=>{const chunks=[];r.on('data',x=>chunks.push(x));r.on('end',()=>resolve(Buffer.concat(chunks)))}).on('error',reject))}

// Yahoo's ^KS11 chart series settles late: the newest session can appear as a
// provisional bar, vanish on a later request, and only then be finalised. On
// 2026-07-31 that left the series ending 07-30 while the real 07-31 close was
// +17.91% away -- a full day of lag the 5-day staleness check cannot see. Naver
// (the same KRX feed the holdings prices come from) already carries the completed
// session, so use it to extend the tail. Non-fatal: on failure Yahoo history stands.
async function naverKospiTail(afterDate){
  try{
    const q=new URLSearchParams({symbol:'KOSPI',requestType:'1',startTime:String(afterDate).replace(/-/g,''),endTime:'20300101',timeframe:'day'});
    const text=new TextDecoder('euc-kr').decode(await get('https://api.finance.naver.com/siseJson.naver?'+q,{'User-Agent':'Mozilla/5.0','Referer':'https://finance.naver.com/'}));
    return [...text.matchAll(/\["(\d{8})",\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/g)]
      .map(m=>({date:`${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6)}`,close:Number(m[5])}))
      .filter(x=>Number.isFinite(x.close)&&x.close>0&&x.date>afterDate);
  }catch(e){console.error('Naver KOSPI tail unavailable, using Yahoo series only:',e.message);return []}
}
async function main(){const f=fundamentals();fs.writeFileSync(out,JSON.stringify(f,null,2));let raw;for(const host of ['query2.finance.yahoo.com','query1.finance.yahoo.com']){try{raw=JSON.parse(await get(`https://${host}/v8/finance/chart/%5EKS11?range=3y&interval=1d&events=div%2Csplits`));if(raw.chart?.result?.[0])break;}catch{}}if(!raw?.chart?.result?.[0]){const prior=path.join(root,'kr-strategy-backtest/2026-07-10/raw/_KS11.json');if(fs.existsSync(prior))raw=read(prior);else if(fs.existsSync(kospi)){console.error('STALE KOSPI: Yahoo fetch failed and no fresh fallback exists; existing cache kept. Failing loudly.');console.log(JSON.stringify({fundamentals:Object.keys(f.byTicker).length,kospiBars:read(kospi).bars.length,staleKospi:true}));process.exit(3)}else throw Error('KOSPI cache refresh failed and no prior cache exists')}const q=raw.chart.result[0],o=q.indicators.quote[0];const bars=q.timestamp.map((ts,i)=>({date:new Date(ts*1000).toISOString().slice(0,10),close:o.close[i]})).filter(x=>Number.isFinite(x.close));const yahooLast=bars.length?bars[bars.length-1].date:null;const tail=yahooLast?await naverKospiTail(yahooLast):[];for(const bar of tail)bars.push({...bar,source:'naver'});if(tail.length)console.error(`KOSPI tail extended from Naver: ${yahooLast} -> ${bars[bars.length-1].date} (${tail.length} session(s) Yahoo had not finalised)`);fs.writeFileSync(kospi,JSON.stringify({fetchedAt:new Date().toISOString(),yahooLastDate:yahooLast,naverTailSessions:tail.length,bars},null,2));const lastKospiDate=bars.length?bars[bars.length-1].date:null;const STALE_DAYS=5;const staleBefore=new Date(Date.now()-STALE_DAYS*86400000).toISOString().slice(0,10);const kospiStale=!lastKospiDate||lastKospiDate<staleBefore;console.log(JSON.stringify({fundamentals:Object.keys(f.byTicker).length,kospiBars:bars.length,lastKospiDate,kospiStale}));if(kospiStale){console.error(`STALE KOSPI: last bar ${lastKospiDate} older than ${staleBefore} (Yahoo fetch likely failed and fell back to an old snapshot). Failing loudly so the regime job does not compute on stale data. Note: extended market holidays (설/추석) can also trip this.`);process.exit(3)}}main().catch(e=>{console.error(e.stack);process.exit(1)});
