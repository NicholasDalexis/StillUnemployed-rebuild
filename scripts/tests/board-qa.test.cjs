const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const identity=require('../../js/job-identity.js');
const themeArt=require('../../js/theme-art.js');
const aliasPairs=require('./fixtures/job-aliases.cjs');

const source=fs.readFileSync(path.join(__dirname,'../../js/app.js'),'utf8');
const HEADERS=['Company','Job Title','Link','Location','Type','Salary','Years of Experience','Category','Description','TL;DR','Pick','Active/Dead'];
const row=(overrides={})=>Object.assign({Company:'Example','Job Title':'Designer',Link:'https://example.com/job',Location:'Remote',Type:'Remote',Salary:'$70-90K','Years of Experience':'1-3 yrs',Category:'Social',Description:'Design the product. Work with the team.','TL;DR':'Design the product.',Pick:'','Active/Dead':'Active'},overrides);
const job=(overrides={})=>Object.assign({co:'Example',role:'Designer',link:'https://example.com/job',loc:'Remote',state:'Remote',style:'Remote',pay:'$70-90K',ind:'Social',exp:'1+ yrs',desc:'Design the product.',tldr:'Design the product.'},overrides);
const csv=(rows,headers=HEADERS)=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// An offline DOM adapter executes the real rendering/event handlers. It models
// attributes, descendants, replaced nodes and focus, but makes no visual claims.
function board({search='',saved={},tracker=[],look='original',response,fetchError,identityAvailable=true,artAvailable=true,analyticsAvailable=true,analyticsConsent=false,personalizationConsent=false,admin=false}={}) {
 const events={},windowEvents={},requests=[],opened=[],shared=[],timers=[],storageOps=[],tracking=[];
 let now=Date.now();
 class Clock extends Date {static now(){return now;}}
 const data=new Map([['su_saved_jobs',JSON.stringify(saved)],['su_tracker',JSON.stringify(tracker)],['su_look',look]]);
 if(analyticsConsent)data.set('su_consent_v3','granted');
 if(personalizationConsent)data.set('su_personalization_v1','granted');
 if(admin)data.set('su_admin','1');
 const localStorage={getItem(k){storageOps.push({op:'get',key:k});return data.get(k)??null;},setItem(k,v){storageOps.push({op:'set',key:k,value:String(v)});data.set(k,String(v));},removeItem(k){storageOps.push({op:'remove',key:k});data.delete(k);},key:i=>[...data.keys()][i],get length(){return data.size;}};
 const decode=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 let document;
 const fire=(name,target,extra={})=>{const route=[];for(let el=target;el;el=el.parentElement)route.push(el);const connected=target.isConnected;const e={target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},composedPath:()=>connected?route.concat(document,window):route,...extra};for(const el of route){if(e.stopped)break;e.currentTarget=el;for(const f of el.listeners[name]||[])f(e);}if(connected&&!e.stopped){e.currentTarget=document;for(const f of events[name]||[])f(e);}return e;};
 const fireWindow=(name,extra={})=>{const e={target:window,currentTarget:window,...extra};for(const f of windowEvents[name]||[])f(e);return e;};
 const styleDeclaration=()=>({setProperty(k,v){this[k]=v;},set cssText(value){this._cssText=String(value);for(const part of this._cssText.split(';')){const i=part.indexOf(':');if(i>=0)this[part.slice(0,i).trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=part.slice(i+1).trim();}},get cssText(){return this._cssText||'';}});
 class Element {
  constructor(tag,attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.text='';this.style=styleDeclaration();this.listeners={};this.writes=0;this.parentElement=null;
   if(attrs.style)this.style.cssText=attrs.style;
   this.value=attrs.value||'';this.classList={contains:n=>this.className.split(/\s+/).includes(n),add(){},remove(){}};
  }
  get id(){return this.attrs.id||'';}set id(v){this.attrs.id=v;}
  get type(){return this.attrs.type||'';}set type(v){this.attrs.type=v;}
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
  getBoundingClientRect(){return this.rect||{top:240,bottom:480,left:0,right:390,width:390,height:240};}
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
 const window={SUStates:require('../../js/us-states.js'),SUJobIdentity:identityAvailable?identity:undefined,SUThemeArt:artAvailable?themeArt:undefined,innerWidth:390,innerHeight:844,addEventListener(k,f){(windowEvents[k]??=[]).push(f);},matchMedia(){return{matches:true};},open(...args){opened.push(args);},suTrack(...args){tracking.push(args);}};
 if(analyticsAvailable)window.SUAnalytics={choices:()=>({analytics:data.get('su_consent_v3')==='granted',personalization:data.get('su_personalization_v1')==='granted'}),registerJobs(){},job(){},generation:()=>0,profile:()=>({})};
 const location={origin:'https://preview--stillunemployed.netlify.app',hostname:'preview--stillunemployed.netlify.app',pathname:'/jobs.html',search,hash:''};
 const history={replaceState(_state,_title,value){const url=new URL(value,location.origin);location.pathname=url.pathname;location.search=url.search;location.hash=url.hash;}};
 window.history=history;
 const fetch=async(url,options)=>{requests.push({url,options});if(fetchError)throw fetchError;return response||{ok:true,status:200,text:async()=>csv([row()])};};
 const quiet={warn(){},debug(){},error(){},log(){}};
 const context={window,document,localStorage,location,history,fetch,URL,URLSearchParams,Date:Clock,Math,Set,Map,console:quiet,
  navigator:{share:async value=>{shared.push(value);}},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(id){if(timers[id-1])timers[id-1].cancelled=true;},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,performance:{now:()=>0},getComputedStyle:el=>({visibility:el.style.visibility||'visible'})};
 const instrumented=source.replace('window.SUApp = App;','window.SUApp = App; window.boardHelpers = {parseCSV, rowsToJobs, deriveState, suShareJob};');
 assert.notEqual(instrumented,source,'debug export hook is present');vm.runInNewContext(instrumented,context,{filename:'js/app.js'});
 return{app:window.SUApp,helpers:window.boardHelpers,grid,overlay,document,window,location,history,localStorage,storageOps,tracking,requests,opened,shared,fire,fireWindow,runTimers(delay){for(const timer of timers.filter(t=>t.delay===delay&&!t.cancelled))timer.fn();},
  scrollPastCards(count){grid.querySelectorAll('.note[data-act="openJob"]').forEach((card,i)=>{card.rect={bottom:i<count?-1:240};});now+=300;fireWindow('scroll');},
  consent(analytics,personalization=false){localStorage.setItem('su_consent_v3',analytics?'granted':'denied');localStorage.setItem('su_personalization_v1',personalization?'granted':'denied');fireWindow('su:consent-changed');},
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
test('feed has advice without promotional signup cards; newsletter follows actual detail openings',()=>{
 const b=board();b.init(Array.from({length:20},(_,i)=>job({link:'https://example.com/'+i})));
 assert.equal(b.grid.querySelectorAll('[data-act="hideSignupCards"]').length,0);
 const card=b.grid.querySelector('[data-act="openJob"]');assert(card);
 card.click();assert.equal(b.overlay.querySelectorAll('iframe').length,0);
 b.overlay.querySelector('[data-act="closeDetail"]').click();card.click();
 assert.equal(b.overlay.querySelectorAll('iframe').length,1);
 b.app.renderOverlays();assert.equal(b.overlay.querySelectorAll('iframe').length,1,'rerender retains the same cadence');
 b.overlay.querySelector('[data-act="hideRecipe"]').click();assert.equal(b.overlay.querySelectorAll('iframe').length,0);
 b.overlay.querySelector('[data-act="closeDetail"]').click();card.click();
 assert.equal(b.overlay.querySelectorAll('iframe').length,0);
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

const themeJobs=(count=72)=>Array.from({length:count},(_,i)=>job({link:'https://example.com/theme-test/'+i}));
const voteBox=b=>b.document.querySelector('[role="dialog"][aria-label="Theme feedback"]');
const voteOps=b=>b.storageOps.filter(op=>op.key.startsWith('su_tv_'));
const votes=b=>b.tracking.filter(args=>args[0]==='themevote');

test('the seven alternate themes render their shared drawings as noninteractive decoration on real job cards',()=>{
 const alternateThemes=Object.entries(themeArt.themes).filter(([look])=>look!=='original');
 assert.equal(alternateThemes.length,7);
 for(const [look,art] of alternateThemes){
  const b=board({look});b.init(themeJobs());
  const motifs=b.grid.querySelectorAll('[data-theme-motif]');
  assert.deepEqual([...new Set(motifs.map(el=>el.getAttribute('data-theme-motif')))].sort(),art.icons.map(icon=>icon.id).sort(),look+' uses every shared icon');
  for(const motif of motifs){
   assert(motif.closest('.note[data-act="openJob"]'),look+' motif belongs to a job card');
   const first=!!motif.closest('.note-first'),size=first?'48':'64';
   assert.equal(motif.style.width,size+'px');assert.equal(motif.style.height,size+'px');
   assert.equal(motif.style.top,first?'-40px':'-54px');
   assert.equal(motif.getAttribute('aria-hidden'),'true');
   assert.equal(motif.style.pointerEvents,'none');
   assert.equal(motif.style.color,b.app.THEMES[look].ink);
   const svg=motif.querySelector('svg');assert(svg);
   assert.equal(svg.getAttribute('viewBox'),'0 0 64 64');
   assert.equal(svg.getAttribute('width'),size);assert.equal(svg.getAttribute('height'),size);
   assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
   const canonical=b.document.createElement('div');
   canonical.innerHTML=art.icons.find(icon=>icon.id===motif.getAttribute('data-theme-motif')).svg;
   // The board can change the SVG's presentation size, while its coordinate
   // system, strokes, paths and every other attribute stay canonical.
   const artwork=node=>({tag:node.tagName,attrs:Object.fromEntries(Object.entries(node.attrs).filter(([key])=>node.tagName!=='SVG'||!['width','height'].includes(key))),text:node.text,children:node.children.map(artwork)});
   assert.deepEqual(artwork(svg),artwork(canonical.querySelector('svg')),motif.getAttribute('data-theme-motif')+' preserves the shared artwork');
   assert.equal(motif.querySelector('button,a,input,[tabindex],[data-act],script,image,foreignObject'),null,'decorations add no controls or active content');
  }
  assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,72,look+' preserves the feed');
  assert.equal(b.grid.querySelectorAll('[data-act="apply"]').length,72,look+' preserves Apply controls');
 }
});

test('Original preserves its pose table and cadence with the requested coffee-break replacement',()=>{
 const b=board({look:'original'});
 assert.equal(b.app.POSES.length,16,'all sixteen pose slots remain available');
 const knownPoses={
  0:{w:40,pos:{top:'-46px',left:'34%'},parts:[['c',24,16,7],['p','M24 23 L24 52'],['p','M24 28 L40 18'],['p','M40 6 L40 40',1],['p','M40 6 L55 11 L40 16 Z',1],['p','M24 52 L16 72'],['p','M24 52 L33 68']]},
  10:{w:40,pos:{top:'-44px',left:'36%'},parts:[['c',24,14,7],['p','M24 21 L24 50'],['p','M24 28 L14 38 L33 38'],['p','M24 28 L34 32'],['p','M24 50 L17 70'],['p','M24 50 L33 70'],['p','M33 29 L46 29 L45 42 L34 42 Z',1],['p','M46 32 C55 30 55 40 46 39',1],['p','M37 24 Q34 20 38 17',1]]},
  13:{w:50,pos:{top:'-44px',right:'40px'},parts:[['c',16,12,6],['p','M16 18 L18 38'],['p','M18 38 L12 56'],['p','M18 38 L24 56'],['p','M17 24 L40 20'],['p','M40 20 L60 10'],['p','M60 10 Q61 34 57 50',1],['p','M54 50 l3 5 l3 -5',1]]}
 };
 for(const [index,pose]of Object.entries(knownPoses))assert.deepEqual(JSON.parse(JSON.stringify(b.app.POSES[index])),pose,'historical pose '+index+' is unchanged');
 b.init(themeJobs());
 const cards=b.grid.querySelectorAll('.note[data-act="openJob"]');
 assert.equal(cards.length,72);assert.equal(b.grid.querySelectorAll('[data-act="apply"]').length,72);
 assert.equal(b.grid.querySelector('[data-theme-motif]'),null,'Original never substitutes the three shared motifs');
 const positions=cards.flatMap((card,index)=>card.querySelector('.doodle')?[index]:[]);
 assert.deepEqual(positions,[0,4,10,16,22,28,34,40,46,52,58,64,70],'decorations follow displayed job positions despite interleaved advice cards');
 assert.equal(b.grid.querySelectorAll('.doodle').length,positions.length);
 for(const index of positions){
  const doodles=cards[index].querySelectorAll('.doodle');assert.equal(doodles.length,1);
  const doodle=doodles[0],pose=b.app.POSES[(index===0?13:index)%16],svg=doodle.querySelector('svg');
  assert.equal(doodle.getAttribute('class'),'doodle original-doodle');assert.equal(doodle.getAttribute('aria-hidden'),'true');
  assert.equal(doodle.style.position,'absolute');assert.equal(doodle.style.pointerEvents,'none');assert.equal(doodle.style.zIndex,'4');
  for(const edge of ['top','left','right','bottom'])assert.equal(doodle.style[edge],pose.pos[edge],'job '+index+' keeps its '+edge+' placement');
  assert.equal(doodle.style.transform,pose.rot?'rotate('+pose.rot+'deg)':undefined);
  assert(svg);assert.equal(svg.getAttribute('viewBox'),'0 0 64 90');
  assert.equal(svg.getAttribute('width'),String(pose.w));assert.equal(svg.getAttribute('height'),String(Math.round(pose.w*90/64)));
  assert.equal(svg.getAttribute('fill'),'none');assert.equal(svg.getAttribute('stroke'),'#2A2118');assert.equal(svg.getAttribute('stroke-width'),'3');
  assert.equal(svg.getAttribute('stroke-linecap'),'round');assert.equal(svg.getAttribute('stroke-linejoin'),'round');
  assert.equal(svg.style.opacity,'0.78');assert.equal(svg.style.overflow,'visible');
  assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
  const parts=Array.from(pose.parts,part=>part[0]==='c'?{tag:'CIRCLE',attrs:{cx:String(part[1]),cy:String(part[2]),r:String(part[3])}}:{tag:'PATH',attrs:{d:part[1],...(part[2]?{stroke:'#C2552F'}:{})}});
  assert.deepEqual(svg.children.map(node=>({tag:node.tagName,attrs:node.attrs})),parts,'job '+index+' preserves every original shape and accent');
  assert.equal(doodle.querySelector('button,a,input,[tabindex],[data-act],script,image,foreignObject'),null);
 }
});

test('a missing shared-art script retains the existing decoration fallback and working job controls',()=>{
 for(const look of Object.keys(themeArt.themes)){
  const b=board({look,artAvailable:false});b.init(themeJobs(12));
  assert.equal(b.grid.querySelector('[data-theme-motif]'),null);
  assert(b.grid.querySelector('.doodle'),look+' has legacy artwork');
  b.grid.querySelector('[data-act="apply"]').click();
  assert(b.overlay.querySelector('[data-act="detailApply"]'),look+' still opens job details');
 }
});

test('theme feedback does not open or access vote receipts without analytics consent, for admins, or with unavailable choices',()=>{
 const cases=[{}, {personalizationConsent:true}, {analyticsAvailable:false,analyticsConsent:true}, {admin:true,analyticsConsent:true}, {brokenChoices:true,analyticsConsent:true}];
 for(const options of cases){
  const b=board({look:'poker',...options});
  if(options.brokenChoices)b.window.SUAnalytics.choices=()=>{throw new Error('unavailable');};
  b.init(themeJobs(12));b.scrollPastCards(12);b.app.setLook('beauty');b.scrollPastCards(12);
  assert.equal(voteBox(b),null,JSON.stringify(options));
  assert.deepEqual(voteOps(b),[],JSON.stringify(options)+' does not read or write a vote receipt');
  assert.deepEqual(votes(b),[]);
 }
 const original=board({analyticsConsent:true});original.init(themeJobs(12));original.scrollPastCards(12);
 assert.equal(voteBox(original),null,'Original does not ask for a theme vote');assert.deepEqual(voteOps(original),[]);
});

test('opting in later arms the current theme and opens one prompt only after the tenth job has passed',()=>{
 const b=board({look:'poker'});b.init(themeJobs(12));b.scrollPastCards(12);
 assert.equal(voteBox(b),null);assert.deepEqual(voteOps(b),[]);
 b.consent(true);b.scrollPastCards(9);assert.equal(voteBox(b),null);assert.equal(b.localStorage.getItem('su_tv_poker'),null);
 b.scrollPastCards(10);const prompt=voteBox(b);assert(prompt);
 assert.equal(b.localStorage.getItem('su_tv_poker'),'1');
 b.scrollPastCards(12);b.scrollPastCards(12);
 assert.equal(voteBox(b),prompt);assert.equal(b.document.querySelectorAll('[aria-label="Theme feedback"]').length,1);
 assert.equal(voteOps(b).filter(op=>op.op==='set').length,1,'one receipt is written when the prompt appears');
});

test('theme feedback waits while a job dialog is open and can appear after the dialog closes',()=>{
 const b=board({look:'mermaid',analyticsConsent:true});b.init(themeJobs(12));
 b.grid.querySelector('[data-act="apply"]').click();assert(b.document.querySelector('[aria-modal="true"]'));
 b.scrollPastCards(12);assert.equal(voteBox(b),null);assert.equal(b.localStorage.getItem('su_tv_mermaid'),null);
 b.fire('keydown',b.document.activeElement,{key:'Escape'});b.scrollPastCards(12);assert(voteBox(b));
});

test('opening a product modal dismisses existing theme feedback without interpreting it as a vote',()=>{
 for(const state of [{detailOpen:true,detailLink:'https://example.com/theme-test/0'},{modalOpen:true},{lookOpen:true},{feedbackOpen:true,feedbackCo:'Example',feedbackLink:'https://example.com/theme-test/0'}]){
  const b=board({look:'poker',analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);const prompt=voteBox(b);assert(prompt);
  // Direct state transitions cover modal opens that do not originate in an
  // outside pointer click, including return-from-application feedback.
  b.app.setState(state);
  assert.equal(prompt.isConnected,false);assert.equal(voteBox(b),null);
  assert(b.overlay.querySelector('[aria-modal="true"]'),'the requested modal still opens');
  assert.deepEqual(votes(b),[]);
  b.fire('keydown',b.document.activeElement,{key:'Escape'});
  assert.equal(b.overlay.querySelector('[aria-modal="true"]'),null);assert.equal(voteBox(b),null);
  assert.deepEqual(votes(b),[]);
 }
});

test('Escape or an outside click dismisses optional theme feedback without recording a vote',()=>{
 for(const dismiss of ['Escape','outside']){
  const b=board({look:'girly',analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);const prompt=voteBox(b);assert(prompt);
  prompt.children[0].click();assert.equal(voteBox(b),prompt,'a click on the prompt text stays inside');
  if(dismiss==='Escape'){
   const button=prompt.querySelector('button');button.focus();b.fire('keydown',button,{key:'Escape'});
  }else b.document.body.click();
  assert.equal(prompt.isConnected,false,dismiss);assert.equal(voteBox(b),null);assert.deepEqual(votes(b),[]);
  b.scrollPastCards(12);assert.equal(voteBox(b),null,'dismissal remains once per theme');
 }
});

test('opening What’s new dismisses theme feedback and still invokes the welcome flow',()=>{
 const b=board({look:'chess',analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);
 let opened=0;b.window.SUWelcome={open(){opened++;},maybeShow(){}};
 b.grid.querySelector('[data-act="openWelcome"]').click();
 assert.equal(opened,1);assert.equal(voteBox(b),null);assert.deepEqual(votes(b),[]);
});

test('withdrawing analytics closes an open prompt and rejects an already queued vote click',()=>{
 const b=board({look:'noir',analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);
 const prompt=voteBox(b),up=prompt.querySelector('[aria-label="I like this theme"]');
 b.consent(false);assert.equal(voteBox(b),null);assert.equal(prompt.isConnected,false);
 up.click();b.scrollPastCards(12);assert.deepEqual(votes(b),[]);assert.equal(voteBox(b),null);
 b.consent(true);b.scrollPastCards(12);assert.equal(voteBox(b),null,'an already shown theme is not asked twice after a consent change');
});

test('switching themes closes the old prompt and the next vote identifies the newly selected look',()=>{
 const b=board({look:'poker',analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);const prior=voteBox(b);
 b.app.setLook('chess');assert.equal(prior.isConnected,false);assert.equal(voteBox(b),null);
 b.scrollPastCards(12);voteBox(b).querySelector('[aria-label="I don’t like this theme"]').click();
 assert.deepEqual(votes(b),[['themevote','chess','down','']]);
 b.app.setLook('original');assert.equal(voteBox(b),null);b.scrollPastCards(12);assert.equal(voteBox(b),null);
 b.app.setLook('poker');b.scrollPastCards(12);assert.equal(voteBox(b),null,'returning to a shown theme respects its receipt');
});

test('named 44px native vote buttons send each theme and direction exactly once, then dismiss',()=>{
 for(const look of Object.keys(themeArt.themes).filter(key=>key!=='original'))for(const direction of ['up','down']){
  const b=board({look,analyticsConsent:true});b.init(themeJobs(12));b.scrollPastCards(12);const prompt=voteBox(b);assert(prompt,look);
  const up=prompt.querySelector('[aria-label="I like this theme"]'),down=prompt.querySelector('[aria-label="I don’t like this theme"]');
  for(const button of [up,down]){
   assert.equal(button.tagName,'BUTTON');assert.equal(button.getAttribute('type'),'button');
   assert.equal(button.style.minWidth,'44px');assert.equal(button.style.minHeight,'44px');
   button.focus();assert.equal(b.document.activeElement,button,'vote control accepts keyboard focus');
  }
  const selected=direction==='up'?up:down;selected.click();
  assert.deepEqual(votes(b),[['themevote',look,direction,'']]);
  assert.equal(prompt.isConnected,true,'the internal vote click must not bubble into outside dismissal');
  assert.equal(voteBox(b),prompt);assert.match(prompt.textContent,direction==='up'?/yay/:/no worries/);
  b.runTimers(direction==='up'?1300:3400);assert.equal(prompt.isConnected,false);
  selected.click();(direction==='up'?down:up).click();
  assert.deepEqual(votes(b),[['themevote',look,direction,'']],'duplicate or queued clicks do not send another vote');
  b.fireWindow('su:consent-changed');b.scrollPastCards(12);assert.equal(voteBox(b),null,'a shown theme stays suppressed after rerendering');
 }
});

test('ordinary job theme changes retain the established shareable routes',()=>{
 const b=board();b.init();b.location.hash='#saved';
 b.app.setLook('poker');assert.equal(b.location.pathname,'/jobs/casino');assert.equal(b.location.hash,'#saved');
 b.app.setLook('original');assert.equal(b.location.pathname,'/jobs');assert.equal(b.location.hash,'#saved');
});

function viewBoard(options={}) {
 const b=board(options),session=options.session||new Map();b.localStorage.setItem('su_sync_owner',JSON.stringify(options.owner||'alice'));
 b.window.localStorage=b.localStorage;b.window.sessionStorage={getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,String(value)),removeItem:key=>session.delete(key)};
 b.window.setTimeout=setTimeout;b.window.clearTimeout=clearTimeout;b.window.scrollY=456;
 const scrolls=[];b.window.scrollTo=(_x,y)=>scrolls.push(y);
 b.window.SUBoardRuntime=require('../../js/board-runtime.js')(b.window);
 return{...b,session,runtime:b.window.SUBoardRuntime,scrolls};
}
const restoredView={q:'design',cat:'Social',ws:'Remote',pr:'$100K+',st:'NY',fr:'Full-time',savedOnly:true};
const defaultView={q:'',cat:'all',ws:'Any',pr:'Any',st:'all',fr:'Any',savedOnly:false};
function viewFields(state){return Object.fromEntries(Object.keys(defaultView).map(key=>[key,state[key]]));}

test('same-owner auth before or after the feed preserves filters for a Tracker round trip',async()=>{
 const b=viewBoard();b.runtime.save('jobs',restoredView);const pending=b.boot();b.fireWindow('su:auth-changed',{detail:{accountChanged:false}});await pending;
 assert.deepEqual(viewFields(b.app.state),restoredView);b.fireWindow('su:auth-changed',{detail:{accountChanged:false}});
 assert.deepEqual(viewFields(b.app.state),restoredView);assert.equal(b.runtime.read('jobs').state.q,'design');b.fireWindow('pagehide');
 const returned=viewBoard({session:b.session});await returned.boot();returned.fireWindow('su:auth-changed',{detail:{accountChanged:false}});
 assert.deepEqual(viewFields(returned.app.state),restoredView);returned.runTimers(0);assert.deepEqual(returned.scrolls,[456]);
});

test('a real owner change resets only view fields and cannot save the prior query into the new account',async()=>{
 const b=viewBoard();b.runtime.save('jobs',restoredView);await b.boot();b.app.state.look='poker';b.app.state.theme='marketing';
 const old=b.session.get('su_view_jobs');b.localStorage.setItem('su_sync_owner','"bob"');b.fireWindow('pagehide');
 assert.equal(b.session.get('su_view_jobs'),old,'pending callback does not relabel the old receipt');
 b.fireWindow('su:auth-changed',{detail:{accountChanged:false}});
 assert.deepEqual(viewFields(b.app.state),defaultView);assert.equal(b.app.state.look,'poker');assert.equal(b.app.state.theme,'marketing');assert.equal(b.runtime.read('jobs'),null);
 b.runTimers(0);assert.deepEqual(b.scrolls,[],'an old queued scroll cannot run after an owner change');
 b.fireWindow('pagehide');assert.equal(JSON.parse(b.session.get('su_view_jobs')).owner,'"bob"');assert.equal(b.runtime.read('jobs').state.q,'');
});

test('cross-tab logout cancels the prior account search debounce and resets filters',async()=>{
 const b=viewBoard();await b.boot();const input=b.document.getElementById('su-search');input.value='Alice unfinished search';b.fire('input',input);
 b.app.state.savedOnly=true;b.localStorage.setItem('su_sync_owner','null');b.fireWindow('storage',{key:'su_sync_owner'});b.runTimers(140);
 assert.deepEqual(viewFields(b.app.state),defaultView);b.fireWindow('pagehide');assert.equal(b.runtime.read('jobs').state.q,'');
});

test('same-owner view survives an initial feed failure and explicit URL state still takes precedence',async()=>{
 const failed=viewBoard({fetchError:Error('offline')});failed.runtime.save('jobs',restoredView);await failed.boot();failed.fireWindow('su:auth-changed');
 assert.equal(failed.app._loadError,true);assert.deepEqual(viewFields(failed.app.state),restoredView);assert.equal(failed.runtime.read('jobs').state.q,'design');
 for(const address of [{search:'?theme=poker'},{hash:'#shared-role'}]){
  const b=viewBoard({search:address.search||''});b.location.hash=address.hash||'';b.runtime.save('jobs',restoredView);await b.boot();b.fireWindow('su:auth-changed');
  assert.deepEqual(viewFields(b.app.state),defaultView);assert.equal(b.location.search,address.search||'');assert.equal(b.location.hash,address.hash||'');
  if(address.search)assert.equal(b.app.state.theme,'poker');
 }
});
