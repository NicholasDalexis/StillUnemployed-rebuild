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
 for(const name of ['js/app.js','js/theme-art.js','css/styles.css','css/brand.css','css/fonts.css','jobs.html','scripts/gen-theme-pages.mjs','js/style-guide-themes.js']){
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

test('every public theme has a dedicated texture explanation and two or three fixed drawn icon specimens',()=>{
 assert.equal(catalog.themes.reduce((count,theme)=>count+theme.art.icons.length,0),24,'the current eight looks supply 24 drawings');
 for(const theme of catalog.themes){
  assert(theme.art,theme.label+' art coverage');
  for(const key of ['name','description','usage'])assert.equal(typeof theme.art.texture[key],'string',theme.label+' texture '+key);
  assert(theme.art.texture.description.length>20);assert(theme.art.texture.usage.length>20);
  assert(theme.art.icons.length>=2&&theme.art.icons.length<=3,theme.label+' has two or three drawn specimens');assert.equal(new Set(theme.art.icons.map(icon=>icon.id)).size,theme.art.icons.length);
  for(const icon of theme.art.icons){assert(icon.id&&icon.label);assert.match(icon.svg,/^<svg\b/);assert.match(icon.svg,/<\/svg>$/);}
 }
});

test('Original guide specimens preserve the board pose geometry, paint and tall viewBox; other looks stay square',async()=>{
 const {buildCatalog}=await import('../gen-style-guide.mjs'), current=buildCatalog(root), b=board();
 const original=current.themes.find(theme=>theme.look==='original');
 assert.deepEqual(original.art.icons.map(icon=>icon.id),['original-legacy-0','original-legacy-10','original-legacy-13']);
 for(const [index,poseIndex]of [0,10,13].entries()){
  const holder=b.document.createElement('div');holder.innerHTML=original.art.icons[index].svg;
  const svg=holder.children[0],group=svg.children[0];
  for(const [name,value]of Object.entries({viewBox:'0 0 64 90',width:'64',height:'90','aria-hidden':'true',focusable:'false'}))assert.equal(svg.getAttribute(name),value,'Original pose '+poseIndex+' '+name);
  for(const [name,value]of Object.entries({fill:'none',stroke:'#2A2118','stroke-width':'3','stroke-linecap':'round','stroke-linejoin':'round',opacity:'0.78'}))assert.equal(group.getAttribute(name),value,'Original pose '+poseIndex+' '+name);
  const actual=Array.from(group.children,el=>el.tagName==='CIRCLE'?['c',Number(el.getAttribute('cx')),Number(el.getAttribute('cy')),Number(el.getAttribute('r'))]:['p',el.getAttribute('d'),...(el.getAttribute('stroke')==='#C2552F'?[1]:[])]);
  assert.deepEqual(actual,JSON.parse(JSON.stringify(b.app.POSES[poseIndex].parts)),'Original pose '+poseIndex+' uses the real board paths in order');
 }
 for(const theme of current.themes.filter(theme=>theme.look!=='original'))for(const icon of theme.art.icons)assert.match(icon.svg,/viewBox="0 0 64 64"/,theme.label+' keeps its square drawing');
});

test('regeneration cannot bless altered Original shapes, paint, order, dimensions or decorative attributes',async()=>{
 const {generate}=await import('../gen-style-guide.mjs');
 const changeSVG=(from,to)=>'module.exports.themes.original.icons[0].svg=module.exports.themes.original.icons[0].svg.replace('+JSON.stringify(from)+','+JSON.stringify(to)+');';
 for(const [name,mutation]of [
  ['body path',changeSVG('M24 23 L24 52','M24 23 L25 52')],
  ['head position',changeSVG('cx="24"','cx="25"')],
  ['missing accent',changeSVG(' stroke="#C2552F"','')],
  ['ink color',changeSVG('stroke="#2A2118"','stroke="#000000"')],
  ['opacity',changeSVG('opacity="0.78"','opacity="1"')],
  ['extra transform',changeSVG('<g ','<g transform="translate(1 0)" ')],
  ['extra shape',changeSVG('</g>','<circle cx="1" cy="1" r="1"/></g>')],
  ['missing path',changeSVG('<path d="M24 23 L24 52"></path>','')],
  ['pose order','module.exports.themes.original.icons.reverse();'],
  ['pose label ID','module.exports.themes.original.icons[0].id="original-redrawn-0";'],
  ['missing specimen','module.exports.themes.original.icons.pop();'],
  ['width',changeSVG('width="64"','width="65"')],
  ['square Original viewBox',changeSVG('viewBox="0 0 64 90"','viewBox="0 0 64 64"')],
  ['nondecorative Original',changeSVG('aria-hidden="true"','aria-hidden="false"')],
  ['unexpected outer attribute',changeSVG('<svg ','<svg __proto__="ignored" ')],
  ['tall non-Original viewBox','module.exports.themes.poker.icons[0].svg=module.exports.themes.poker.icons[0].svg.replace("0 0 64 64","0 0 64 90");']
 ]){
  const dir=sourceFixture();try{
   const output=path.join(dir,'js/style-guide-themes.js'),before=fs.readFileSync(output,'utf8');
   fs.appendFileSync(path.join(dir,'js/theme-art.js'),'\nmodule.exports=JSON.parse(JSON.stringify(module.exports));\n'+mutation);
   assert.throws(()=>generate(dir,true),/legacy POSES|legacy pose specimens|static decorative drawing/i,name+' must fail even when explicitly regenerating');
   assert.equal(fs.readFileSync(output,'utf8'),before,name+' cannot overwrite the catalog');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('changing a selected board pose requires the guide specimen to agree before generation',async()=>{
 const {generate}=await import('../gen-style-guide.mjs'),dir=sourceFixture();
 try{
  const target=path.join(dir,'js/app.js'),before=fs.readFileSync(target,'utf8'),from='M24 23 L24 52';
  assert(before.includes(from),'legacy pose fixture is present');fs.writeFileSync(target,before.replace(from,'M24 23 L25 52'));
  assert.throws(()=>generate(dir,true),/Original artwork differs from legacy POSES\[0\]/,'fresh generation checks the current board pose rather than accepting a stale illustration');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('catalog generation rejects animated drawings, incomplete textures, duplicate icons and artwork outside public coverage',async()=>{
 const {buildCatalog,generate}=await import('../gen-style-guide.mjs');
 for(const [mutation,reason]of [
  ['module.exports.themes.original.icons[0].svg=module.exports.themes.original.icons[0].svg.replace("</g>","<animate attributeName=\\\"opacity\\\" values=\\\"0;1\\\" dur=\\\"1s\\\" repeatCount=\\\"indefinite\\\"/></g>");',/non-static shape/],
  ['delete module.exports.themes.original.texture;',/texture description/],
  ['module.exports.themes.original.icons[1].id=module.exports.themes.original.icons[0].id;',/distinct drawn icons/],
  ['module.exports.themes.newlook=module.exports.themes.original;',/coverage disagree/]
 ]){
  const dir=sourceFixture();try{const target=path.join(dir,'js/theme-art.js');fs.appendFileSync(target,'\nmodule.exports=JSON.parse(JSON.stringify(module.exports));\n'+mutation);assert.throws(()=>buildCatalog(dir),reason);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 const dir=sourceFixture();try{
  fs.appendFileSync(path.join(dir,'js/theme-art.js'),'\nmodule.exports=JSON.parse(JSON.stringify(module.exports));\nmodule.exports.themes.original.texture.description="Updated description of the same warm paper texture.";');
  assert.throws(()=>generate(dir),/catalog is stale/,'artwork metadata changes require regenerating the public catalog');generate(dir,true);assert.doesNotThrow(()=>generate(dir));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('theme changes replace texture layers, motion guidance and exact icon specimens without touching board or account state',()=>{
 const p=page(),before=JSON.stringify(catalog);
 for(const theme of catalog.themes){
  p.dispatch(p.document.querySelector('[data-guide-choice="'+theme.slug+'"]'),'click');
  const preview=p.el('theme-texture-preview');
  for(const property of ['background-color','background-image','background-size','background-position','background-repeat','animation'])assert.equal(preview.style[property],theme.canvas[property]||(property==='animation'?'none':''),theme.label+' texture '+property);
  assert.equal(p.el('theme-texture-name').textContent,theme.art.texture.name);assert.equal(p.el('theme-texture-description').textContent,theme.art.texture.description);assert.equal(p.el('theme-texture-usage').textContent,theme.art.texture.usage);
  assert.equal(p.el('theme-texture-layers').textContent,theme.canvas['background-image']);assert.equal(p.el('theme-texture-size').textContent,theme.canvas['background-size']||'auto');assert.equal(p.el('theme-texture-repeat').textContent,theme.canvas['background-repeat']||'repeat');
  const motion=p.el('theme-texture-motion').textContent;if(theme.canvas.animation){assert.match(motion,/Reduced-motion/);const duration=theme.canvas.animation.match(/(?:^|\s)([\d.]+m?s)(?=\s|$)/);assert(duration);assert(motion.includes(duration[1]));}else assert.match(motion,/stays still/);
  const figures=p.el('theme-icon-specimens').children;assert.equal(figures.length,theme.art.icons.length);
  theme.art.icons.forEach((icon,index)=>{const figure=figures[index];assert.equal(figure.getAttribute('data-theme-icon'),icon.id);assert.equal(figure.querySelector('h3').textContent,icon.label);assert.equal(figure.querySelector('.icon-drawing').innerHTML,icon.svg);assert.equal(figure.querySelector('.icon-stage').style.color,theme.palette.ink);assert.equal(figure.querySelector('.icon-stage').getAttribute('aria-hidden'),'true');assert.equal(figure.querySelector('.icon-stage').style['animation'],'none');});
  assert(p.el('theme-icons-intro').textContent.includes(theme.label));
 }
 assert.equal(JSON.stringify(catalog),before,'rendering leaves the immutable source catalog unchanged');assert(p.writes.every(([key])=>key===guide.key));assert.equal(p.data.get('su_look'),'poker');assert.equal(p.data.get('su_saved_jobs'),'{"keep":true}');assert.equal(p.data.get('su_tracker'),'[{"url":"keep"}]');
});

test('texture descriptions and icon labels render as text, while only fixed catalog SVG becomes markup',()=>{
 const p=page(),theme=JSON.parse(JSON.stringify(catalog.themes[0]));
 theme.art.texture.name='<img src=x>';theme.art.texture.description='<script>unexpected()</script>';theme.art.texture.usage='<svg onload=unexpected()>';
 theme.art.icons[0].label='<button>unexpected action</button>';p.control.render(theme,false);
 assert.equal(p.el('theme-texture-name').textContent,theme.art.texture.name);assert.equal(p.el('theme-texture-name').children.length,0);assert.equal(p.el('theme-texture-description').children.length,0);assert.equal(p.el('theme-texture-usage').children.length,0);
 const specimen=p.el('theme-icon-specimens').children[0];assert.equal(specimen.querySelector('h3').textContent,theme.art.icons[0].label);assert.equal(specimen.querySelector('button'),null);assert.equal(specimen.querySelector('.icon-drawing').innerHTML,catalog.themes[0].art.icons[0].svg);
});
