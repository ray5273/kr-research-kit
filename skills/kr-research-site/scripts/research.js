// Public earnings data: validate before rendering or copying anything to the site.
const fs = require('fs');
const path = require('path');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const check = (ok, message) => { if (!ok) throw new Error(`Research data: ${message}`); };
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const quarter = v => /^\d{4}-Q[1-4]$/.test(v || '');
const quarterIndex = v => Number(v.slice(0,4))*4 + Number(v.at(-1));
const number = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => number(v) ? v.toLocaleString('ko-KR', {maximumFractionDigits:2}) : '확인 불가';
function identity(entry) {
  if (entry.companyId !== undefined) {
    check(/^[a-z]+\/[a-z0-9][a-z0-9.-]*$/.test(entry.companyId), 'invalid companyId');
    check(entry.companyId === `${entry.market}/${String(entry.ticker).toLowerCase()}`, 'companyId disagrees with market/ticker');
    return entry.companyId;
  }
  return /^[a-z]+$/.test(entry.market || '') && /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(entry.ticker || '') ? `${entry.market}/${entry.ticker.toLowerCase()}` : null;
}
const companyHref = article => article.companyId ? `/companies/${article.companyId}/` : null;
function loadResearch(entry, {root, safety, asOfDate}) {
  check(entry.articleType === undefined || ['earnings-review','research','update'].includes(entry.articleType), 'invalid articleType');
  check(entry.period === undefined || quarter(entry.period), 'invalid period');
  if (entry.analysisData === undefined) return null;
  check(typeof entry.analysisData === 'string', 'analysisData must be a file path');
  const raw = fs.readFileSync(safety.checkPath(path.resolve(root, entry.analysisData), 'Analysis data'), 'utf8');
  safety.checkContent(raw, 'Analysis data');
  const d = JSON.parse(raw);
  if(d.initialReview !== undefined) check(typeof d.initialReview === 'boolean', 'initialReview must be boolean');
  check(d.version === 1 && d.companyId === identity(entry) && d.period === entry.period, 'version/company/period mismatch');
  check(date(d.verifiedAt) && d.verifiedAt <= (entry.dateModified || asOfDate), 'invalid verification date');
  check(d.basis === '연결 K-IFRS · 분기' && typeof d.unit === 'string', 'basis/unit required');
  check(typeof d.stance === 'string' && typeof d.rationale === 'string', 'stance/rationale required');
  if(d.verdict !== undefined) check(typeof d.verdict === 'string' && d.verdict.length > 0 && d.verdict.length <= 10, 'verdict must be a short label (≤10 chars)');
  if(d.nextCheck !== undefined) {
    const n=d.nextCheck;
    check(n && typeof n.event === 'string' && n.event && Array.isArray(n.conditions) && n.conditions.length && n.conditions.every(c=>typeof c === 'string' && c), 'nextCheck needs event and conditions');
    check(/^\d{4}-\d{2}$/.test(n.expected || '') && n.expected >= d.verifiedAt.slice(0,7), 'nextCheck.expected must be a future YYYY-MM');
  }
  check(Array.isArray(d.sources) && d.sources.length > 0, 'sources required');
  const sources = new Map();
  d.sources.forEach(s => {
    check(s.id && !sources.has(s.id) && s.label && /^https:\/\//.test(s.url), 'invalid/duplicate source');
    check(date(s.publishedAt) && s.publishedAt <= d.verifiedAt, 'source after verification date');
    if (s.dataAsOf !== undefined) check(date(s.dataAsOf) && s.dataAsOf === s.publishedAt, 'source dataAsOf/publication mismatch');
    if (s.retrievedAt !== undefined) check(date(s.retrievedAt) && s.retrievedAt >= s.publishedAt && s.retrievedAt <= d.verifiedAt, 'invalid source retrieval date');
    if (s.role === 'historical_consensus') check(s.dataAsOf && s.retrievedAt, 'historical consensus dates required');
    sources.set(s.id,s);
  });
  function observation(o, period, role) {
    check(o && o.role === role && o.period === period && o.basis === d.basis && o.unit === d.unit, 'observation period/role/basis/unit mismatch');
    check(o.value === null || number(o.value), 'observation must be numeric or null');
    if (o.value === null) check(typeof o.reason === 'string' && o.reason.length, 'missing values need a reason');
    else {
      check(date(o.publishedAt) && o.publishedAt <= d.verifiedAt && sources.has(o.source), 'observation provenance required');
      check(sources.get(o.source).publishedAt === o.publishedAt, 'source publication mismatch');
      check(['잠정','확정','추정','가이던스'].includes(o.status), 'observation status required');
      if (role === 'actual') check(['잠정','확정'].includes(o.status) && o.publishedAt >= d.releasedAt, 'actual must be a released result');
      else check(o.status === '추정', 'prior expectations must be estimates');
      if (['market','author'].includes(role)) check(d.releasedAt && o.publishedAt < d.releasedAt, 'post-release estimate used as prior expectation');
    }
  }
  check(d.releasedAt === null || (date(d.releasedAt) && d.releasedAt <= d.verifiedAt), 'invalid release date');
  check(Array.isArray(d.comparison) && d.comparison.length, 'comparison required');
  d.comparison.forEach(row => {
    check(row.label && row.cause, 'comparison label/cause required');
    for (const role of ['market','author','actual']) observation(row[role], d.period, role);
    if (row.key === 'parentNetIncome') check(row.incomeScope === 'parent', 'parent income scope required');
    if (row.key === 'netIncome' && row.incomeScope !== undefined) check(row.incomeScope === 'total', 'total income scope required');
    if (row.incomeScope !== undefined) {
      check(['parent','total'].includes(row.incomeScope), 'invalid income scope');
      for (const role of ['market','author','actual']) if (number(row[role].value)) check(row[role].incomeScope === row.incomeScope, 'income scope mismatch');
    }
  });
  check(Array.isArray(d.quarters) && d.quarters.length === 8, 'exactly eight quarters required');
  d.quarters.forEach((q,i) => {
    check(quarter(q.period) && (!i || quarterIndex(q.period) === quarterIndex(d.quarters[i-1].period)+1), 'quarters must be consecutive');
  });
  check(d.quarters.at(-1).period === d.period, 'chart must end at review quarter');
  check(Array.isArray(d.series) && d.series.length, 'chart series required');
  d.series.forEach(s => {
    check(s.key && s.label && s.unit && Array.isArray(s.points) && s.points.length === 8, 'invalid series');
    s.points.forEach((p,i) => {
      check(p && ['actual','estimate'].includes(p.kind) && (p.value === null || number(p.value)), 'invalid chart point');
      check(p.period === d.quarters[i].period && typeof p.basis === 'string', 'chart point period/basis required');
      if (p.value === null) check(p.reason, 'missing chart point reason required');
      else check(sources.has(p.source) && date(p.publishedAt) && p.publishedAt === sources.get(p.source).publishedAt && p.publishedAt <= d.verifiedAt, 'chart provenance required');
    });
  });
  // A table value and the same chart metric must never silently disagree.
  d.comparison.forEach(row => {
    const s = d.series.find(s => s.key === row.key);
    if (s) check(s.unit === d.unit && s.points.at(-1).value === row.actual.value && s.points.at(-1).basis === d.basis, 'comparison/chart disagreement');
  });
  for (const key of ['checks','changes','promises']) {
    check(Array.isArray(d[key]), `${key} array required`);
    d[key].forEach(item => {
      check(date(item.date) && item.date <= d.verifiedAt && item.claim && item.evidence, `invalid ${key} record`);
      check((item.sources || []).every(id => sources.has(id)), 'unknown evidence source');
      if(item.due !== undefined) check(date(item.due), 'invalid verification due date');
      if (key !== 'changes') check(['충족','미충족','판단 보류'].includes(item.status), 'invalid check status');
      else check(item.kind === undefined || ['판단','자료'].includes(item.kind), 'change kind must be 판단 or 자료');
    });
  }
  const c = d.calculator;
  check(c && c.period && c.label && c.assumptions && c.variables?.length === 2, 'calculator assumptions required');
  ['priceLabel','priceUnit','priceNote','baseProfitLabel','baseProfitNote'].forEach(k=>check(c[k] === undefined || (typeof c[k] === 'string' && c[k].length > 0), `invalid calculator ${k}`));
  c.variables.forEach(v => check(v.key && v.label && v.unit && [v.min,v.max,v.step,v.default].every(number) && v.min < v.max && v.step > 0 && v.default >= v.min && v.default <= v.max, 'invalid calculator range'));
  check(c.variables[0].key === 'volume' && c.variables[1].key === 'margin', 'calculator supports volume and margin');
  check(['price','baseProfit','multiple','netDebt'].every(k => number(c[k])) && c.price > 0 && c.multiple > 0, 'invalid fixed calculator assumptions');
  if(c.netDebtSource) check(sources.has(c.netDebtSource) && date(c.netDebtAsOf) && c.netDebtAsOf <= sources.get(c.netDebtSource).publishedAt, 'net debt provenance required');
  check(c.marketCap === null || (number(c.marketCap) && c.marketCap > 0 && sources.has(c.marketCapSource)), 'market cap source required');
  return d;
}
function table(headers, rows, caption) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${e(caption)}"><table role="table"><caption>${e(caption)}</caption><thead role="rowgroup"><tr role="row">${headers.map(h=>`<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(row=>`<tr role="row">${row.map((v,i)=>i ? `<td role="cell" data-label="${e(headers[i])}">${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function sourceLinks(d, ids, compact = false) {
  return (ids || []).map(id => { const s=d.sources.find(s=>s.id===id); return `<a href="${e(s.url)}" aria-label="${e(s.label)} (${e(s.publishedAt)})">${compact ? '출처' : `${e(s.label)} <span class="nowrap">(${e(s.publishedAt)})</span>`}</a>`; }).join(' · ');
}
function valueHtml(o,d) {
  return o.value === null ? e(o.reason) : fmt(o.value);
}
function delta(actual, expected) {
  if (!number(actual.value) || !number(expected.value)) return '비교 불가';
  const v = actual.value - expected.value;
  if (!expected.value) return `${v>0?'+':''}${fmt(v)} <small>예상 0: 비율 없음</small>`;
  const pct = v/Math.abs(expected.value)*100;
  // A ratio over 100% says more about a small base than about the beat itself.
  return `${v>0?'+':''}${fmt(v)} <small>${pct>0?'+':''}${fmt(pct)}%${Math.abs(pct) >= 100 ? ' · 낮은 기저' : ''}</small>`;
}
function comparison(d) {
  const hasAuthor = d.comparison.some(r=>number(r.author.value));
  const headers = hasAuthor ? ['지표','시장 예상','작성자 예상','실제','시장 대비','작성자 대비'] : ['지표','시장 예상','실제','시장 대비'];
  const rows = d.comparison.map(r=>hasAuthor ? [e(r.label),valueHtml(r.market,d),valueHtml(r.author,d),valueHtml(r.actual,d),delta(r.actual,r.market),delta(r.actual,r.author)] : [e(r.label),valueHtml(r.market,d),valueHtml(r.actual,d),delta(r.actual,r.market)]);
  const provenance = [];
  for (const role of ['market',...(hasAuthor?['author']:[]),'actual']) {
    const unique = new Map(d.comparison.filter(r=>number(r[role].value)).map(r=>{const o=r[role];return [`${o.source}|${o.publishedAt}|${o.status}`,o];}));
    for (const o of unique.values()) provenance.push(`<li>${{market:'시장 예상',author:'작성자 예상',actual:'실제'}[role]} · ${e(o.publishedAt)} ${role==='actual'?'공개':'기준'} · ${e(o.status)} · ${sourceLinks(d,[o.source])}</li>`);
  }
  const authorReasons = [...new Set(d.comparison.map(r=>r.author.reason).filter(Boolean))];
  const authorNote = hasAuthor ? '' : `<p class="src-note">작성자 예상 · ${e(authorReasons.join(' · '))}. 비교는 시장 예상 기준입니다.</p>`;
  return `<section id="earnings-comparison"><h2>발표 전 기대와 실제 결과</h2><p>${e(d.period)} · ${e(d.basis)} · ${e(d.unit)}. 차이는 실제 − 예상(억원 차이 먼저), 비율의 분모는 예상의 절댓값입니다. 비율이 100%를 넘으면 낮은 기저를 함께 표시합니다.</p>${authorNote}${table(headers,rows,'실적 비교표')}<ul class="comparison-provenance">${provenance.join('')}</ul><details class="src-note"><summary>차이의 원인과 비교 기준</summary><ul>${d.comparison.map(r=>`<li><strong>${e(r.label)}</strong> · ${e(r.cause)}</li>`).join('')}</ul></details></section>`;
}
function records(d, key, title) {
  const items=d[key];
  if(key==='checks' && d.initialReview === true && items.length && items.every(r=>r.status==='판단 보류')) return `<section><h2>${e(title)}</h2><p class="src-note">첫 가설 등록 · 다음 실적에서 검증합니다. 과거 작성자 예상과의 적중률은 계산하지 않습니다.</p><ul>${items.map(r=>`<li><strong>${e(r.claim)}</strong><br>${e(r.evidence)} · 등록 ${e(r.date)} ${sourceLinks(d,r.sources)}</li>`).join('')}</ul></section>`;
  return `<section class="research-records"><h2>${e(title)}</h2>${items.length ? `<div class="record-cards">${items.map(r=>`<article class="record-card"><p class="src-note">${e(r.date)} · ${e(r.status==='판단 보류' && r.due > d.verifiedAt ? '검증시점 미도래' : r.status || r.to || '')}${r.due?` · 검증 ${e(r.due)}`:''}</p><h3>${e(r.claim)}</h3><p>${e(r.evidence)}</p>${sourceLinks(d,r.sources)}</article>`).join('')}</div>` : '<p>첫 가설 등록 · 다음 발표에서 검증합니다.</p>'}</section>`;
}
function chart(d,s) {
  const points=s.points, vals=points.map(p=>p.value).filter(number);
  if (!vals.length) return '';
  const dataTable=table(['분기','값','구분 · 회계 기준','공개일 · 출처'],points.map(p=>[e(p.period),p.value===null?e(p.reason):fmt(p.value),`${p.kind==='actual'?'실제':'작성자 추정'} · ${e(p.basis)}`,p.value===null?'—':`${e(p.publishedAt)} · ${sourceLinks(d,[p.source])}`]),`${s.label} 수치·출처`);
  const low=Math.min(0,...vals), high=Math.max(1,...vals);
  const x=i=>44+i*296/7, y=v=>134-(v-low)/(high-low)*100;
  const dots=points.map((p,i)=>number(p.value)?`<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" class="${p.kind}"><title>${e(p.period)} ${fmt(p.value)} ${e(s.unit)} · ${p.kind==='actual'?'실제':'추정'}</title></circle>`:'');
  const lines=points.map((p,i)=>i && number(p.value) && number(points[i-1].value)?`<line x1="${x(i-1)}" y1="${y(points[i-1].value)}" x2="${x(i)}" y2="${y(p.value)}" class="${p.kind==='estimate'||points[i-1].kind==='estimate'?'estimate':'actual'}"/>`:'');
  const years=[...new Set(points.map(p=>p.period.slice(0,4)))].map(year=>{const indices=points.flatMap((p,i)=>p.period.startsWith(year)?[i]:[]);return `<text x="${(x(indices[0])+x(indices.at(-1)))/2}" y="180" text-anchor="middle">${e(year)}</text>`;}).join('');
  const latest=points.at(-1);
  return `<figure class="metric-chart"><div class="metric-head"><h3>${e(s.label)} <small>${e(s.unit)}</small></h3><p>${latest.value===null?'확인 중':fmt(latest.value)}<small>${e(latest.period)} · ${latest.kind==='actual'?'실제':'추정'}</small></p></div><svg viewBox="0 0 360 190" role="img" aria-label="${e(s.label)} 8분기 추이. 실제는 실선·채운 원, 추정은 점선·빈 원. 누락 구간은 연결하지 않음"><text x="4" y="26">${fmt(high)}</text><text x="4" y="145">${fmt(low)}</text><line x1="40" x2="346" y1="${y(0)}" y2="${y(0)}" class="axis"/>${lines.join('')}${dots.join('')}${points.map((p,i)=>`<text x="${x(i)}" y="158" text-anchor="middle">${e(p.period.slice(5))}</text>`).join('')}${years}</svg><details><summary>분기별 수치·출처</summary>${dataTable}</details><figcaption>실제: 실선·채운 원 / 추정: 점선·빈 원 · 빈 값은 0이 아닙니다.</figcaption></figure>`;
}
const {calculate} = require('./scenario');
function calculator(d) {
  const c=d.calculator, result=calculate(c,...c.variables.map(v=>v.default));
  return `<section class="scenario" id="scenario-calculator" data-calculator><h2>가정 조절 계산기</h2><p>${e(c.label)} · ${e(c.period)}</p><p class="scenario-warning"><strong>설명용 민감도 · 정식 이익 전망이나 목표가가 아닙니다.</strong><br>${e(c.assumptions)}</p><details><summary>고정 가정과 근거 보기</summary>${table(['고정 항목','값','근거·한계'],[
    // Label overrides let non-cathode companies reuse the calculator; defaults keep the first example unchanged.
    [c.priceLabel||'혼합 판가',`${fmt(c.price)}${c.priceUnit||'억원/천 톤'}`,c.priceNote||'작성자 가정 · LFP/삼원계 가격과 구성비 미반영'],
    [c.baseProfitLabel||'기타 합산 이익',`${fmt(c.baseProfit)}억원`,c.baseProfitNote||'작성자 가정 · 음극재·기초소재·공통비용'],
    ['EV/영업이익',`${fmt(c.multiple)}배`,'작성자 선택 배수 · 시장 적정 배수로 검증되지 않음'],
    ['순차입금',`${fmt(c.netDebt)}억원`,c.netDebtSource ? sourceLinks(d,[c.netDebtSource])+' · '+e(c.netDebtAsOf)+' 시점; 미래 잔액 아님' : '작성자 차감 가정 · 실측값 아님']
  ],'민감도의 고정 가정')}</details><form>${c.variables.map(v=>`<label>${e(v.label)} (${e(v.unit)})<input name="${e(v.key)}" type="number" min="${v.min}" max="${v.max}" step="${v.step}" value="${v.default}" required><small>범위 ${fmt(v.min)}–${fmt(v.max)} · 간격 ${fmt(v.step)}</small></label>`).join('')}<button type="reset">기본 가정으로 복원</button></form><output aria-live="polite">${calculationText(result)}</output><details class="scenario-valuation"><summary>같은 가정으로 계산한 가치 보기</summary><p data-valuation-output>${valuationText(result)}</p><p>기업가치 = 영업이익 × 배수<br>지분가치 = 기업가치 − 순차입금</p><p>세금·감가상각·성장투자·희석을 충분히 반영하지 않은 조건부 계산입니다.</p></details><p class="src-note">영업이익 = ${e(c.variables[0].label)} × ${e(c.priceLabel||'혼합 판가')} × ${e(c.variables[1].label)} ÷ 100 + ${e(c.baseProfitLabel||'기타 합산 이익')}</p><p class="src-note">${c.marketCap===null ? '시가총액 미검증: 가격 역산 보류' : `가격 관측: 시가총액 ${fmt(c.marketCap)}억원 · ${sourceLinks(d,[c.marketCapSource])}`}</p><script type="application/json" data-calculator-config>${JSON.stringify(c).replace(/</g,'\\u003c')}</script></section>`;
}
function calculationText(r) { return `설명용 연간 영업이익 ${fmt(r.profit)}억원${r.profit<=0?' · 적자로 배수 가치평가 적용 불가':''}`; }
function valuationText(r) { return r.profit<=0 ? '적자로 배수 가치평가 적용 불가' : `가정 배수 적용 기업가치 ${fmt(r.enterpriseValue)}억원 · 순차입금 차감 후 지분가치 ${fmt(r.equityValue)}억원${r.requiredProfit===null?'':` · 같은 조건의 가격 역산 이익 ${fmt(r.requiredProfit)}억원`}`; }
function widgetParts(d) {
  if(!d) return {};
  return {
    comparison:`<details class="src-note"><summary>자료 기준과 확인 범위 · ${e(d.verifiedAt)}</summary><ul>${(d.limitations || []).map(item=>`<li>${e(item)}</li>`).join('')}</ul></details>${comparison(d)}`,
    checks:records(d,'checks','지난 판단 점검표'),
    charts:`<section id="quarterly-metrics"><h2>최근 8분기 핵심 지표</h2><p class="src-note">실제와 추정은 구분하며, 빈 값은 0이 아닙니다. 누적 현금흐름을 분기 손익과 직접 비교하지 않습니다.</p>${d.series.map(s=>chart(d,s)).join('')}</section>`,
    calculator:calculator(d),promises:records(d,'promises','경영진 약속 추적')
  };
}
function nextCheck(d) {
  const n=d?.nextCheck;
  if(!n) return '';
  return `<div class="next-check"><p class="label">다음 확인 · ${e(n.event)} <span class="nowrap">(${e(`${n.expected.slice(0,4)}년 ${Number(n.expected.slice(5))}월`)} 예상)</span></p><ul>${n.conditions.map(c=>`<li>${e(c)}</li>`).join('')}</ul></div>`;
}
function widgets(d) {return d ? `<div class="research-widgets">${Object.values(widgetParts(d)).join('')}</div>` : '';}

