const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'../..');
const slugs=['casino','girlies','mermaid','bratt','blackcat','beauty','chess'];
const source=fs.readFileSync(path.join(root,'jobs.html'),'utf8');
const links=html=>[...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1/gi)].map(m=>m[2]);

function generate(board,check){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-theme-navigation-'));
 try{
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.copyFileSync(path.join(root,'scripts/gen-theme-pages.mjs'),path.join(dir,'scripts/gen-theme-pages.mjs'));
  for(const name of ['jobs.html','index.html','tracker.html'])fs.writeFileSync(path.join(dir,name),board);
  const result=spawnSync(process.execPath,[path.join(dir,'scripts/gen-theme-pages.mjs')],{
   encoding:'utf8',env:{...process.env,CONTEXT:'branch-deploy',URL:'https://stillunemployed.com',DEPLOY_PRIME_URL:'https://preview--stillunemployed.netlify.app'}
  });
  assert.equal(result.status,0,result.stderr);
  for(const slug of slugs)check(fs.readFileSync(path.join(dir,'jobs',slug,'index.html'),'utf8'),slug);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

// Netlify resolves relative links against the generated file before making
// index.html pretty. That pass does not honor the HTML base element. This
// reproduces the hosted footer bug; it is not a browser-layout simulation.
function hostedDestination(href,slug){
 const url=new URL(href,`https://preview--stillunemployed.netlify.app/jobs/${slug}/index.html`);
 url.pathname=url.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'');
 return url.pathname+url.search+url.hash;
}
function expectedDestination(href){
 const url=new URL(href,'https://preview--stillunemployed.netlify.app/');
 url.pathname=url.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'');
 return url.pathname+url.search+url.hash;
}

test('all seven generated themes keep every current static navigation destination after pretty-URL rewriting',()=>{
 const original=links(source);
 generate(source,(html,slug)=>{
  const actual=links(html);
  assert.equal(actual.length,original.length);
  for(let i=0;i<original.length;i++){
   const href=original[i];
   if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(href))continue;
   assert.equal(hostedDestination(actual[i],slug),expectedDestination(href),`${slug}: ${href}`);
  }
  assert.match(html,/<base href="\/">/);
  assert.match(html,/<script src="js\/app\.js\?v=/);
  assert.match(html,/<link rel="stylesheet" href="css\/styles\.css\?v=/);
  assert.match(html,new RegExp(`https://preview--stillunemployed.netlify.app/assets/og/${slug}\\.png`));
 });
});

test('generated navigation preserves queries, fragments and external links for future footer and tracker entries',()=>{
 const extra=`<nav><a href='./tracker.html?tab=saved&amp;from=board#notes'>Tracker</a><a href="about.html#sources">About</a><a href="./privacy.html">Privacy</a><a href="./terms.html">Terms</a><a href="./suggest.html">Suggest</a><a href="/versions.html#version-2-3-7">Version</a><a href="https://example.com/index.html?theme=other#top">External</a><a href="mailto:test@example.com">Email</a><a href="#board">Section</a><a href="?theme=original">Query</a></nav>`;
 const originals=links(extra);
 generate(source.replace('</body>',extra+'</body>'),(html,slug)=>{
  const actual=links(html).slice(-originals.length);
  for(let i=0;i<originals.length;i++){
   const href=originals[i];
   if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(href))assert.equal(actual[i],href);
   else assert.equal(hostedDestination(actual[i],slug),expectedDestination(href),`${slug}: ${href}`);
  }
  assert.equal(actual[0],'/tracker.html?tab=saved&amp;from=board#notes');
 });
});
