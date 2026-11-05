#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function visible(text) {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[(?:red|blue|brown):\s*([^\]]+)\]/g, '$1')
    .replace(/[*_`]/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function audit(markdown) {
  const findings = [], paragraphs = []; let block = [], start = 0, fence = false, sources = false;
  const add = (rule, severity, line, message) => findings.push({rule, severity, line, message});
  function flush() {
    if (!block.length) return;
    const raw = block.join(' '), text = visible(raw);
    const sentenceText = visible(raw.replace(/\[[^\]]+\]\([^)]*\)/g, ''));
    const sentences = sentenceText.split(/(?<=[.!?。])\s+(?=[가-힣A-Z0-9])/u).length;
    paragraphs.push({line:start, chars:text.length, sentences});
    if (text.length > 350) add('long-paragraph','error',start,`${text.length} visible characters (limit 350)`);
    else if (text.length > 200 || sentences > 2) add('paragraph-rhythm','warn',start,`${text.length} characters / ${sentences} sentences; review the change of point`);
    block = [];
  }
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {flush();fence=!fence;return;}
    if (fence) return;
    if (/^#{1,6}\s/.test(line)) {flush(); sources=/^##\s+(Sources|출처)\s*$/i.test(line);return;}
    if (sources) return;
    if (!line.trim() || /^\s*(?:\||[-*+]\s|\d+[.)]\s|>\s|<|!\[|---+$)/.test(line)) {flush();return;}
    if (!block.length) start=i+1;
    block.push(line.trim());
  }); flush();
  const prose = markdown.replace(/^##\s+Sources\s*$[\s\S]*/im,'');
  const colors = [...prose.matchAll(/\[(red|blue|brown):\s*([^\]]*)\]/g)];
  const coloredChars=colors.reduce((n,m)=>n+visible(m[2]).length,0);
  const bodyChars=paragraphs.reduce((n,p)=>n+p.chars,0);
  if (bodyChars>2000 && !colors.length && !/\*\*\S[^\n]*?\*\*|^>\s/m.test(prose)) add('scan-hierarchy','warn',1,'Long article has no selective bold, tone emphasis or callout');
  const colorDenominator=visible(prose.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,'')).length;
  if (coloredChars/Math.max(1,colorDenominator)>.25) add('color-overuse','error',1,'More than 25% of prose characters are colored');
  prose.split(/\r?\n/).forEach((line,i)=> {
    const stripped=line.replace(/\[(red|blue|brown):\s*[^\]]+\]/g,'');
    if (/\[(?:red|blue|brown):/.test(stripped)) add('broken-color','error',i+1,'Unclosed or empty tone marker');
    if (/^\s*\*\*\d+[.)]\s.+\*\*\s*$/.test(line)) add('fake-heading','warn',i+1,'Use a real ### heading for numbered subtopics');
    if (/^\|/.test(line) && line.split('|').some(cell=>visible(cell).length>180)) add('dense-table-cell','warn',i+1,'Table cell exceeds 180 visible characters; move reasoning below the table');
  });
  return {paragraphs:paragraphs.length, maxParagraphChars:Math.max(0,...paragraphs.map(p=>p.chars)), longParagraphs:paragraphs.filter(p=>p.chars>200||p.sentences>2).length, colors:colors.length,coloredRatio:Number((coloredChars/Math.max(1,colorDenominator)).toFixed(4)),findings};
}
function publicMarkdown(root, markdown) {
  const parserPath=path.join(root,'skills/kr-naver-blog-publish/scripts/memo-to-post.js');
  if (!fs.existsSync(parserPath)) return markdown;
  const {EXCLUDED_SECTIONS,normalizeHeading}=require(parserPath);
  let excluded=false, fenced=false;
  return markdown.split(/\r?\n/).map(line=> {
    if (/^\s*(```|~~~)/.test(line)) fenced=!fenced;
    if (!fenced && /^##\s/.test(line)) excluded=EXCLUDED_SECTIONS.has(normalizeHeading(line.replace(/^##\s+/,'')));
    return excluded?'':line;
  }).join('\n');
}
function readWithin(root, relative) {
  const target=fs.realpathSync(path.resolve(root,relative));
  if (!target.startsWith(fs.realpathSync(root)+path.sep)) throw Error(`Article outside repository: ${relative}`);
  return fs.readFileSync(target,'utf8');
}
function fingerprint(root, entry) {
  // Include both sources and public metadata; slug alone cannot transfer a review.
  return hash(JSON.stringify({entry, memo:readWithin(root,entry.memo), article:entry.article?readWithin(root,entry.article):null}));
}
function styleAudit(root) {
  const css=fs.readFileSync(path.join(root,'skills/kr-research-site/templates/layout.html'),'utf8');
  const light=css.match(/:root\s*\{([^}]+)\}/)?.[1] || '';
  const dark=css.match(/@media\s*\(prefers-color-scheme:dark\)\s*\{\s*:root\s*\{([^}]+)\}/)?.[1] || '';
  const luminance = hex => {
    const rgb=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  };
  const failures=[], contrasts=[];
  for(const [mode,block] of [['light',light],['dark',dark]]) {
    const tokens=Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(m=>[m[1],m[2]]));
    for(const tone of ['pos','neg','spec']) for(const background of ['bg','surface']) {
      if(!tokens[tone]||!tokens[background]) {failures.push({rule:'missing-color-token',message:`${mode}: ${tone}/${background}`});continue;}
      const values=[luminance(tokens[tone]),luminance(tokens[background])].sort((a,b)=>a-b);
      const ratio=(values[1]+.05)/(values[0]+.05);
      contrasts.push({mode,tone,background,ratio:Number(ratio.toFixed(2))});
      if(ratio<4.5) failures.push({rule:'tone-contrast',message:`${mode} ${tone}/${background} contrast ${ratio.toFixed(2)} is below 4.5`});
    }
  }
  return {contrasts,blocking:failures};
}
function gate(root) {
  const entries=JSON.parse(fs.readFileSync(path.join(root,'site/published.json'),'utf8')).articles;
  const recordPath=path.join(root,'site/readability-reviews.json');
  const records=fs.existsSync(recordPath)?JSON.parse(fs.readFileSync(recordPath,'utf8')):{reviews:{},legacy:{}};
  const articles=entries.map(entry=> {
    const contentHash=fingerprint(root,entry), result=audit(publicMarkdown(root,readWithin(root,entry.article||entry.memo)));
    const review=records.reviews?.[entry.slug];
    const valid=review?.hash===contentHash && ['source-and-renderer','browser'].includes(review.mode) && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewedOn||'') && Boolean(review.notes?.trim());
    const legacy=!valid && records.legacy?.[entry.slug]===contentHash;
    const blocking=[];
    if (!valid&&!legacy) blocking.push({rule:'review-required',message:'New/changed article needs a content-matched editorial review'});
    if (!legacy) blocking.push(...result.findings.filter(f=>f.severity==='error'));
    return {slug:entry.slug,file:entry.article||entry.memo,hash:contentHash,status:valid?'reviewed':legacy?'legacy-unreviewed':'review-required',reviewMode:valid?review.mode:null,...result,blocking};
  });
  const styles=styleAudit(root);
  return {passed:!styles.blocking.length && articles.every(a=>!a.blocking.length), styles, articles, summary:{articles:articles.length,reviewed:articles.filter(a=>a.status==='reviewed').length,legacyUnreviewed:articles.filter(a=>a.status==='legacy-unreviewed').length,blocking:styles.blocking.length+articles.reduce((n,a)=>n+a.blocking.length,0),warnings:articles.reduce((n,a)=>n+a.findings.filter(f=>f.severity==='warn').length,0)}};
}
function main(args) {
  const value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  const root=path.resolve(value('--root')||process.cwd());
  let result;
  if (value('--memo')) {result=audit(publicMarkdown(root,readWithin(root,value('--memo'))));console.log(JSON.stringify(result,null,2));process.exitCode=result.findings.some(f=>f.severity==='error')?1:0;return;}
  if (value('--record')) {
    const slug=value('--record'),mode=value('--mode'),notes=value('--notes');
    if (!['source-and-renderer','browser'].includes(mode)||!notes?.trim()) throw Error('Recording requires --mode source-and-renderer|browser and truthful --notes');
    const entry=JSON.parse(fs.readFileSync(path.join(root,'site/published.json'),'utf8')).articles.find(e=>e.slug===slug);
    if (!entry) throw Error(`Unknown published slug: ${slug}`);
    const auditResult=audit(publicMarkdown(root,readWithin(root,entry.article||entry.memo)));
    if (auditResult.findings.some(f=>f.severity==='error')) throw Error('Resolve serious readability findings before recording');
    const recordPath=path.join(root,'site/readability-reviews.json');
    const records=fs.existsSync(recordPath)?JSON.parse(fs.readFileSync(recordPath,'utf8')):{version:1,legacy:{},reviews:{}};
    records.reviews[slug]={hash:fingerprint(root,entry),reviewedOn:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),mode,notes};
    delete records.legacy[slug];fs.writeFileSync(recordPath,JSON.stringify(records,null,2)+'\n');
    console.log(`Recorded ${mode} review: ${slug}`);return;
  }
  result=gate(root);
  if (value('--report')) {const file=path.resolve(root,value('--report'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');}
  console.log(`Readability: ${JSON.stringify(result.summary)}`);
  for (const f of result.styles.blocking) console.error(`${f.rule}: ${f.message}`);
  for (const article of result.articles) for (const f of article.blocking) console.error(`${article.file}:${f.line||1} ${f.rule}: ${f.message}`);
  if (result.summary.legacyUnreviewed) console.log('Legacy articles were scanned but remain unreviewed; their existing findings are debt, not passes. See the JSON report.');
  process.exitCode=result.passed?0:1;
}
module.exports={audit,visible,fingerprint,publicMarkdown,styleAudit,gate};
if(require.main===module) {try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
