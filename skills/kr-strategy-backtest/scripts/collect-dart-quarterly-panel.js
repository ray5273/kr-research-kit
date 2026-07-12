#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),https=require('https');
const ROOT=path.resolve(__dirname,'..','..','..'),TOP=path.join(ROOT,'analysis-example/kr-market/strategies/trend-following-10y/largecap-momentum-backtest-2026-07-10.json'),CORP=path.join(ROOT,'.tmp/opendart-cache/CORPCODE.xml'),OUT=path.join(ROOT,'.tmp/kr-strategy-backtest/dart-quarterly-panel');
const key=process.env.OPENDART_API_KEY;if(!key)throw new Error('OPENDART_API_KEY required');fs.mkdirSync(OUT,{recursive:true});
const corp=fs.readFileSync(CORP,'utf8');const codes=new Map([...corp.matchAll(/<list>\s*<corp_code>(.*?)<\/corp_code>[\s\S]*?<stock_code>(.*?)<\/stock_code>[\s\S]*?<\/list>/g)].map(x=>[x[2].trim(),x[1].trim()]));
const get=u=>new Promise((ok,no)=>{const req=https.get(u,{headers:{'User-Agent':'kr-research-kit/1.0'}},r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>{try{ok(JSON.parse(s))}catch(e){no(e)}})});req.on('error',no)});
const jobs=[];for(const s of require(TOP).universe.top300){const c=codes.get(s.ticker);if(!c)continue;for(let y=2015;y<=2026;y++)for(const report of ['11013','11012','11014','11011'])jobs.push({ticker:s.ticker,corpCode:c,year:y,report});}
let done=0,skip=0,fail=0,fallback=0;
async function fetchReport(j, fsDiv) {
  const u=`https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${j.corpCode}&bsns_year=${j.year}&reprt_code=${j.report}&fs_div=${fsDiv}`;
  return get(u);
}
async function worker(){while(jobs.length){const j=jobs.shift(),f=path.join(OUT,`${j.ticker}-${j.year}-${j.report}.json`);let existing=null;
  if(fs.existsSync(f)){try{existing=JSON.parse(fs.readFileSync(f));}catch{} }
  // Existing CFS no-data files are retried against OFS; this repairs companies
  // that publish only separate financial statements without redownloading valid data.
  if(existing && existing.response?.status==='000'){skip++;continue}
  if(existing && existing.response?.status==='013' && existing.fsDiv==='CFS'){skip++;continue}
  try{
    let fsDiv='CFS', x=existing?.response;
    if(!x || x.status!=='013') x=await fetchReport(j,'CFS');
    if(x?.status==='013') { const ox=await fetchReport(j,'OFS'); if(ox?.status==='000'){x=ox;fsDiv='OFS';fallback++;} }
    fs.writeFileSync(f,JSON.stringify({ticker:j.ticker,year:j.year,report:j.report,fsDiv,fetchedAt:new Date().toISOString(),response:x}));
    done++;
  }catch(e){fail++;fs.writeFileSync(f,JSON.stringify({ticker:j.ticker,year:j.year,report:j.report,error:e.message}));}
  if((done+skip+fail)%100===0)console.log(JSON.stringify({done,skip,fail,fallback,remaining:jobs.length}));await new Promise(r=>setTimeout(r,170));}}
Promise.all([worker(),worker()]).then(()=>console.log(JSON.stringify({done,skip,fail,total:done+skip+fail}))).catch(e=>{console.error(e);process.exit(1)});
