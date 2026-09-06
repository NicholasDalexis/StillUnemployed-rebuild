const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../js/ga.js'),'utf8');
const ANALYTICS='su_consent_v3', PERSONALIZATION='su_personalization_v1';

// Small offline adapter for the real privacy script's DOM, storage and events.
// It models focus and hidden ancestors, not layout or a browser's rendering.
function privacy({values={},gpc=false,readBlocked=false,writeMode='normal',reset,readyState='complete'}={}) {
 let document;
 class Element {
  constructor(tag,attrs={}) { this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.listeners={};this.parentNode=null;this.style={};this.text='';this.checked=false;this.disabled=false;this.hidden=false; }
  get id(){return this.attrs.id;}set id(value){this.attrs.id=value;}
  get className(){return this.attrs.class||'';}set className(value){this.attrs.class=value;}
  get isConnected(){return this===document.body||this===document.head||!!this.parentNode?.isConnected;}
  get firstChild(){return this.children[0]||null;}get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
  setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}
  appendChild(child){return this.insertBefore(child,null);}
  insertBefore(child,before){child.remove();const i=before?this.children.indexOf(before):this.children.length;assert(i>=0);this.children.splice(i,0,child);child.parentNode=this;return child;}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
  contains(child){for(let node=child;node;node=node.parentNode)if(node===this)return true;return false;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatch(type,extra={}){const event={target:this,currentTarget:this,preventDefault(){this.defaultPrevented=true;},...extra};return {event,results:(this.listeners[type]||[]).map(fn=>fn(event))};}
  click(){if(this.disabled)return {results:[]};this.focus();return this.dispatch('click');}
  focus(){document.activeElement=this;}scrollIntoView(){this.scrolled=true;}
  getClientRects(){if(!this.isConnected)return [];for(let node=this;node;node=node.parentNode)if(node.hidden||node.style.display==='none')return [];return [{}];}
  getBoundingClientRect(){return {height:this.getClientRects().length?(this.boxHeight??96):0};}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();const tag=part.match(/^[a-z]+/i);if(tag&&tag[0].toUpperCase()!==this.tagName)return false;for(const cls of part.matchAll(/\.([\w-]+)/g))if(!this.className.split(/\s+/).includes(cls[1]))return false;for(const attr of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(this.getAttribute(attr[1])===null||(attr[2]!==undefined&&this.getAttribute(attr[1])!==attr[2]))return false;return true;});}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}set textContent(value){this.text=String(value);this.children.forEach(child=>{child.parentNode=null;});this.children=[];}
  set innerHTML(html){this.textContent='';const stack=[this];for(const token of html.matchAll(/<\/?[\w-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)){const raw=token[0];if(raw[0]!=='<'){stack.at(-1).text+=raw;continue;}const name=raw.match(/^<\/?([\w-]+)/)[1];if(raw.startsWith('</')){let i=stack.length-1;while(i>0&&stack[i].tagName!==name.toUpperCase())i--;if(i>0)stack.length=i;continue;}const attrs={};for(const match of raw.slice(name.length+1,-1).matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[match[1]]=match[2]??match[3]??match[4]??'';const child=stack.at(-1).appendChild(new Element(name,attrs));if(!['INPUT','BR','IMG','HR'].includes(child.tagName))stack.push(child);}}
 }
 const listeners={},windowListeners={},observers=[],events=[],writes=[],state={...values},navigator={globalPrivacyControl:gpc};
 const storage={getItem(key){if(readBlocked)throw Error('Storage blocked');return state[key]??null;},setItem(key,value){writes.push([key,value]);if(writeMode==='blocked'||writeMode===key)throw Error('Storage blocked');if(writeMode!=='silent')state[key]=value;}};
 document={readyState,createElement:tag=>new Element(tag),getElementById(id){return [this.head,this.body,...this.head.querySelectorAll('*'),...this.body.querySelectorAll('*')].find(el=>el.id===id)||null;},querySelectorAll(selector){return this.body.querySelectorAll(selector);},addEventListener(type,fn){(listeners[type]??=[]).push(fn);}};
 document.documentElement={style:{setProperty(key,value){this[key]=value;}}};
 document.head=new Element('head');document.body=new Element('body');const home=document.body.appendChild(new Element('a',{href:'/index.html'}));home.textContent='Home';document.activeElement=home;
 const window={addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);},dispatchEvent(event){events.push(event.type);},SUAnalytics:reset?{reset}:undefined};
 vm.runInNewContext(source,{window,document,navigator,localStorage:storage,ResizeObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}},CustomEvent:class {constructor(type){this.type=type;}}},{filename:'js/ga.js'});
 const query=selector=>document.body.querySelector(selector), click=selector=>{const el=query(selector);assert(el,selector);return el.click();};
 return {document,window,navigator,state,writes,events,home,query,click,observers,reserve:()=>document.documentElement.style['--su-mobile-notice-height'],resize(){for(const fn of windowListeners.resize||[])fn();},boot(){for(const fn of listeners.DOMContentLoaded||[])fn();},open(fromFooter=false){click(fromFooter?'.su-privacy-settings':'.su-cc-choose');return query('.su-cc-details');}};
}

