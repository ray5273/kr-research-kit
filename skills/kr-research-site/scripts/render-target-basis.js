#!/usr/bin/env node
// Writes or refreshes "## 목표가 계산 기준" in <dir>/memo.md from <dir>/analysis-data.json targets (before the Street section).
// Everything is a table or a short bullet: rules and thresholds are never run together in a paragraph.
// Usage: node render-target-basis.js --dir analysis-example/kr/<company>
const fs=require('fs'),path=require('path');
const r=require('./research');
const dir=process.argv[process.argv.indexOf('--dir')+1], d=JSON.parse(fs.readFileSync(path.join(dir,'analysis-data.json'),'utf8')), t=d.targets;
const n=v=>v.toLocaleString('ko-KR',{maximumFractionDigits:2}), signed=v=>`${v>=0?'+':'−'}${n(Math.abs(v))}`;
const pct=v=>`${v>=0?'+':'−'}${Math.abs(v*100).toFixed(1)}%`;
const src=id=>{const s=d.sources.find(x=>x.id===id);return `[${s.label}](${s.url})`;};
const adj=(t.adjustments||[]), adjSum=adj.reduce((a,b)=>a+b.value,0);
const list=r.horizonTargets(t), m=t.multiples, ebitda=t.basis==='EV/EBITDA', basis=ebitda?'EV/EBITDA':'EV/영업이익';
const w=v=>v===null?'가치 음수':`${n(v)}원`;
const L=['## 목표가 계산 기준',''];
L.push(`- **현재가:** ${n(t.price.value)}원 (기준일 종가) ${src(t.price.source)}`);
L.push(`- **배수:** ${basis} 기준 ${m.base}배 · 보수 ${m.bear}배 · 낙관 ${m.bull}배`);
L.push('- **증권사 목표가:** 비교용, 계산에 쓰지 않음','');
L.push('```',`목표가 = (${ebitda?'(해당 연도 영업이익 컨센서스 + 감가상각)':'해당 연도 영업이익 컨센서스'} × ${basis} 배수 − 순차입금 ± 조정) ÷ 주식 수`,'```','');
L.push('| 입력값 | 값 | 출처·기준 |','| --- | ---: | --- |');
list.forEach(h=>{
  L.push(`| ${h.months}개월 목표 이익 (${h.year}년 영업이익 컨센서스) | ${n(h.operatingProfit)}억원 | ${src(h.source)} |`);
  if(ebitda) L.push(`| ${h.months}개월 감가상각 (${h.year}년) | ${n(h.depreciation)}억원 | ${src(h.depreciationSource)} |`);
});
L.push(`| 순차입금 | ${n(t.netDebt.value)}억원 | ${t.netDebt.note?t.netDebt.note+' · ':''}${src(t.netDebt.source)} |`);
adj.forEach(a=>L.push(`| ${a.label} | ${signed(a.value)}억원 | ${src(a.source)} |`));
L.push(`| 주식 수 | ${n(t.shares.value)}주 | ${src(t.shares.source)} |`,'');
L.push(`기준 ${m.base}배 계산 과정 (억원):`,'');
L.push(`| 기간 | ${ebitda?'(이익 + 감가상각)':'이익'} × ${m.base}배 | − 순차입금 |${adj.length?' ± 조정 |':''} = 주주 몫 | ÷ 주식 수 = 목표가 |`,`| --- | ---: | ---: |${adj.length?' ---: |':''} ---: | ---: |`);
list.forEach(h=>{
  const ev=Math.round(h.earnings*m.base), eq=ev-t.netDebt.value+adjSum;
  L.push(`| ${h.months}개월 | ${n(ev)} | −${n(t.netDebt.value)} |${adj.length?` ${signed(adjSum)} |`:''} ${signed(eq)} | ${eq>0?`**${n(h.prices.base)}원**`:'음수 → 목표가 없음'} |`);
});
L.push('');
L.push('| 기간 | 보수 | 기준 | 낙관 | 기준 상승여력 | 추천 |','| --- | ---: | ---: | ---: | ---: | --- |');
list.forEach(h=>L.push(`| ${h.months}개월 | ${w(h.prices.bear)} | ${w(h.prices.base)} | ${w(h.prices.bull)} | ${h.upside===null?'—':pct(h.upside)} | ${h.label} |`));
L.push('');
L.push('추천 구간 (기준 목표가 상승여력):','');
L.push('| +30% 이상 | +10~30% | −10~+10% | −30~−10% | −30% 미만 |','| --- | --- | --- | --- | --- |','| 강한 매수 | 매수 | 중립 | 매도 | 강한 매도 |','');
L.push(`- **판단 레벨 연결:** ${list[0].months}개월 추천 = 가격·밸류에이션 축 점수, 2배 가중`);
L.push(`- **배수 선택:** ${t.multipleNote}`);
L.push('- **한계 1:** 배수가 결과를 거의 결정한다');
L.push(`- **한계 2:** ${list.length>1?'모든 기간에 ':''}6월 말 순차입금을 그대로 쓴다`);
L.push('- **한계 3:** 미래 이익 기준 가치를 할인하지 않는다');
if(t.brokers) L.push(`- **증권사 비교:** ${t.brokers.count}건 ${n(t.brokers.min)}~${n(t.brokers.max)}원, 중앙값 ${n(t.brokers.median)}원 (현재가 대비 ${pct(t.brokers.median/t.price.value-1)})`);
const sec=L.join('\n')+'\n\n';
const p=path.join(dir,'memo.md'); let s=fs.readFileSync(p,'utf8');
s=s.replace(/## 목표가 계산 기준\n[\s\S]*?(?=## )/,'');
s=s.replace('## Street / Alternative Views',sec+'## Street / Alternative Views');
fs.writeFileSync(p,s);
