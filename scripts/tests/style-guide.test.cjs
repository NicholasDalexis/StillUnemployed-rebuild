const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const catalog=require('../../js/style-guide-themes.js');
const guide=require('../../js/style-guide.js');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'style-guide.html'),'utf8');
const fixturePath=path.join(__dirname,'board-qa.test.cjs'), fixture=fs.readFileSync(fixturePath,'utf8');
const fixtureModule={exports:{}};
vm.runInNewContext(fixture.slice(0,fixture.indexOf('\ntest('))+'\nmodule.exports={board,job};',{
 require:createRequire(fixturePath),module:fixtureModule,__dirname,Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board,job}=fixtureModule.exports;

function page({search='',stored='original',blocked=false}={}) {
 const b=board(),document=b.document;
 document.body.innerHTML=html.slice(html.indexOf('<body>')+6,html.indexOf('</body>'));
 const writes=[], data=new Map([['su_look','poker'],['su_saved_jobs','{"keep":true}'],['su_tracker','[{"url":"keep"}]'],[guide.key,stored]]);
 const localStorage={getItem(key){if(blocked)throw Error('blocked');return data.get(key)??null;},setItem(key,value){if(blocked)throw Error('blocked');writes.push([key,value]);data.set(key,value);}};
 const listeners={};
 const win={localStorage,location:new URL('https://example.com/style-guide.html'+search),history:{replaceState(_s,_t,url){win.location=new URL(url,win.location);}},addEventListener(name,fn){listeners[name]=fn;}};
 const dispatch=(el,name,extra={})=>{const event={target:el,preventDefault(){this.defaultPrevented=true;},...extra};for(const listener of el.listeners[name]||[])listener(event);return event;};
 const dialog=document.getElementById('guide-theme-dialog');dialog.open=false;
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dispatch(dialog,'close');};
 dialog.getBoundingClientRect=()=>({left:20,right:620,top:20,bottom:620});
 const control=guide.mount(win,document,catalog);
 return {document,win,dialog,control,data,writes,dispatch,listeners,el:id=>document.getElementById(id)};
}

function sourceFixture() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-style-guide-'));
 for(const name of ['js/app.js','css/styles.css','css/brand.css','css/fonts.css','jobs.html','scripts/gen-theme-pages.mjs','js/style-guide-themes.js']){
  const dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest);
 }
 return dir;
}

test('catalog is current, immutable and covers every actual public picker/route',async()=>{
 const {generate}=await import('../gen-style-guide.mjs');assert.doesNotThrow(()=>generate(root));
 assert.equal(catalog.themes.length,8);assert(!catalog.themes.some(theme=>theme.look==='cod'));
 assert(Object.isFrozen(catalog.themes[0].bands.high));
 for(const [alias,look] of Object.entries(catalog.aliases))assert.equal(guide.findTheme(catalog,alias).look,look);
 for(const value of ['__proto__','constructor','cod','<script>','CASINO',''])assert.equal(guide.findTheme(catalog,value),null);
});

