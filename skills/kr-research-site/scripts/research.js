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
  // Some issuers (e.g. 대한항공) publish only standalone preliminary results; the page prints the basis so readers see which.
  check(['연결 K-IFRS · 분기','별도 K-IFRS · 분기'].includes(d.basis) && typeof d.unit === 'string', 'basis/unit required');
  check(typeof d.stance === 'string' && typeof d.rationale === 'string', 'stance/rationale required');
  if(d.verdict !== undefined) check(typeof d.verdict === 'string' && d.verdict.length > 0 && d.verdict.length <= 10, 'verdict must be a short label (≤10 chars)');
  if(d.nextCheck !== undefined) {
    const n=d.nextCheck;
    check(n && typeof n.event === 'string' && n.event && Array.isArray(n.conditions) && n.conditions.length && n.conditions.every(c=>typeof c === 'string' && c), 'nextCheck needs event and conditions');
    check(/^\d{4}-\d{2}$/.test(n.expected || '') && n.expected >= d.verifiedAt.slice(0,7), 'nextCheck.expected must be a future YYYY-MM');
  }
  if(d.rating !== undefined) {
    const axes=d.rating?.axes;
    check(Array.isArray(axes) && axes.length === RATING_AXES.length && axes.every((a,i)=>a && a.key === RATING_AXES[i].key), 'rating needs the five fixed axes in order');
    axes.forEach(a=>{check(typeof a.actual === 'string' && a.actual.length > 0, 'rating axis needs the actual observation');
      check(a.score === null ? typeof a.reason === 'string' && a.reason.length > 0 : Number.isInteger(a.score) && a.score >= -2 && a.score <= 2, 'rating score must be −2…+2 or null with a reason');});
    check(axes.at(-1).score !== null, 'rating price axis must be scored: valuation is mandatory');
    if(d.targets !== undefined) check(axes.at(-1).score === horizonTargets(d.targets)[0].score, 'price axis must follow the first-horizon target upside');
    check(d.verdict === ratingLevel(axes).label, 'verdict must equal the computed rating level');
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
  if(d.targets !== undefined) {
    const t=d.targets, ok=v=>v && number(v.value) && sources.has(v.source);
    check(ok(t.price) && t.price.value>0 && ok(t.shares) && t.shares.value>0 && ok(t.netDebt), 'targets need sourced price, shares and net debt');
    check(t.multiples && ['bear','base','bull'].every(k=>number(t.multiples[k]) && t.multiples[k]>0) && t.multiples.bear<=t.multiples.base && t.multiples.base<=t.multiples.bull && typeof t.multipleNote === 'string' && t.multipleNote, 'targets need ordered bear/base/bull multiples and a rationale');
    check(Array.isArray(t.horizons) && t.horizons.length && t.horizons.every((h,i)=>Number.isInteger(h.months) && h.months>0 && (!i || h.months>t.horizons[i-1].months) && /^\d{4}$/.test(String(h.year)) && number(h.operatingProfit) && sources.has(h.source)), 'targets need increasing horizons with sourced profit');
    check(t.basis === undefined || t.basis === 'EV/EBITDA', 'targets basis must be omitted (EV/영업이익) or EV/EBITDA');
    if(t.basis === 'EV/EBITDA') check(t.horizons.every(h=>number(h.depreciation) && h.depreciation>=0 && sources.has(h.depreciationSource)), 'EV/EBITDA targets need sourced depreciation per horizon');
    (t.adjustments||[]).forEach(a=>check(a.label && number(a.value) && sources.has(a.source), 'target adjustments need label, value and source'));
    if(t.brokers) check(number(t.brokers.min) && number(t.brokers.median) && number(t.brokers.max) && t.brokers.min<=t.brokers.median && t.brokers.median<=t.brokers.max && Number.isInteger(t.brokers.count) && (t.brokers.sources||[]).every(id=>sources.has(id)), 'broker target range invalid');
  }
  check(c && c.period && c.label && c.assumptions && c.variables?.length === 2, 'calculator assumptions required');
  ['priceLabel','priceUnit','priceNote','baseProfitLabel','baseProfitNote'].forEach(k=>check(c[k] === undefined || (typeof c[k] === 'string' && c[k].length > 0), `invalid calculator ${k}`));
  c.variables.forEach(v => check(v.key && v.label && v.unit && [v.min,v.max,v.step,v.default].every(number) && v.min < v.max && v.step > 0 && v.default >= v.min && v.default <= v.max, 'invalid calculator range'));
  check(c.variables[0].key === 'volume' && c.variables[1].key === 'margin', 'calculator supports volume and margin');
  check(['price','baseProfit','multiple','netDebt'].every(k => number(c[k])) && c.price > 0 && c.multiple > 0, 'invalid fixed calculator assumptions');
  if(c.netDebtSource) check(sources.has(c.netDebtSource) && date(c.netDebtAsOf) && c.netDebtAsOf <= sources.get(c.netDebtSource).publishedAt, 'net debt provenance required');
  check(c.marketCap === null || (number(c.marketCap) && c.marketCap > 0 && sources.has(c.marketCapSource)), 'market cap source required');
  return d;
}
// Five fixed axes keep the buy/sell level reproducible: each is scored −2…+2 against the same wording for every company.
const RATING_AXES=[
  {key:'coreProfit',label:'본업 이익',criteria:{2:'일회성·보조금 제외 영업이익이 최악 가정에서도 흑자, 이익률 5% 이상',1:'최악 가정에서도 흑자',0:'추정 범위가 0을 걸침',[-1]:'최선 가정에서도 적자',[-2]:'최선 가정에서도 적자이고 전분기보다 확대'}},
  {key:'direction',label:'이익 방향',criteria:{2:'일회성 제외 기준 전분기·전년 대비 모두 개선',1:'한쪽 개선, 다른 쪽 비슷',0:'엇갈리거나 비슷',[-1]:'한쪽 악화, 다른 쪽 비슷',[-2]:'전분기·전년 대비 모두 악화'}},
  {key:'cash',label:'현금 전환',criteria:{2:'최근 2개 분기 잉여현금흐름 모두 양수',1:'최근 분기 잉여현금흐름 양수',0:'영업현금흐름 양수, 잉여현금흐름 음수',[-1]:'최근 분기 영업현금흐름 음수',[-2]:'최근 2개 분기 영업현금흐름 모두 음수'}},
  {key:'outlook',label:'전망 변화',criteria:{2:'발표 후 증권사 전망 대부분 상향, 회사 전망도 개선',1:'발표 후 증권사 전망 대부분 상향',0:'상향·하향이 엇갈림',[-1]:'발표 후 증권사 전망 대부분 하향',[-2]:'대부분 하향, 회사 전망도 악화'}},
  {key:'price',label:'가격·밸류에이션 (2배 가중)',criteria:{2:'12개월 기준 목표가 대비 상승여력 +30% 이상',1:'+10% 이상 +30% 미만',0:'−10% 이상 +10% 미만',[-1]:'−30% 이상 −10% 미만',[-2]:'−30% 미만 또는 목표 시점 지분가치 음수'}}
];
const RATING_LEVELS=['강한 매수','매수','중립','매도','강한 매도'];
// One class per level so the five badges read at a glance: red for buy, blue for sell (KRX convention), gray for 중립/보류.
const LEVEL_CLASS={'강한 매수':'v-sbuy','매수':'v-buy','중립':'v-hold','매도':'v-sell','강한 매도':'v-ssell'};
const verdictBadge=label=>`<span class="verdict ${LEVEL_CLASS[label]||'v-none'}">${e(label)}</span>`;
// Valuation is mandatory and weighted double: a stock is never rated above 중립 while its price demands more than consensus.
const RATING_WEIGHT={price:2};
function ratingLevel(axes) {
  const judged=axes.filter(a=>a.score!==null), price=axes.find(a=>a.key==='price');
  if(judged.length<3 || !price || price.score===null) return {label:'판단 보류',average:null,judged:judged.length,capped:false};
  const weight=a=>RATING_WEIGHT[a.key]||1;
  const average=judged.reduce((sum,a)=>sum+a.score*weight(a),0)/judged.reduce((sum,a)=>sum+weight(a),0);
  const raw=average>=1.2?'강한 매수':average>=0.5?'매수':average>-0.5?'중립':average>-1.2?'매도':'강한 매도';
  const label=price.score<0 && ['강한 매수','매수'].includes(raw) ? '중립' : price.score<1 && raw==='강한 매수' ? '매수' : raw;
  return {label,average,judged:judged.length,capped:label!==raw};
}
// Horizon targets: consensus operating profit × an explicit EV/OP multiple, bridged to equity per share.
// basis 'EV/EBITDA' adds each horizon's depreciation before the multiple, so heavy-D&A companies are not undervalued by a fixed EBITDA÷OP ratio.
const UPSIDE_BANDS=[[0.3,2,'강한 매수'],[0.1,1,'매수'],[-0.1,0,'중립'],[-0.3,-1,'매도']];
function upsideLevel(upside) {
  if(upside===null) return {score:-2,label:'강한 매도'};
  const band=UPSIDE_BANDS.find(([min])=>upside>=min);
  return band ? {score:band[1],label:band[2]} : {score:-2,label:'강한 매도'};
}
function horizonTargets(t) {
  const adjust=(t.adjustments||[]).reduce((sum,a)=>sum+a.value,0);
  return t.horizons.map(h=>{
    const earnings=h.operatingProfit+(t.basis==='EV/EBITDA'?h.depreciation:0);
    const at=m=>{const equity=earnings*m-t.netDebt.value+adjust;return equity>0?Math.round(equity*1e8/t.shares.value/100)*100:null;};
    const prices={bear:at(t.multiples.bear),base:at(t.multiples.base),bull:at(t.multiples.bull)};
    const upside=prices.base===null?null:prices.base/t.price.value-1;
    return {...h,earnings,prices,upside,...upsideLevel(upside)};
  });
}
function table(headers, rows, caption) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${e(caption)}"><table role="table"><caption>${e(caption)}</caption><thead role="rowgroup"><tr role="row">${headers.map(h=>`<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(row=>`<tr role="row">${row.map((v,i)=>i ? `<td role="cell" data-label="${e(headers[i])}">${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function sourceLinks(d, ids, compact = false) {
  return (ids || []).map(id => { const s=d.sources.find(s=>s.id===id); return `<a href="${e(s.url)}"${compact?' class="src-mini"':''} aria-label="${e(s.label)} (${e(s.publishedAt)})">${compact ? '출처' : `${e(s.label)} <span class="nowrap">(${e(s.publishedAt)})</span>`}</a>`; }).join(' · ');
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
    rating:rating(d),
    comparison:`<details class="src-note"><summary>자료 기준과 확인 범위 · ${e(d.verifiedAt)}</summary><ul>${(d.limitations || []).map(item=>`<li>${e(item)}</li>`).join('')}</ul></details>${comparison(d)}`,
    checks:records(d,'checks','지난 판단 점검표'),
    charts:`<section id="quarterly-metrics"><h2>최근 8분기 핵심 지표</h2><p class="src-note">실제와 추정은 구분하며, 빈 값은 0이 아닙니다. 누적 현금흐름을 분기 손익과 직접 비교하지 않습니다.</p>${d.series.map(s=>chart(d,s)).join('')}</section>`,
    calculator:calculator(d),promises:records(d,'promises','경영진 약속 추적')
  };
}
const signed=n=>n>0?`+${n}`:n<0?`−${-n}`:'0';
function ratingSummary(d) {
  const r=ratingLevel(d.rating.axes);
  return r.average===null ? `판정 가능한 축 ${r.judged}/5 · 판단 보류` : `판정 축 ${r.judged}/5 · 가중 평균 ${r.average>=0?'+':'−'}${Math.abs(r.average).toFixed(2)}${r.capped?' · 가격 부담으로 상한 적용':''}`;
}
// Thresholds shown on each step of the scale, so the reader never has to parse them from prose.
const LEVEL_BANDS={'강한 매수':'+1.2↑','매수':'+0.5~1.2','중립':'±0.5','매도':'−0.5~−1.2','강한 매도':'−1.2↓'};
const UPSIDE_TEXT={'강한 매수':'+30%↑','매수':'+10~30%','중립':'±10%','매도':'−10~−30%','강한 매도':'−30%↓'};
const scaleHtml=(bands,label,name)=>`<ol class="rating-scale" aria-label="${name}">${RATING_LEVELS.map(l=>`<li class="${LEVEL_CLASS[l]}${l===label?' on':''}"${l===label?' aria-current="true"':''}><b>${e(l)}</b><small>${bands[l]}</small></li>`).join('')}</ol>`;
const stats=items=>`<dl class="stat-row">${items.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
function rating(d) {
  if(!d?.rating) return '';
  const r=ratingLevel(d.rating.axes);
  const avg=r.average===null?'—':`${r.average>=0?'+':'−'}${Math.abs(r.average).toFixed(2)}`;
  const rows=d.rating.axes.map((a,i)=>[e(RATING_AXES[i].label),a.score===null?'—':`<strong>${signed(a.score)}</strong>`,a.score===null?'판정 불가':e(RATING_AXES[i].criteria[a.score]),`${e(a.actual)}${a.score===null?` <small>${e(a.reason)}</small>`:''}${a.sources?.length?' '+sourceLinks(d,a.sources,true):''}`]);
  const rule=table(['축','+2','+1','0','−1','−2'],RATING_AXES.map(a=>[e(a.label),...[2,1,0,-1,-2].map(n=>e(a.criteria[n]))]),'전체 채점 기준');
  const rules=['가격·밸류에이션 점수는 2배로 반영','가격 점수가 음수면 최고 중립 · 강한 매수는 가격 +1 이상','가격 판정 불가 또는 판정 축 3개 미만이면 판단 보류'];
  return `<section class="rating" id="rating"><h2>판단 레벨 · ${e(r.label)}</h2>${scaleHtml(LEVEL_BANDS,r.label,'판단 레벨 5단계와 가중 평균 구간')}${stats([['판정 축',`${r.judged}/5`],['가중 평균',avg],['가격 상한',r.capped?'적용':'없음']])}<ul class="rule-list">${rules.map(x=>`<li>${x}</li>`).join('')}</ul>${table(['축','점수','적용 기준','실제'],rows,'축별 기준과 실제')}${targets(d)}<details><summary>전체 채점 기준 보기</summary>${rule}</details><p class="scenario-warning">작성자의 기준일 판단이며 투자 권유가 아닙니다. 가격과 실적이 바뀌면 다음 리뷰에서 다시 채점합니다.</p></section>`;
}
const won=v=>v===null?'가치 음수':`${fmt(v)}원`, pct=v=>v===null?'—':`${v>=0?'+':'−'}${Math.abs(v*100).toFixed(1)}%`;
function targets(d) {
  const t=d.targets; if(!t) return '';
  const list=horizonTargets(t), m=t.multiples, ebitda=t.basis==='EV/EBITDA';
  const rows=list.map(h=>[`${h.months}개월`,`<strong>${won(h.prices.base)}</strong>`,pct(h.upside),verdictBadge(h.label),`${won(h.prices.bear)} ~ ${won(h.prices.bull)}`,`${h.year}년 영업이익 ${fmt(h.operatingProfit)}억원 ${sourceLinks(d,[h.source],true)}${ebitda?` + 감가상각 ${fmt(h.depreciation)}억원 ${sourceLinks(d,[h.depreciationSource],true)}`:''}`]);
  const bridge=[['순차입금',`−${fmt(t.netDebt.value)}억원`,`${e(t.netDebt.note||'')} ${sourceLinks(d,[t.netDebt.source],true)}`],...(t.adjustments||[]).map(a=>[e(a.label),`${a.value>=0?'+':'−'}${fmt(Math.abs(a.value))}억원`,sourceLinks(d,[a.source],true)]),['주식 수',`${fmt(t.shares.value)}주`,sourceLinks(d,[t.shares.source],true)]];
  const head=[['현재가',`${fmt(t.price.value)}원 ${sourceLinks(d,[t.price.source],true)}`],[`배수 · ${ebitda?'EV/EBITDA':'EV/영업이익'}`,`기준 ${fmt(m.base)}배 <small>보수 ${fmt(m.bear)} · 낙관 ${fmt(m.bull)}</small>`]];
  if(t.brokers) head.push(['증권사 목표가 중앙값',`${fmt(t.brokers.median)}원 <small>${t.brokers.count}건 · ${fmt(t.brokers.min)} ~ ${fmt(t.brokers.max)}</small>`]);
  return `<h3 id="targets">기간별 목표가와 추천</h3>${stats(head)}<p class="formula">목표가 = (${ebitda?'(영업이익 컨센서스 + 감가상각)':'영업이익 컨센서스'} × 배수 − 순차입금 ± 조정) ÷ 주식 수</p><p class="src-note">배수: ${e(t.multipleNote)}</p>${table(['기간','기준 목표가','상승여력','추천','보수~낙관','기준 이익(컨센서스)'],rows,'기간별 목표가')}<p class="mini-head">추천 구간 · 기준 목표가 상승여력 <small>${list[0].months}개월 추천 = 가격·밸류에이션 점수</small></p>${scaleHtml(UPSIDE_TEXT,list[0].label,'상승여력별 추천 구간')}${table(['가치 다리','값','기준'],bridge,'목표가 가치 다리')}`;
}
function ratingLine(d) {
  if(!d?.rating) return '';
  return `<p class="rating-line">${verdictBadge(d.verdict)} <a href="#rating">${e(ratingSummary(d))} · 축별 근거</a></p>`;
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
      content:`<div class="narrow page company-page"><header><p class="sub">기업별 리서치 이력 · ${e(first.ticker)}</p><h1>${e(first.company)}</h1><p>마지막 검증일: ${d?e(d.verifiedAt):'구조화된 검증 기록 없음'}</p></header><div class="body"><h2>현재 판단과 근거</h2><p>${d && first.research ? `${d.verdict?`${verdictBadge(d.verdict)} `:''}${e(d.stance)} · ${e(d.rationale)}` : '가장 최근 관련 글을 확인하세요. 이전 구조화된 판단을 현재 판단으로 자동 승계하지 않습니다.'}</p>${d && first.research ? rating(d).replace('<h2>','<h3>').replace('</h2>','</h3>')+nextCheck(d) : ''}${opSeries ? chart(d,opSeries) : ''}<h2>분기별 실적 리뷰</h2>${reviews.length ? links(reviews) : '<p>등록된 실적 리뷰가 없습니다.</p>'}${history}${updates}${others.length ? `<h2>관련 글</h2>${links(others)}` : ''}</div></div>`};
  });
}
module.exports={verdictBadge,identity,companyHref,loadResearch,widgets,nextCheck,ratingLine,ratingLevel,horizonTargets,RATING_AXES,companyPages,calculate,calculationText,valuationText,widgetParts,e};