function choices(h){return [h.state[ANALYTICS],h.state[PERSONALIZATION]];}

test('fresh visit shows only a compact notice; it creates no choices, checkbox panel or consent events',()=>{
 const h=privacy({readyState:'loading'});assert.equal(h.query('.su-cc-notice'),null);assert.equal(h.writes.length,0);h.boot();
 assert(h.query('.su-cc-notice'));assert(h.query('.su-privacy-settings'));assert.equal(h.query('.su-cc-details'),null);assert.equal(h.query('input'),null);assert.equal(h.document.activeElement,h.home);assert.deepEqual(h.state,{});assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);
 assert.equal(h.reserve(),'96px');assert.equal(h.observers[0].target,h.query('.su-cc-notice'));h.query('.su-cc-notice').boxHeight=120.2;h.resize();assert.equal(h.reserve(),'121px');
});

test('No thanks declines both options and removes the notice only after confirmed storage',()=>{
 const h=privacy();h.click('.su-cc-decline');assert.deepEqual(choices(h),['denied','denied']);assert.equal(h.query('.su-cc-notice'),null);assert.deepEqual(h.events,['su:consent-changed']);assert.equal(h.document.activeElement,h.home);assert.equal(h.reserve(),'0px');assert.equal(h.observers[0].disconnected,true);
 const reload=privacy({values:h.state});assert.equal(reload.query('.su-cc-notice'),null);assert(reload.query('.su-privacy-settings'));
});

test('Allow optional grants both only after explicit activation',()=>{
 const h=privacy();assert.deepEqual(choices(h),[undefined,undefined]);h.click('.su-cc-accept');assert.deepEqual(choices(h),['granted','granted']);assert.equal(h.query('.su-cc-notice'),null);assert.deepEqual(h.events,['su:consent-changed']);
});

for(const [analytics,personalization]of [[true,false],[false,true],[false,false],[true,true]])test(`detailed choices save independently: analytics=${analytics}, personalization=${personalization}`,()=>{
 const h=privacy(),panel=h.open();assert.equal(h.document.activeElement,panel);assert.equal(h.query('.su-cc-notice').hidden,true);assert.equal(h.reserve(),'0px');assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);
 const a=panel.querySelector('[name="analytics"]'),p=panel.querySelector('[name="personalization"]');assert.equal(a.checked,false);assert.equal(p.checked,false);a.checked=analytics;p.checked=personalization;h.click('.su-cc-save');
 assert.deepEqual(choices(h),[analytics?'granted':'denied',personalization?'granted':'denied']);assert.equal(h.query('.su-cc-details'),null);assert.equal(h.query('.su-cc-notice'),null);assert.equal(h.document.activeElement,h.home);
});

test('X and Escape discard unsaved checkbox changes without any consent and return focus to the opener',()=>{
 const h=privacy();for(const close of ['x','escape']){const opener=h.query('.su-cc-choose'),panel=h.open();panel.querySelector('[name="analytics"]').checked=true;panel.querySelector('[name="personalization"]').checked=true;
  if(close==='x')h.click('.su-cc-close');else assert.equal(panel.dispatch('keydown',{key:'Escape'}).event.defaultPrevented,true);
  assert.equal(h.query('.su-cc-details'),null);assert.equal(h.query('.su-cc-notice').hidden,false);assert.equal(h.reserve(),'96px');assert.equal(h.document.activeElement,opener);assert.deepEqual(h.state,{});assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);
 }
});

test('saved choices reopen accurately; closing preserves them and the footer focus target',()=>{
 const h=privacy({values:{[ANALYTICS]:'granted',[PERSONALIZATION]:'denied'}}),opener=h.query('.su-privacy-settings'),panel=h.open(true);
 assert.equal(panel.querySelector('[name="analytics"]').checked,true);assert.equal(panel.querySelector('[name="personalization"]').checked,false);
 panel.querySelector('[name="personalization"]').checked=true;h.click('.su-cc-close');assert.deepEqual(choices(h),['granted','denied']);assert.equal(h.document.activeElement,opener);assert.deepEqual(h.writes,[]);
});

