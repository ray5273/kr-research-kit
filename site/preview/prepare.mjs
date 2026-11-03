import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {previewHtml} from './transform.mjs';
const require=createRequire(import.meta.url);
const {buildSite}=require('../../skills/kr-research-site/scripts/build-site.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const config=JSON.parse(fs.readFileSync(path.join(root,'site/site.config.json'),'utf8'));
config.adsense={client:'',slots:{}};
const outDir=path.join(root,'site-dist');
buildSite({root,config,published:JSON.parse(fs.readFileSync(path.join(root,'site/published.json'),'utf8')),pagesDir:path.join(root,'site/pages'),outDir});
fs.writeFileSync(path.join(outDir,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n');
fs.writeFileSync(path.join(outDir,'robots.txt'),'User-agent: *\nDisallow: /\n');
// Preview assets stay independent of the production Worker and its database.
for (const file of fs.readdirSync(outDir,{recursive:true}).filter(file=>file.endsWith('.html'))) {
 const target=path.join(outDir,file);
 const html=previewHtml(fs.readFileSync(target,'utf8'));
 fs.writeFileSync(target,html);
}
// No D1 here: serve a fixed sample ranking so the popular box can be reviewed (labelled as a sample by previewHtml).
const published=JSON.parse(fs.readFileSync(path.join(root,'site/published.json'),'utf8')).articles.map(a=>({path:`/${a.slug}/`,earnings:a.articleType==='earnings-review'}));
fs.mkdirSync(path.join(outDir,'api'),{recursive:true});
fs.writeFileSync(path.join(outDir,'api/popular.json'),JSON.stringify({week:published.filter(a=>a.earnings).slice(0,5).map(({path})=>({path})),all:published.filter(a=>!a.earnings).slice(0,5).map(({path})=>({path}))}));
fs.writeFileSync(path.join(outDir,'_redirects'),'/api/popular /api/popular.json 200\n');
fs.copyFileSync(path.join(root,'site/preview/preview-client.js'),path.join(outDir,'preview-client.js'));
console.log(`Static preview ready: ${outDir}`);