test('changed palettes, canvas, font faces and source picker labels cannot pass a stale catalog check',async()=>{
 const {generate}=await import('../gen-style-guide.mjs');
 for(const [name,from,to,reason] of [
  ['js/app.js',"navBg:'#D4AF37'","navBg:'#D4AF38'",'palette'],
  ['css/styles.css','#4F0F1C','#4F0F1D','canvas'],
  ['css/fonts.css','font-weight: 400;','font-weight: 450;','font'],
  ['js/app.js','>Casino</div>','>Casino Royale</div>','picker label']
 ]){
  const dir=sourceFixture();try{const target=path.join(dir,name),before=fs.readFileSync(target,'utf8');assert(before.includes(from),reason+' fixture target');fs.writeFileSync(target,before.replace(from,to));assert.throws(()=>generate(dir),undefined,reason+' drift must fail');if(reason!=='picker label'){generate(dir,true);assert.doesNotThrow(()=>generate(dir));}}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('reactivated dormant and newly enabled themes fail until guide coverage agrees',async()=>{
 const {buildCatalog}=await import('../gen-style-guide.mjs');
 for(const [file,from,to] of [
  ['js/app.js',"look !== 'girly'","look !== 'cod' && look !== 'girly'"],
  ['js/app.js',"v === 'girly'","v === 'cod' || v === 'girly'"],
  ['jobs.html','var VALID = {','var VALID = {newlook:1,']
 ]){const dir=sourceFixture();try{const target=path.join(dir,file),before=fs.readFileSync(target,'utf8');assert(before.includes(from));fs.writeFileSync(target,before.replace(from,to));assert.throws(()=>buildCatalog(dir),/coverage|public/i);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
});

test('guide specimens reference real available font faces and preserve normal versus italic weights',()=>{
 const expected={
  'Archivo':{normal:[400,500,600,700,800,900]},'Archivo Black':{normal:[400]},'Indie Flower':{normal:[400]},
  'Poppins':{normal:[300,400,500,600,700]},'Playfair Display':{normal:[700,900],italic:[700,800,900]},'Newsreader':{italic:[400,500]}
 };
 for(const [family,styles]of Object.entries(expected))for(const [style,weights]of Object.entries(styles))for(const weight of weights)assert(catalog.fontFaces.some(face=>face.family===family&&face.style===style&&face.weight===weight),`${family} ${style} ${weight} is actually loaded`);
 assert(!catalog.fontFaces.some(face=>face.family==='Indie Flower'&&face.weight===700));
 const css=fs.readFileSync(path.join(root,'css/style-guide.css'),'utf8');
 assert.match(css,/\.type-playfair\s*\{\s*font:italic 800/);assert.match(css,/\.type-newsreader\s*\{\s*font:italic 400/);
});

const tokens=Object.fromEntries([...fs.readFileSync(path.join(root,'css/brand.css'),'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const resolveToken=value=>value.replace(/var\((--[\w-]+)\)/g,(_,key)=>tokens[key]);
for(const theme of catalog.themes)test(theme.label+' guide salary specimens match the actual board renderer in all three bands',()=>{
 const b=board({look:theme.look}), bands=['low','mid','high'];
 const jobs=bands.map((tier,i)=>job({link:'https://example.com/'+tier,pay:['$70–79K','$80–99K','$90–110K'][i]}));b.init(jobs);
 const p=page({search:'?theme='+theme.slug});
 for(const [i,tier]of bands.entries()){
  const card=b.grid.querySelectorAll('.note[data-link]').find(el=>el.getAttribute('data-link')===jobs[i].link), specimen=p.document.querySelector('[data-salary-band="'+tier+'"]');
  assert(card);assert.equal(b.app.payTier(jobs[i].pay),tier);
  assert.equal(specimen.style.background,resolveToken(card.style.background));assert.equal(specimen.style.color,resolveToken(card.style.color));
  assert.equal(specimen.querySelector('[data-theme-apply]').style.color,resolveToken(card.querySelector('[data-act="apply"]').style.color));
  const realStamp=card.querySelectorAll('div').find(el=>/^Human[- ]verified$/i.test(el.textContent.trim()));
  const sampleStamp=specimen.querySelector('[data-theme-stamp]').children[0];assert(realStamp);assert(sampleStamp);
  assert.equal(sampleStamp.style.color,resolveToken(realStamp.style.color));assert.equal(sampleStamp.style.fontFamily,realStamp.style.fontFamily);assert.equal(sampleStamp.style.borderRadius,realStamp.style.borderRadius);
  assert.match(sampleStamp.textContent,/Example stamp/i);
 }
 assert.equal(p.el('guide-canvas').style['background-color'],theme.canvas['background-color']);
 assert(p.el('theme-swatches').textContent.includes(theme.palette.navBg));
});

test('theme selection updates source values, URL, board link and only the guide storage key across all looks',()=>{
 const p=page();for(const theme of catalog.themes){p.dispatch(p.el('theme-trigger'),'click');const option=p.document.querySelector('[data-guide-choice="'+theme.slug+'"]');p.dispatch(option,'click');
  assert.equal(p.control.current().slug,theme.slug);assert.equal(p.win.location.search,'?theme='+theme.slug);assert.equal(p.data.get(guide.key),theme.slug);assert.equal(option.getAttribute('aria-pressed'),'true');
  assert.equal(p.el('theme-eyebrow').textContent,theme.label+' look');assert(p.el('theme-salary-note').textContent.length>20);assert.equal(p.document.querySelector('[data-theme-board-link]').getAttribute('href'),guide.boardRoute(theme));assert.equal(p.dialog.open,false);
 }
 assert(p.writes.every(([key])=>key===guide.key));assert.equal(p.data.get('su_look'),'poker');assert.equal(p.data.get('su_saved_jobs'),'{"keep":true}');assert.equal(p.data.get('su_tracker'),'[{"url":"keep"}]');
});

test('bookmarked theme wins over stored theme; reloads, blocked storage and invalid URL input remain usable',()=>{
 assert.equal(page({search:'?theme=mermaidcore',stored:'blackcat'}).control.current().slug,'mermaid');
 assert.equal(page({stored:'casino'}).control.current().slug,'casino');
 assert.equal(page({search:'?theme=__proto__',stored:'beauty'}).control.current().slug,'beauty');
 const p=page({search:'?theme=chess&keep=yes#type-title',blocked:true});assert.equal(p.control.current().slug,'chess');
 p.dispatch(p.document.querySelector('[data-guide-choice="bratt"]'),'click');assert.equal(p.control.current().slug,'bratt');assert.equal(p.win.location.search,'?theme=bratt&keep=yes');assert.equal(p.win.location.hash,'#type-title');
 p.win.location=new URL('https://example.com/style-guide.html?theme=casino');p.listeners.popstate();assert.equal(p.control.current().slug,'casino');
});

test('native dialog closes with X, outside click and Escape; focuses current choice and wraps Tab in both directions',()=>{
 const p=page({stored:'beauty'}),trigger=p.el('theme-trigger'),close=p.el('theme-close');trigger.focus();p.dispatch(trigger,'click');
 assert(p.dialog.open);assert.equal(p.document.activeElement.getAttribute('data-guide-choice'),'beauty');assert.equal(p.document.body.style.overflow,'hidden');
 const controls=p.dialog.querySelectorAll('button:not(:disabled)'),last=controls.at(-1);last.focus();assert(p.dispatch(p.dialog,'keydown',{key:'Tab'}).defaultPrevented);assert.equal(p.document.activeElement,close);
 assert(p.dispatch(p.dialog,'keydown',{key:'Tab',shiftKey:true}).defaultPrevented);assert.equal(p.document.activeElement,last);
 p.dispatch(p.dialog,'click',{clientX:30,clientY:30});assert(p.dialog.open,'dialog padding is not an outside tap');
 p.dispatch(p.dialog,'click',{clientX:0,clientY:0});assert(!p.dialog.open);assert.equal(p.document.activeElement,trigger);
 p.dispatch(trigger,'click');assert(p.dispatch(p.dialog,'cancel').defaultPrevented);assert(!p.dialog.open);assert.equal(p.document.activeElement,trigger);
 p.dispatch(trigger,'click');p.dispatch(close,'click');assert(!p.dialog.open);assert.notEqual(p.document.body.style.overflow,'hidden');
});

test('guide changes keep marked public release/history links intact',()=>{
 const p=page();vm.runInNewContext(fs.readFileSync(path.join(root,'js/release.js'),'utf8'),{window:p.win,document:p.document});
 const version=p.document.querySelector('[data-su-version]');assert(version);const before=version.getAttribute('href');assert.match(before,/^\/versions\.html#version-/);
 p.dispatch(p.document.querySelector('[data-guide-choice="casino"]'),'click');p.win.SURelease.render();assert.equal(version.getAttribute('href'),before);assert.match(version.textContent,/^Version /);
});
