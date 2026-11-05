const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync}=require('node:child_process');
const {audit,digestAudit,fingerprint,publicMarkdown,styleAudit,gate}=require('./review');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'article-review-'));
function write(file,text){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
try {
 const tokens='--bg:#ffffff;--surface:#f6f6f4;--pos:#b00020;--neg:#164c96;--spec:#79500a;';
 const template=`:root{${tokens}} @media (prefers-color-scheme:dark){:root{${tokens}}}`;
 write('skills/kr-research-site/templates/layout.html',template);
 assert(!styleAudit(root).blocking.length);
 write('skills/kr-research-site/templates/layout.html',template.replace('--pos:#b00020','--pos:#eeeeee'));
 assert(styleAudit(root).blocking.some(f=>f.rule==='tone-contrast'),'low contrast blocks deployment');
 write('skills/kr-research-site/templates/layout.html',template);
 assert(audit('가'.repeat(351)).findings.some(f=>f.rule==='long-paragraph'));
 assert(!audit('- [brown: 짧은 판단] 나머지 항목의 긴 설명이다. 더 자세한 배경이다. 추가적인 조건과 불확실성이 이 목록에 포함된다.').findings.some(f=>f.rule==='color-overuse'),'list text belongs in highlight-density denominator');
 assert(!audit('짧은 문장이다. 두 번째 문장이다. [기관 2026-11-05 PDF](https://example.com)').findings.length,'citation label is not an extra sentence');
 assert(audit('[blue: 미완성').findings.some(f=>f.rule==='broken-color'));
 assert(audit('[brown: '+ '가'.repeat(100)+'] 다른 본문.').findings.some(f=>f.rule==='color-overuse'));
 assert(!audit('```\n'+ '가'.repeat(400)+'\n```\n\n## Sources\n\n'+ '나'.repeat(400)).findings.length,'code and bibliography are not prose');
 // The copied share digest needs a conclusion-first lead, a real answer and one table.
 const rules=text=>digestAudit(text).map(f=>f.rule);
 const table='\n\n| 지표 | 값 |\n| --- | --- |\n| 매출 | 100 |\n';
 const answer='매출은 늘었지만 현금은 줄었고, 이 차이는 운전자본 증가에서 나왔다. 다음 분기에 재고가 줄어드는지 확인한다.';
 assert.deepEqual(rules(`## Summary\n\n${answer}${table}`),[]);
 assert.deepEqual(rules(`## Summary\n\n**결론.**\n\n${answer}${table}`),[],'a bold lead counts the paragraph after it');
 assert.deepEqual(rules(`## Summary\n\n짧은 결론이다.${table}`),['digest-short-answer']);
 assert.deepEqual(rules(`## 자료 범위\n\n**작성 기준일: 2026-07-11** (갱신)\n\n${answer}${table}`),['digest-lead'],'metadata is not a conclusion');
 assert.deepEqual(rules(`## Summary\n${table}\n${answer}`),['digest-lead']);
 assert.deepEqual(rules(`## 배경\n\n${answer}\n\n## Summary\n\n${answer}`),['digest-key-table'],'the builder prefers ## Summary');
 assert.deepEqual(digestAudit(`## Summary\n\n${answer}`,{analysisData:'a.json'}),[],'earnings reviews copy the comparison table');
 assert(audit('**굵게 시작한 문단.\n\n다음 문단에서 닫는다.**').findings.some(f=>f.rule==='broken-bold'));
 assert(!audit('**닫힌 굵게** 문단.').findings.some(f=>f.rule==='broken-bold'));
 write('skills/kr-naver-blog-publish/scripts/memo-to-post.js',`module.exports={EXCLUDED_SECTIONS:new Set(['private']),normalizeHeading:s=>s.toLowerCase()};`);
 assert(!audit(publicMarkdown(root,'## Private\n\n'+'가'.repeat(500)+'\n\n## Summary\n\n짧은 설명.')).findings.length,'ignore the same private sections as the renderer');
 const entry={slug:'sector/test',memo:'analysis-example/test/memo.md',article:'analysis-example/test/article.md',headline:'검토 대상'};
 const md='# 제목\n\n- 기준일: 2026-11-05\n\n## 핵심\n\n**확인된 결론.** 매출은 늘었지만 현금은 줄었고, 이 차이는 운전자본 증가에서 나왔다. 다음 분기에 재고가 줄어드는지 확인한다.\n\n| 지표 | 값 |\n| --- | --- |\n| 매출 | 100 |\n';
 write(entry.memo,md);write(entry.article,md);write('site/published.json',JSON.stringify({articles:[entry]}));
 assert(!gate(root).passed,'unreviewed new article blocks deployment');
 write('site/readability-reviews.json',JSON.stringify({legacy:{[entry.slug]:fingerprint(root,entry)},reviews:{}}));
 assert(gate(root).passed);assert.equal(gate(root).articles[0].status,'legacy-unreviewed');
 write(entry.article,md+'\n수정된 문장.\n');assert(!gate(root).passed,'changed editorial source invalidates legacy snapshot');
 write('site/readability-reviews.json',JSON.stringify({legacy:{},reviews:{[entry.slug]:{hash:fingerprint(root,entry),reviewedOn:'2026-11-05',mode:'source-and-renderer',notes:'Source reviewed, browser unavailable.'}}}));
 assert(gate(root).passed,'truthful static review is distinguishable from browser QA');
 write(entry.memo,md+'\n연구 메모도 변경.\n');assert(!gate(root).passed,'underlying memo invalidates review');
 write(entry.memo,md);entry.headline='바뀐 공개 제목';write('site/published.json',JSON.stringify({articles:[entry]}));assert(!gate(root).passed,'public metadata invalidates review');
 write(entry.article,'가'.repeat(351));write('site/readability-reviews.json',JSON.stringify({reviews:{[entry.slug]:{hash:fingerprint(root,entry),reviewedOn:'2026-11-05',mode:'browser',notes:'Claimed review'}}}));assert(!gate(root).passed,'matching review cannot mask a serious finding');
 // Exercise npm lifecycle itself: an unreviewed article must never reach the upload command.
 write(entry.article,md);
 write('site/readability-reviews.json',JSON.stringify({reviews:{},legacy:{}}));
 const runner=`const {gate}=require(${JSON.stringify(path.join(__dirname,'review.js'))});process.exitCode=gate(process.cwd()).passed?0:1;`;
 write('gate.cjs',runner);
 const realScripts=JSON.parse(fs.readFileSync(path.join(process.cwd(),'package.json'),'utf8')).scripts;
 const scripts={'check:readability':'node gate.cjs'};
 for(const kind of ['preview','site','pages']) {if(realScripts['predeploy:'+kind]) scripts['predeploy:'+kind]=realScripts['predeploy:'+kind];scripts['deploy:'+kind]="node -e \"require('fs').writeFileSync('upload-reached','yes')\"";}
 write('package.json',JSON.stringify({private:true,scripts}));
 for(const kind of ['preview','site','pages']) {
   const run=spawnSync('npm',['run','deploy:'+kind],{cwd:root,encoding:'utf8'});
   assert.notEqual(run.status,0,`${kind} stops at review gate`);
   assert(!fs.existsSync(path.join(root,'upload-reached')),`${kind} must not reach upload`);
 }
 write('site/readability-reviews.json',JSON.stringify({reviews:{[entry.slug]:{hash:fingerprint(root,entry),reviewedOn:'2026-11-05',mode:'source-and-renderer',notes:'Reviewed fixture'}}}));
 const accepted=spawnSync('npm',['run','deploy:preview'],{cwd:root,encoding:'utf8'});
 assert.equal(accepted.status,0,accepted.stderr);
 assert(fs.existsSync(path.join(root,'upload-reached')),'a valid review lets deployment proceed');
 console.log('Readability tests passed: share-digest lead/answer/table rules, broken bold, content/metadata invalidation, legacy debt, source vs browser modes, serious findings and parsing.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
