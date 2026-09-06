const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const identity=require('../../js/job-identity.js');
const aliasPairs=require('./fixtures/job-aliases.cjs');

const source=fs.readFileSync(path.join(__dirname,'../../js/app.js'),'utf8');
const HEADERS=['Company','Job Title','Link','Location','Type','Salary','Years of Experience','Category','Description','TL;DR','Pick','Active/Dead'];
const row=(overrides={})=>Object.assign({Company:'Example','Job Title':'Designer',Link:'https://example.com/job',Location:'Remote',Type:'Remote',Salary:'$70-90K','Years of Experience':'1-3 yrs',Category:'Social',Description:'Design the product. Work with the team.','TL;DR':'Design the product.',Pick:'','Active/Dead':'Active'},overrides);
const job=(overrides={})=>Object.assign({co:'Example',role:'Designer',link:'https://example.com/job',loc:'Remote',state:'Remote',style:'Remote',pay:'$70-90K',ind:'Social',exp:'1+ yrs',desc:'Design the product.',tldr:'Design the product.'},overrides);
const csv=(rows,headers=HEADERS)=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// An offline DOM adapter executes the real rendering/event handlers. It models
// attributes, descendants, replaced nodes and focus, but makes no visual claims.
function board({search='',saved={},tracker=[],look='original',response,fetchError,identityAvailable=true}={}) {
 const events={},windowEvents={},requests=[],opened=[],shared=[],timers=[];
 const data=new Map([['su_saved_jobs',JSON.stringify(saved)],['su_tracker',JSON.stringify(tracker)],['su_look',look]]);
 const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
 const decode=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 let document;
 const fire=(name,target,extra={})=>{const e={target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};for(const f of events[name]||[])f(e);return e;};
 class Element {
  constructor(tag,attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.text='';this.style={setProperty(k,v){this[k]=v;}};this.listeners={};this.writes=0;this.parentElement=null;
   for(const [k,v] of Object.entries(attrs)){if(k==='style')for(const part of v.split(';')){const i=part.indexOf(':');if(i>=0)this.style[part.slice(0,i).trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=part.slice(i+1).trim();}}
   this.value=attrs.value||'';this.classList={contains:n=>this.className.split(/\s+/).includes(n),add(){},remove(){}};
  }
  get id(){return this.attrs.id||'';}set id(v){this.attrs.id=v;}
  get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
  get isConnected(){return this===document.body||this===document.head||!!(this.parentElement&&this.parentElement.isConnected);}
  get parentNode(){return this.parentElement;}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.text=String(v);this.children=[];}
  getAttribute(k){return this.attrs[k]??null;}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}
  appendChild(el){this.children.push(el);el.parentElement=this;return el;}
  removeChild(el){this.children=this.children.filter(c=>c!==el);el.parentElement=null;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  contains(el){for(let p=el;p;p=p.parentElement)if(p===this)return true;return false;}
  matches(selector){return selector.split(',').some(part=>{
   part=part.trim();if(part.includes(':not(:disabled)')){if(this.attrs.disabled!==undefined)return false;part=part.replace(':not(:disabled)','');}
   const tag=part.match(/^[\w-]+/);if(tag&&this.tagName!==tag[0].toUpperCase())return false;
   for(const m of part.matchAll(/#([\w-]+)/g))if(this.id!==m[1])return false;
   const withoutAttrs=part.replace(/\[[^\]]*\]/g,'');
   for(const m of withoutAttrs.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;
   for(const m of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(this.getAttribute(m[1])===null||(m[2]!==undefined&&this.getAttribute(m[1])!==m[2]))return false;
   return true;
  });}
  querySelectorAll(selector){const out=[];const visit=node=>{for(const c of node.children){if(c.matches(selector))out.push(c);visit(c);}};visit(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
  focus(){document.activeElement=this;}setSelectionRange(){}scrollIntoView(){this.scrolled=true;}getClientRects(){return this.style.display==='none'?[]:[{}];}
  click(){fire('click',this);}
  set innerHTML(html){
   this.writes++;this.html=html;this.text='';for(const c of this.children)c.parentElement=null;this.children=[];
   const stack=[this],voids=new Set(['INPUT','IMG','BR','HR','META','LINK']);
   for(const token of html.matchAll(/<\/?[\w-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)){
    const raw=token[0];if(raw[0]!=='<'){stack.at(-1).text+=decode(raw);continue;}
    const closing=raw.startsWith('</'),name=raw.match(/^<\/?([\w-]+)/)[1];
    if(closing){let i=stack.length-1;while(i>0&&stack[i].tagName!==name.toUpperCase())i--;if(i>0)stack.length=i;continue;}
    const attrs={};const attrText=raw.slice(name.length+1,raw.endsWith('/>')?-2:-1);
    for(const a of attrText.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');
    const el=stack.at(-1).appendChild(new Element(name,attrs));if(!voids.has(el.tagName)&&!raw.endsWith('/>'))stack.push(el);
   }
  }
  get innerHTML(){return this.html||'';}
 }
 document={readyState:'loading',hidden:false,visibilityState:'visible',referrer:'',
  addEventListener(k,fn){(events[k]??=[]).push(fn);},createElement:tag=>new Element(tag),
  getElementById(id){return this.body.querySelector('#'+id)||this.head.querySelector('#'+id);},
  querySelectorAll(selector){
   if(selector.startsWith('#overlay-root '))return overlay.querySelectorAll(selector.slice('#overlay-root '.length));
   if(selector.startsWith('.su-main-nav ')){const nav=this.body.querySelector('.su-main-nav');return nav?nav.querySelectorAll(selector.slice('.su-main-nav '.length)):[];}
   return this.body.querySelectorAll(selector);
  },querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 };
 document.body=new Element('body');document.head=new Element('head');document.activeElement=document.body;
 const grid=document.body.appendChild(new Element('div',{id:'board'})),overlay=document.body.appendChild(new Element('div',{id:'overlay-root'}));
 const window={SUJobIdentity:identityAvailable?identity:undefined,innerWidth:390,innerHeight:844,addEventListener(k,f){(windowEvents[k]??=[]).push(f);},matchMedia(){return{matches:true};},open(...args){opened.push(args);}};
 const location={origin:'https://preview--stillunemployed.netlify.app',hostname:'preview--stillunemployed.netlify.app',pathname:'/jobs.html',search,hash:''};
 const fetch=async(url,options)=>{requests.push({url,options});if(fetchError)throw fetchError;return response||{ok:true,status:200,text:async()=>csv([row()])};};
 const quiet={warn(){},debug(){},error(){},log(){}};
 const context={window,document,localStorage,location,fetch,URL,URLSearchParams,Date,Math,Set,Map,console:quiet,
  navigator:{share:async value=>{shared.push(value);}},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,performance:{now:()=>0},getComputedStyle:el=>({visibility:el.style.visibility||'visible'})};
 const instrumented=source.replace('window.SUApp = App;','window.SUApp = App; window.boardHelpers = {parseCSV, rowsToJobs, deriveState, suShareJob};');
 assert.notEqual(instrumented,source,'debug export hook is present');vm.runInNewContext(instrumented,context,{filename:'js/app.js'});
 return{app:window.SUApp,helpers:window.boardHelpers,grid,overlay,document,localStorage,requests,opened,shared,fire,runTimers(delay){for(const timer of timers.filter(t=>t.delay===delay))timer.fn();},
  init(jobs=[job()]){window.SUApp.init(jobs);},async boot(){for(const f of events.DOMContentLoaded||[])f();await tick();await tick();}};
}

test('every approved sourcing lane is selectable and searchable by category name',()=>{
 const b=board();
 const lanes=['Brand & Marketing','Content & Copy','Creative Tech','Growth & CRM','Influencer','PR & Partnerships','Social','Video & Creative','Photography','Videography','UX/UI Design','Web Development','Artificial Intelligence','Fashion Design'];
 b.init(lanes.map((ind,i)=>job({ind,link:'https://example.com/job/'+i})));
 for(const lane of lanes){
  assert(b.app.catList().some(c=>c.match===lane),lane+' has a category control');
  b.app.state.q=lane;b.app.state.cat='all';
  assert(b.app.computeShown().shown.some(j=>j.ind===lane),lane+' is found by search');
  b.app.state.q='';b.app.state.cat=lane;
  assert.equal(b.app.computeShown().shown.length,1,lane+' filters to its role');
 }
});

test('salary colors and pay filters use dollars for comma/full-number and K formats',()=>{
 const b=board();for(const [pay,tier] of [['$70,500–$79,500','low'],['$80,500','mid'],['$80000','mid'],['$99,999','mid'],['$100000','high'],['$85K','mid'],['$70–90K','mid'],['$100K+','high']])assert.equal(b.app.payTier(pay),tier,pay);
 b.app.jobs=[job({pay:'$70,500–$79,500'}),job({link:'https://example.com/high',pay:'$100000'})];b.app.state.pr='Under $80K';assert.equal(b.app.computeShown().shown.length,1);assert.equal(b.app.computeShown().shown[0].pay,'$70,500–$79,500');
});
test('state filters distinguish restricted remote jobs from unrestricted US remote',()=>{
 const b=board();const jobs=b.helpers.rowsToJobs(b.helpers.parseCSV(csv([row({Location:'New York, NY (Remote)'}),row({Link:'https://example.com/us',Location:'Remote, United States'})])));
 assert.equal(jobs[0].state,'NY');assert.equal(jobs[1].state,'Remote');b.app.jobs=jobs;b.app.state.st='CA';assert.deepEqual(Array.from(b.app.computeShown().shown,j=>j.link),['https://example.com/us']);
 b.app.state.st='NY';assert.equal(b.app.computeShown().shown.length,2);
});
test('reset all filters clears search and category as well as detailed filters',()=>{
 const b=board();b.init();b.app.setState({q:'nothing matches',cat:'Social',ws:'Hybrid',st:'NY',pr:'$100K+',fr:'Recently added',theme:'social',openPanel:'filters'});
 b.grid.querySelector('[data-act="clearAll"]').click();
 for(const [key,value]of Object.entries({q:'',cat:'all',ws:'Any',st:'all',pr:'Any',fr:'Any',theme:null}))assert.equal(b.app.state[key],value,key);assert.equal(b.app.computeShown().shown.length,1);
});
test('dismissing signup cards immediately rebuilds the grid and removes all signup placements',()=>{
 const b=board();b.init(Array.from({length:20},(_,i)=>job({link:'https://example.com/'+i})));
 const close=b.grid.querySelector('[data-act="hideSignupCards"]');assert(close,'fixture has signup cards');const before=b.grid.writes;close.click();
 assert.equal(b.grid.writes,before+1);assert.equal(b.grid.querySelectorAll('[data-act="hideSignupCards"]').length,0);assert.equal(b.app.jobs.length,20);
 const after=b.grid.writes;b.app.setState({detailOpen:true,detailLink:b.app.jobs[0].link});assert.equal(b.grid.writes,after,'opening only a dialog avoids rebuilding the grid');
});
test('an unavailable-job report removes its card immediately',()=>{
 const b=board();b.init();b.app.setState({feedbackOpen:true,feedbackCo:'Example',feedbackLink:'https://example.com/job'});const before=b.grid.writes;
 b.overlay.querySelector('[data-act="reportBroken"]').click();assert.equal(b.app.jobs.length,0);assert.equal(b.grid.querySelectorAll('.note[data-link]').length,0);assert.equal(b.grid.writes,before+1);
});
test('a valid feed with zero eligible jobs remains empty without requesting bundled JSON',async()=>{
 const b=board({response:{ok:true,status:200,text:async()=>csv([row({'Active/Dead':'Dead'})])}});await b.boot();
 assert.equal(b.app.jobs.length,0);assert(!b.app._loadError);assert.equal(b.requests.length,1);assert(!b.requests.some(r=>r.url.includes('jobs-data.json')));assert.doesNotMatch(b.grid.textContent,/Jobs could not load right now/);
});
test('feed failure presents recovery UI and never revives the bundled sample',async()=>{
 const b=board({fetchError:new Error('offline')});await b.boot();assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);assert.equal(b.requests.length,1);assert(b.grid.querySelector('[data-act="retryJobs"]'));
});
test('strict CSV accepts reordered required columns, quoted text and a header-only feed',()=>{
 const b=board();const headers=['Link','Salary','Job Title','Active/Dead','Company'];const text=csv([row({Company:'A, "B"','Job Title':'Designer\nBrand'})],headers);
 const jobs=b.helpers.rowsToJobs(b.helpers.parseCSV(text));assert.equal(jobs.length,1);assert.equal(jobs[0].co,'A, "B"');assert.equal(jobs[0].role,'Designer\nBrand');assert.equal(b.helpers.rowsToJobs(b.helpers.parseCSV(csv([]))).length,0);
});
test('malformed CSV and missing or duplicate required headers are rejected',()=>{
 const b=board();for(const text of ['<html>unavailable</html>',csv([],['Company','Job Title']),csv([],['Company','Company','Job Title','Link','Salary','Active/Dead']),'Company,Job Title,Link,Salary,Active/Dead\n"unterminated',csv([])+'\r\nonly,two'])assert.throws(()=>b.helpers.rowsToJobs(b.helpers.parseCSV(text)),undefined,text);
});
test('feed eligibility requires complete jobs, valid URLs and a disclosed qualifying hourly rate',()=>{
 const b=board();const candidates=[row({Link:'https://example.com/ok',Salary:'$25/hour'}),row({Company:'',Link:'https://example.com/no-company'}),row({'Job Title':'',Link:'https://example.com/no-role'}),row({Link:'javascript:alert(1)'}),row({Link:'https://',Salary:'$90K'}),row({Link:'https://example.com/no-pay',Salary:''}),row({Link:'https://example.com/low-hourly',Salary:'$24/hr'})];
 assert.deepEqual(Array.from(b.helpers.rowsToJobs(b.helpers.parseCSV(csv(candidates))),j=>j.link),['https://example.com/ok']);
});
test('unknown and inherited theme query names are ignored without blank filter chips',()=>{
 for(const query of ['?theme=constructor','?theme=__proto__','?theme=toString','?theme=unknown','?theme=%E0%A4%A']){
  const b=board({search:query});assert.doesNotThrow(()=>b.init([job(),job({link:'https://example.com/fashion',ind:'Fashion Design'})]),query);
  assert.equal(b.app.computeShown().shown.length,2,query);assert.equal(b.grid.querySelector('[data-act="chipTheme"]'),null,query);
 }
});
test('unlisted saved links remain visible and can be removed from persistent Saved state',()=>{
 const missing='https://example.com/old-posting';const b=board({saved:{[missing]:true}});b.init();b.app.setState({savedOnly:true});
 const section=b.grid.querySelector('.su-unlisted-saved');assert(section);const button=section.querySelector('[data-act="toggleSave"]');assert.equal(button.tagName,'BUTTON');assert.equal(button.getAttribute('data-link'),missing);button.click();
 assert.equal(b.app.state.saved[missing],undefined);assert.equal(JSON.parse(b.localStorage.getItem('su_saved_jobs'))[missing],undefined);assert.equal(b.grid.querySelector('.su-unlisted-saved'),null);
});
test('share URLs carry an encoded recoverable job link and the selected visual theme',()=>{
 const b=board({look:'poker'});const link='https://example.com/~nic?title=Design%20%26%20Brand';b.helpers.suShareJob(job({link}));const url=new URL(b.shared[0].url);
 assert.equal(url.origin,'https://preview--stillunemployed.netlify.app');assert.match(url.pathname,/^\/j\/poker\/[^/]+\.html$/);assert.equal(url.searchParams.get('theme'),'poker');assert.equal(Buffer.from(url.searchParams.get('job'),'base64').toString('utf8'),link);assert(url.search.includes('%2B'),'base64 plus is URL-encoded');
});
test('the final Apply control is native and opens the posting from the accessible dialog',()=>{
 const b=board();b.init();b.grid.querySelector('[data-act="apply"]').click();const apply=b.overlay.querySelector('[data-act="detailApply"]');assert.equal(apply.tagName,'BUTTON');assert.equal(apply.getAttribute('type'),'button');
 assert(b.overlay.querySelector('[role="dialog"]'));assert.equal(b.grid.inert,true);apply.click();assert.equal(b.opened.length,1);assert.equal(b.opened[0][0],'https://example.com/job');assert.equal(b.opened[0][2],'noopener');assert.equal(b.app.state.feedbackOpen,true);
 b.fire('keydown',b.document.activeElement,{key:'Escape'});assert.equal(b.overlay.querySelector('[role="dialog"]'),null);assert.equal(b.grid.inert,false);
});

test('the five confirmed alias pairs render once each without combining distinct requisitions',()=>{
 const b=board();
 const candidates=aliasPairs.flatMap(pair=>pair.links.map(link=>row({Company:pair.co,'Job Title':pair.role,Link:link})));
 candidates.push(row({Company:'Glossier','Job Title':'Social Media Manager',Link:'https://boards.greenhouse.io/glossier/jobs/8054876'}));
 const jobs=b.helpers.rowsToJobs(b.helpers.parseCSV(csv(candidates)));
 assert.equal(jobs.length,6);b.init(jobs);assert.equal(b.app.jobs.length,6);
 assert.equal(b.grid.querySelectorAll('.note[data-link]').length,6);
 for(const pair of aliasPairs){
  const representative=b.app.jobs.find(j=>j.link===pair.links[0]);assert(representative,pair.role);
  assert.deepEqual(Array.from(representative._aliases),pair.links);
 }
});

test('existing Saved aliases remain raw, select the visible card and unsave together on request',()=>{
 for(const pair of aliasPairs){
  const saved=Object.fromEntries(pair.links.map(link=>[link,true]));
  const b=board({saved});const original=b.localStorage.getItem('su_saved_jobs');
  b.init(pair.links.map(link=>job({co:pair.co,role:pair.role,link})));
  assert.equal(b.localStorage.getItem('su_saved_jobs'),original,'viewing never migrates saved keys');
  b.app.setState({savedOnly:true});assert.equal(b.app.computeShown().shown.length,1);
  assert.equal(b.grid.querySelector('.su-unlisted-saved'),null);
  assert.deepEqual(b.grid.querySelector('[data-act="toggleSavedOnly"]').textContent.match(/\d+/g),['1']);
  const save=b.grid.querySelector('[data-act="toggleSave"]');assert.equal(save.getAttribute('aria-pressed'),'true');save.click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{});
 }
});

test('a saved alias still matches when only its representative remains in the current feed',()=>{
 const pair=aliasPairs[3],b=board({saved:{[pair.links[1]]:true}});b.init([job({link:pair.links[0]})]);
 b.app.setState({savedOnly:true});assert.equal(b.app.computeShown().shown.length,1);assert.equal(b.grid.querySelector('.su-unlisted-saved'),null);
 b.app.toggleSave(pair.links[0]);assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{});
 b.app.toggleSave(pair.links[0]);assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{[pair.links[0]]:true});
});

test('an old alias share highlights the representative and alias details remain available',()=>{
 const pair=aliasPairs[1],b=board({search:'?job='+encodeURIComponent(Buffer.from(pair.links[1]).toString('base64'))});
 b.init(pair.links.map(link=>job({co:pair.co,role:pair.role,link})));b.runTimers(900);
 const card=b.grid.querySelector('.note[data-link]');assert.equal(card.getAttribute('data-link'),pair.links[0]);assert.equal(card.scrolled,true);
 b.app.setState({detailOpen:true,detailLink:pair.links[1]});
 assert.equal(b.overlay.querySelector('[data-act="detailApply"]').getAttribute('data-link'),pair.links[0]);
});

test('applying through a URL alias preserves an existing tracker application and its notes',()=>{
 const pair=aliasPairs[4],existing={id:'existing',company:pair.co,role:pair.role,link:pair.links[1],source:'Me',dateApplied:'2026-09-01',status:'Interview 2',notes:'Keep these notes'};
 const b=board({tracker:[existing]});b.init([job({co:pair.co,role:pair.role,link:pair.links[0]})]);
 const before=b.localStorage.getItem('su_tracker');b.app.setState({feedbackOpen:true,feedbackCo:pair.co,feedbackLink:pair.links[0]});
 b.overlay.querySelector('[data-act="markApplied"]').click();assert.equal(b.localStorage.getItem('su_tracker'),before);
});

test('a prior local unavailable report hides every alias without changing stored report URLs',()=>{
 const pair=aliasPairs[0],b=board();b.localStorage.setItem('su_reported_links',JSON.stringify([pair.links[1]]));
 b.init(pair.links.map(link=>job({link})));assert.equal(b.app.jobs.length,0);
 assert.deepEqual(JSON.parse(b.localStorage.getItem('su_reported_links')), [pair.links[1]]);
});

test('a missing identity dependency shows feed recovery while existing Saved links remain accessible',async()=>{
 const link='https://example.com/already-saved',b=board({identityAvailable:false,saved:{[link]:true}});
 await b.boot();assert.equal(b.app._loadError,true);assert.equal(b.app.jobs.length,0);assert(b.grid.querySelector('[data-act="retryJobs"]'));
 assert.equal(b.requests.length,1);assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{[link]:true});
 b.app.setState({savedOnly:true});const saved=b.grid.querySelector('.su-unlisted-saved');assert(saved);
 saved.querySelector('[data-act="toggleSave"]').click();assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{});
});

test('missing identity blocks a new board tracker entry and avoids falsely claiming it was logged',()=>{
 const existing={id:'keep',company:'Existing',link:'https://example.com/previous',status:'Interview 1',notes:'Keep me'};
 const b=board({identityAvailable:false,tracker:[existing]});b.init();const before=b.localStorage.getItem('su_tracker');
 b.app.setState({feedbackOpen:true,feedbackCo:'Example',feedbackLink:'https://example.com/job'});
 b.overlay.querySelector('[data-act="markApplied"]').click();
 assert.equal(b.localStorage.getItem('su_tracker'),before);assert.equal(b.localStorage.getItem('su_tracker_nudged'),null);
 assert.match(b.document.body.textContent,/Tracker could not load/);
});
