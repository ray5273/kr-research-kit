#!/usr/bin/env node
// Writes or refreshes "## 목표가 계산 기준" in <dir>/memo.md from <dir>/analysis-data.json targets (before the Street section).
// Usage: node render-target-basis.js --dir analysis-example/kr/<company>
const fs=require('fs'),path=require('path');
const r=require('./research');
const dir=process.argv[process.argv.indexOf('--dir')+1], d=JSON.parse(fs.readFileSync(path.join(dir,'analysis-data.json'),'utf8')), t=d.targets;
const n=v=>v.toLocaleString('ko-KR',{maximumFractionDigits:2}), signed=v=>`${v>=0?'+':'−'}${n(Math.abs(v))}`;
const pct=v=>`${v>=0?'+':'−'}${Math.abs(v*100).toFixed(1)}%`;
const src=id=>{const s=d.sources.find(x=>x.id===id);return `[${s.label}](${s.url})`;};
const adj=(t.adjustments||[]), adjSum=adj.reduce((a,b)=>a+b.value,0);
const list=r.horizonTargets(t), m=t.multiples;
const L=[];
L.push('## 목표가 계산 기준','');
L.push(`기간별 목표가는 아래 한 가지 식으로만 계산한다. 증권사 목표가는 비교용이며 계산에 쓰지 않는다. 현재가는 기준일 종가 ${n(t.price.value)}원이다. ${src(t.price.source)}`,'');
L.push('```','목표가 = (해당 연도 영업이익 컨센서스 × EV/영업이익 배수 − 순차입금 ± 조정) ÷ 주식 수','```','');
L.push('| 입력값 | 값 | 출처·기준 |','| --- | ---: | --- |');
list.forEach(h=>L.push(`| ${h.months}개월 목표 이익 (${h.year}년 영업이익 컨센서스) | ${n(h.operatingProfit)}억원 | ${src(h.source)} |`));
L.push(`| EV/영업이익 배수 | 보수 ${m.bear}배 · 기준 ${m.base}배 · 낙관 ${m.bull}배 | 작성자 선택(아래 설명) |`);
L.push(`| 순차입금 | ${n(t.netDebt.value)}억원 | ${t.netDebt.note||''} · ${src(t.netDebt.source)} |`);
adj.forEach(a=>L.push(`| ${a.label} | ${signed(a.value)}억원 | ${src(a.source)} |`));
L.push(`| 주식 수 | ${n(t.shares.value)}주 | ${src(t.shares.source)} |`,'');
L.push('기준 배수로 계산한 과정이다.','');
list.forEach(h=>{
  const ev=h.operatingProfit*m.base, eq=ev-t.netDebt.value+adjSum;
  const steps=[`${n(h.operatingProfit)}억원 × ${m.base}배 = ${n(ev)}억원`,`− 순차입금 ${n(t.netDebt.value)}억원`,...adj.map(a=>`${a.value>=0?'+':'−'} ${a.label.replace(/\(.*\)/,'').trim()} ${n(Math.abs(a.value))}억원`)];
  const tail=eq>0?`= 주주 몫 ${n(eq)}억원 ÷ ${n(t.shares.value)}주 = **${n(h.prices.base)}원** (100원 단위 반올림, 현재가 대비 ${pct(h.upside)}, ${h.label})`:`= 주주 몫 ${signed(eq)}억원으로 음수라 목표가가 나오지 않는다 (${h.label})`;
  L.push(`- **${h.months}개월:** ${steps.join(' ')} ${tail}`);
});
L.push('');
L.push('| 기간 | 보수 | 기준 | 낙관 | 기준 상승여력 | 추천 |','| --- | ---: | ---: | ---: | ---: | --- |');
const w=v=>v===null?'가치 음수':`${n(v)}원`;
list.forEach(h=>L.push(`| ${h.months}개월 | ${w(h.prices.bear)} | ${w(h.prices.base)} | ${w(h.prices.bull)} | ${h.upside===null?'—':pct(h.upside)} | ${h.label} |`));
L.push('');
L.push(`추천은 기준 목표가의 상승여력으로 정한다. +30% 이상 강한 매수, +10% 이상 매수, −10% 이상 중립, −30% 이상 매도, 그 미만 강한 매도다. 12개월 추천이 판단 레벨의 가격·밸류에이션 축 점수가 되고, 이 축은 2배로 반영된다.`,'');
L.push(`배수는 작성자가 정했다. 기준 ${m.base}배는 사이트 계산기와 같은 값이고, 보수 ${m.bear}배와 낙관 ${m.bull}배는 배수에 따라 목표가가 얼마나 움직이는지 보여 주는 민감도다. 업종 평균이나 회사의 과거 배수 범위로 검증한 값이 아니다.`,'');
L.push(`이 계산의 한계는 세 가지다. 첫째, 배수가 결과를 거의 결정한다. 둘째, ${list.length>1?list.at(-1).months+'개월 목표가에도 ':''}6월 말 순차입금을 그대로 써서 그사이 설비투자와 차입 변화를 반영하지 않았다. 셋째, 미래 이익으로 계산한 가치를 할인하지 않고 현재가와 바로 비교했다.`);
if(t.brokers) L.push('',`비교로 증권사 목표가 ${t.brokers.count}건은 ${n(t.brokers.min)}~${n(t.brokers.max)}원, 중앙값 ${n(t.brokers.median)}원(현재가 대비 ${pct(t.brokers.median/t.price.value-1)})이다. 증권사는 대체로 더 먼 해의 이익이나 더 높은 배수를 쓴다.`);
const sec=L.join('\n')+'\n\n';
const p=path.join(dir,'memo.md'); let s=fs.readFileSync(p,'utf8');
s=s.replace(/## 목표가 계산 기준\n[\s\S]*?(?=## )/,'');
s=s.replace('## Street / Alternative Views',sec+'## Street / Alternative Views');
fs.writeFileSync(p,s);
