const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

const root=path.join(__dirname,'../..');
const fontCSS=fs.readFileSync(path.join(root,'css/fonts.css'),'utf8');

for(const page of ['jobs.html','internships.html']) {
  const html=fs.readFileSync(path.join(root,page),'utf8');
  test(page+': script-enabled loading never shows an alternate heading, nav or skeleton catalog',()=>{
    const initial=html.slice(html.indexOf('<body>'),html.indexOf('<div id="su-runtime-error"'));
    const enabled=initial.replace(/<noscript>[\s\S]*?<\/noscript>/g,'');
    assert.match(enabled,/id="board"/);
    assert.doesNotMatch(enabled,/<h1\b|<nav\b|su-skeleton|su-loading-shell|Loading the board/);
    const fallback=initial.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
    assert(fallback,'disabled JavaScript has useful navigation and an explanation');
    assert.match(fallback,/Turn on JavaScript to check current availability/);
    for(const route of ['/jobs.html','/internships.html','/tracker.html','/about.html'])assert(fallback.includes('href="'+route+'"'));
  });
  test(page+': early font preloads use the actual four local Latin board faces',()=>{
    const links=Array.from(html.matchAll(/<link\s+[^>]*rel="preload"[^>]*>/g),m=>m[0]);
    const families=new Set();
    assert.equal(links.length,4);
    for(const link of links) {
      assert.match(link,/as="font"/);assert.match(link,/type="font\/woff2"/);assert.match(link,/\bcrossorigin\b/);
      const href=link.match(/href="([^"]+)"/)[1];assert.match(href,/^assets\/[\w-]+\.woff2$/);
      assert.equal(fs.readFileSync(path.join(root,href)).subarray(0,4).toString(),'wOF2');
      const face=fontCSS.match(/@font-face\s*\{[^}]+\}/g).find(block=>block.includes('../'+href)&&block.includes('U+0000-00FF'));
      assert(face,'preload must be the Latin face actually used by the stylesheet');
      families.add(face.match(/font-family:\s*'([^']+)'/)[1]);
      assert(html.indexOf(link)<html.indexOf('href="css/brand.css'),'discovered before stylesheet dependencies');
    }
    assert.deepEqual([...families].sort(),['Archivo','Archivo Black','Indie Flower','Poppins']);
  });
}