test('detailed No thanks revokes both previously granted options',()=>{
 const h=privacy({values:{[ANALYTICS]:'granted',[PERSONALIZATION]:'granted'}});h.open(true);h.click('.su-cc-decline');assert.deepEqual(choices(h),['denied','denied']);assert.equal(h.query('.su-cc-details'),null);assert.equal(h.document.activeElement,h.query('.su-privacy-settings'));
});

test('GPC keeps analytics disabled while recommendations remain an independent explicit choice',()=>{
 const h=privacy({gpc:true});assert.match(h.query('.su-cc-accept').textContent,/recommendations/i);assert.deepEqual(h.writes,[]);h.click('.su-cc-accept');assert.deepEqual(choices(h),['denied','granted']);
 const saved=privacy({gpc:true,values:{[ANALYTICS]:'granted',[PERSONALIZATION]:'denied'}}),panel=saved.open(true);const a=panel.querySelector('[name="analytics"]');assert.equal(a.disabled,true);assert.equal(a.checked,false);assert.match(panel.querySelector('[role="status"]').textContent,/browser privacy signal/i);panel.querySelector('[name="personalization"]').checked=true;a.checked=true;saved.click('.su-cc-save');assert.deepEqual(choices(saved),['denied','granted']);
 const changed=privacy();changed.navigator.globalPrivacyControl=true;changed.click('.su-cc-accept');assert.deepEqual(choices(changed),['denied','granted'],'the save rechecks GPC even after the notice was built');
});

test('blocked and silently rejected storage leave an honest error, useful controls and no false persisted consent',()=>{
 for(const writeMode of ['blocked','silent']){const h=privacy({writeMode});h.click('.su-cc-accept');assert.deepEqual(h.state,{});assert(h.query('.su-cc-notice'));assert.match(h.query('[role="status"]').textContent,/couldn’t save both choices/);h.open();h.query('[name="analytics"]').checked=true;h.click('.su-cc-save');assert(h.query('.su-cc-details'));assert.match(h.query('.su-cc-details').querySelector('[role="status"]').textContent,/couldn’t save both choices/);h.click('.su-cc-close');assert.equal(h.query('.su-cc-notice').hidden,false);}
 const blocked=privacy({readBlocked:true,writeMode:'blocked'});assert(blocked.query('.su-cc-notice'));assert.doesNotThrow(()=>blocked.open());assert.equal(blocked.query('[name="analytics"]').checked,false);
});

test('partial storage failure reports failure and keeps details available for correction',()=>{
 const h=privacy({writeMode:PERSONALIZATION});h.open();h.query('[name="personalization"]').checked=true;h.click('.su-cc-save');assert.deepEqual(choices(h),['denied',undefined]);assert(h.query('.su-cc-details'));assert.match(h.query('.su-cc-details').querySelector('[role="status"]').textContent,/couldn’t save both choices/);assert.deepEqual(h.events,['su:consent-changed']);
});

test('Reset history awaits completion, restores the button and never changes consent or saved/tracker data',async()=>{
 let finish,calls=0;const pending=new Promise(resolve=>{finish=resolve;});const values={[ANALYTICS]:'denied',[PERSONALIZATION]:'granted',su_saved_jobs:'saved fixture',su_tracker:'tracker fixture'};
 const h=privacy({values,reset(){calls++;return pending;}}),panel=h.open(true),button=panel.querySelector('.su-cc-reset');const result=button.click();assert.equal(button.disabled,true);assert.match(panel.querySelector('[role="status"]').textContent,/Resetting/);button.click();assert.equal(calls,1);finish();await Promise.all(result.results);
 assert.equal(button.disabled,false);assert.match(panel.querySelector('[role="status"]').textContent,/History reset/);assert.deepEqual(h.state,values);assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);assert(h.query('.su-cc-details'));
});

test('Reset history failure or missing client shows a retryable error without claiming success',async()=>{
 for(const reset of [undefined,async()=>{throw Error('Reset could not finish. Please try again.');}]){const h=privacy({reset}),panel=h.open();const result=h.click('.su-cc-reset');await Promise.all(result.results);const feedback=panel.querySelector('[role="status"]').textContent;assert.match(feedback,/try again/);assert.doesNotMatch(feedback,/History reset/);assert.equal(panel.querySelector('.su-cc-reset').disabled,false);assert.deepEqual(h.state,{});}
});
