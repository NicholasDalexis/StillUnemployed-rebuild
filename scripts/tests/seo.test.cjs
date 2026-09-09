const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const modulePromise=import('../gen-seo.mjs');
const html='<html><head><title>Before</title><meta name="description" content="Before"><link rel="canonical" href="https://wrong.example/"><meta name="robots" content="index"><meta property="og:image" content="https://preview.example/theme.png"></head><body><a href="/jobs.html">Jobs</a></body></html>';

test('production canonicals consolidate aliases and preserve themed social content',async()=>{
 const seo=await modulePromise;
 for(const [name,canonical] of [['index.html','/'],['jobs.html','/jobs'],['jobs/casino/index.html','/jobs'],['internships.html','/internships'],['about.html','/about']]){
  const output=seo.htmlMetadata(html,name,true);
  assert.equal((output.match(/rel="canonical"/g)||[]).length,1);
  assert(output.includes('href="https://stillunemployed.com'+canonical+'"'));
  assert(output.includes('https://preview.example/theme.png'));
  assert.doesNotMatch(output,/wrong\.example|JobPosting|AggregateRating|datePosted|validThrough/);
  assert.match(output,/content="index, follow, max-image-preview:large"/);
  assert.equal(seo.htmlMetadata(output,name,true),output,'finalization must be repeatable');
 }
});

test('preview, account, public-by-link guide and legacy shares receive noindex',async()=>{
 const seo=await modulePromise;
 for(const name of ['index.html','jobs.html','jobs/casino/index.html','internships.html','about.html','versions.html','j/original/abc123.html'])assert.match(seo.htmlMetadata(html,name,false),/name="robots" content="noindex, nofollow"/);
 for(const name of ['tracker.html','analytics.html','suggest.html','style-guide.html','404.html','j/chess/abc123.html'])assert.match(seo.htmlMetadata(html,name,true),/name="robots" content="noindex, nofollow"/);
 const redirects='<html><head><title>Share</title><meta http-equiv="refresh" content="0;url=/jobs.html?job=abc&amp;theme=chess"></head><body><script>location.replace("/jobs.html?job=abc&theme=chess")</script></body></html>';
 assert(seo.htmlMetadata(redirects,'j/chess/abc123.html',true).includes('location.replace("/jobs.html?job=abc&theme=chess")'));
});

test('sitemap only includes available canonical public pages, without fabricated dates or jobs',async()=>{
 const seo=await modulePromise;
 const available=new Set(['index.html','jobs.html','about.html','tracker.html','style-guide.html','j']);
 const xml=seo.sitemap(true,available);
 assert.equal((xml.match(/<loc>/g)||[]).length,3);
 assert.doesNotMatch(xml,/lastmod|tracker|style-guide|\/j\/|preview/);
 assert(!seo.sitemap(false,available).includes('<loc>'));
 const robots=seo.robots(true);
 assert.match(robots,/User-agent: OAI-SearchBot\nAllow: \//);
 assert.match(robots,/User-agent: Claude-SearchBot\nAllow: \//);
 assert.match(robots,/Sitemap: https:\/\/stillunemployed.com\/sitemap.xml/);
 assert.doesNotMatch(seo.robots(false),/Disallow: \/\n|Sitemap:|noindex:/);
});

test('artifact finalization preserves source, custom headers and explicit publication boundaries',async()=>{
 const {prepare}=await import('../prepare-publish.mjs'),seo=await modulePromise;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'su-seo-'));
 try{
  for(const name of ['index.html','jobs.html','about.html','tracker.html','style-guide.html'])fs.writeFileSync(path.join(root,name),html);
  for(const name of ['jobs-data.json','internships-data.json'])fs.writeFileSync(path.join(root,name),'SYNTHETIC_PRIVATE_SNAPSHOT');
  fs.writeFileSync(path.join(root,'_headers'),'/assets/*\n  X-Test: preserved\n');
  const dist=prepare(root);
  const result=seo.finalizeSEO(dist,{CONTEXT:'branch-deploy',URL:'https://wrong.example',DEPLOY_PRIME_URL:'https://wrong.example'});
  assert.equal(result.pages,5);assert.equal(result.production,false);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),html);
  const header=fs.readFileSync(path.join(dist,'_headers'),'utf8');
  assert.match(header,/X-Test: preserved/);assert.match(header,/\/\*\n  X-Robots-Tag: noindex, nofollow/);
  assert.equal(seo.headers(header,false),header);
  assert(!fs.existsSync(path.join(dist,'jobs-data.json')));assert(!fs.existsSync(path.join(dist,'internships-data.json')));
  assert(fs.existsSync(path.join(dist,'about.html')));
  assert.doesNotMatch(fs.readFileSync(path.join(dist,'index.html'),'utf8'),/wrong\.example/);
  seo.finalizeSEO(dist,{CONTEXT:'production'});
  const productionHeaders=fs.readFileSync(path.join(dist,'_headers'),'utf8');
  assert(!productionHeaders.includes('\n/*\n  X-Robots-Tag'));
  assert.match(productionHeaders,/\/style-guide\.html\n  X-Robots-Tag: noindex/);
  assert.match(fs.readFileSync(path.join(dist,'index.html'),'utf8'),/name="robots" content="index, follow/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('incomplete page metadata fails the build instead of silently leaving an unreviewed head',async()=>{
 const seo=await modulePromise;
 assert.throws(()=>seo.htmlMetadata('<p>Not a full document</p>','jobs.html',false),/complete HTML head/);
});