// Exercise the actual boot/renderer against the shared offline DOM adapter.
// The adapter checks state and node identity; native painting remains browser QA.
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const firstTest=fixtureSource.indexOf('\ntest(');assert(firstTest>0);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const internshipData=JSON.parse(fs.readFileSync(path.join(root,'internships-data.json'),'utf8'));
internshipData.jobs=internshipData.jobs.slice(0,1);
for(const route of ['/jobs.html','/internships.html']) {
  const prefix=fixtureSource.slice(0,firstTest).replace("pathname:'/jobs.html'",'pathname:'+JSON.stringify(route));
  const fixture={exports:{}};
  vm.runInNewContext(prefix+'\nmodule.exports={board,row,csv};',{module:fixture,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
  const {board,row,csv}=fixture.exports;
  function pending(options={}) {
    let finish;
    const payload=route==='/jobs.html'?csv([row()]):internshipData;
    const response={ok:true,text:()=>new Promise(resolve=>{finish=resolve;}),json:()=>new Promise(resolve=>{finish=resolve;})};
    const b=board({...options,response});
    b.window.SUInternships=require('../../js/internships.js');
    return {b,finish:()=>finish(payload)};
  }
  test(route+': initial chrome is real, quiet and usable while the fresh catalog is pending',async()=>{
    const p=pending({look:'poker'}),b=p.b;await b.boot();
    assert.equal(b.app._loading,true);assert.equal(b.app.internships,route==='/internships.html');
    const nav=b.grid.querySelector('.su-main-nav'),heading=b.grid.querySelector('h1'),search=b.document.getElementById('su-search');
    assert(nav);assert(heading);assert(search);assert.match(b.grid.className,/poker/);
    assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);assert.equal(b.grid.querySelector('.su-results-count').textContent,'');
    assert.doesNotMatch(b.grid.textContent,/could not load|check back soon|notebook is getting ready|no saved roles yet/);
    assert.notEqual(b.document.getElementById('su-feed-progress').getAttribute('hidden'),null);
    search.focus();const writes=b.grid.writes;b.runTimers(599);assert.equal(b.grid.writes,writes);
    b.runTimers(600);assert.equal(b.document.getElementById('su-feed-progress').hidden,false);
    assert.equal(b.grid.writes,writes,'slow-load status cannot replace navigation or focused inputs');
    assert.equal(b.grid.querySelector('.su-main-nav'),nav);assert.equal(b.document.activeElement,search);
    const headingHTML=heading.innerHTML;
    p.finish();await tick();await tick();
    assert.equal(b.app._loading,false);assert.equal(b.app.jobs.length,1);assert.equal(b.grid.querySelector('h1').innerHTML,headingHTML);
    assert.notEqual(b.document.getElementById('su-feed-progress').getAttribute('hidden'),null);
  });
  test(route+': controls bind once, loading protects saved links, and the intro is attempted before the feed arrives',async()=>{
    const p=pending({saved:{'https://example.com/previous':true}}),b=p.b;let automatic=0;
    b.window.SUWelcome={maybeShow(){automatic++;},open(){}};
    await b.boot();assert.equal(automatic,1,'the first shell attempts the once-per-announcement intro');
    b.grid.querySelector('[data-act="toggleSavedOnly"]').click();assert.equal(b.app.state.savedOnly,true);
    assert.equal(b.grid.querySelector('.su-unlisted-saved'),null);
    const attemptsBeforeTimer=automatic;b.runTimers(600);assert.equal(automatic,attemptsBeforeTimer,'no delayed intro timer is scheduled by the loading shell');
    p.finish();await tick();await tick();
    assert(b.grid.querySelector('.note[data-link="https://example.com/previous"]'));assert(automatic>0);
    b.grid.querySelector('[data-act="toggleSavedOnly"]').click();
    assert.equal(b.app.state.savedOnly,false,'boot and init must not attach a second toggling handler');
    b.runTimers(600);assert.notEqual(b.document.getElementById('su-feed-progress').getAttribute('hidden'),null,'a settled request cancels its delayed message');
  });
  test(route+': restored search is available immediately and new typing wins when the feed arrives',async()=>{
    const p=pending(),b=p.b;let reads=0;
    b.window.SUBoardRuntime={checkOwner:()=>false,read(){reads++;return {state:{q:'previous search',cat:'all',ws:'Any',pr:'Any',st:'all',fr:'Any',savedOnly:false},y:200};},request:(_kind,load)=>load(),save(){}};
    await b.boot();assert.equal(b.document.getElementById('su-search').value,'previous search');
    const search=b.document.getElementById('su-search');search.focus();search.value='my next search';b.fire('input',search);b.runTimers(140);
    assert.equal(b.app.state.q,'my next search');p.finish();await tick();await tick();
    assert.equal(b.app.state.q,'my next search');assert.equal(b.document.getElementById('su-search').value,'my next search');
    assert.equal(reads,1,'the first response cannot restore an older view over an active choice');
  });
  test(route+': a failed first request reveals retry without publishing cached cards',async()=>{
    const b=board({fetchError:Error('offline'),saved:{'https://example.com/previous':true}});
    b.window.SUInternships=require('../../js/internships.js');await b.boot();
    assert.equal(b.app._loading,false);assert.equal(b.app._loadError,true);assert.equal(b.app.jobs.length,0);
    assert(b.grid.querySelector('[data-act="retryJobs"]'));assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
    b.runTimers(600);assert.notEqual(b.document.getElementById('su-feed-progress').getAttribute('hidden'),null);
  });
}