function companyPages(articles) {
  const groups=new Map();
  for(const a of articles) if(a.companyId) groups.set(a.companyId,[...(groups.get(a.companyId)||[]),a]);
  return [...groups].map(([id,list])=>{
    const latest=list.find(a=>a.research), d=latest?.research, first=list[0];
    const posts=list.map(a=>({slug:a.slug,title:a.headline,updatedAt:a.dateModified,researchDate:a.researchDate,period:a.entry.period||null}));
    const changes=list.flatMap(a=>a.research?.changes || []).filter((r,i,all)=>all.findIndex(v=>v.date===r.date && v.claim===r.claim)===i).sort((a,b)=>b.date.localeCompare(a.date));
    const sources=[...new Map(list.flatMap(a=>a.research?.sources || []).map(s=>[s.id,s])).values()];
    // Re-reading a filing without changing the call is a data update, not a change of view.
    const stanceChanges=changes.filter(r=>(r.kind||'판단')==='판단'), dataUpdates=changes.filter(r=>r.kind==='자료');
    const history=d ? records({...d,sources,changes:stanceChanges},'changes','판단 변경 이력') : '<h2>판단 변경 이력</h2><p>구조화된 판단 기록이 없습니다. 관련 글의 기준일과 업데이트를 확인하세요.</p>';
    const updates=dataUpdates.length ? `<h2>자료 갱신 기록</h2><p class="src-note">판단은 바꾸지 않고 수치·원문만 보강한 기록입니다.</p><ul class="update-list">${dataUpdates.map(r=>`<li><span class="nowrap">${e(r.date)}</span> · ${e(r.claim)} ${sourceLinks({sources},r.sources,true)}</li>`).join('')}</ul>` : '';
    const opSeries=d && (d.series.find(s=>s.key==='operatingProfit') || d.series[0]);
    const links=items=>`<ul>${items.map(a=>`<li><a href="/${e(a.slug)}/">${e(a.title)}</a> · <span class="nowrap">자료 ${e(a.researchDate)}</span> · <span class="nowrap">편집 ${e(a.updatedAt)}</span></li>`).join('')}</ul>`;
    const reviews=posts.filter(p=>p.period), others=posts.filter(p=>!p.period);
    return {id,name:first.company,url:`/companies/${id}/`,updatedAt:posts.map(p=>p.updatedAt).sort().at(-1),posts,
      content:`<div class="narrow page company-page"><header><p class="sub">기업별 리서치 이력 · ${e(first.ticker)}</p><h1>${e(first.company)}</h1><p>마지막 검증일: ${d?e(d.verifiedAt):'구조화된 검증 기록 없음'}</p></header><div class="body"><h2>현재 판단과 근거</h2><p>${d && first.research ? `${d.verdict?`<span class="verdict">${e(d.verdict)}</span> `:''}${e(d.stance)} · ${e(d.rationale)}` : '가장 최근 관련 글을 확인하세요. 이전 구조화된 판단을 현재 판단으로 자동 승계하지 않습니다.'}</p>${d && first.research ? nextCheck(d) : ''}${opSeries ? chart(d,opSeries) : ''}<h2>분기별 실적 리뷰</h2>${reviews.length ? links(reviews) : '<p>등록된 실적 리뷰가 없습니다.</p>'}${history}${updates}${others.length ? `<h2>관련 글</h2>${links(others)}` : ''}</div></div>`};
  });
}
module.exports={identity,companyHref,loadResearch,widgets,nextCheck,companyPages,calculate,calculationText,valuationText,widgetParts,e};
