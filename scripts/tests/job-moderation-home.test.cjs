const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Identity=require('../../js/job-identity.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const link='https://example.com/job';
const csv='Company,Job Title,Link,Salary,Active/Dead,Pick\nExample,Designer,https://example.com/job,$90K,Active,Featured';
function home(){
 let subscriber,resolveIndex,rejectIndex,requests=0,removed=false;
 const gate=new Promise((resolve,reject)=>{resolveIndex=resolve;rejectIndex=reject;});
 class Element {constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.listeners={};this.slots=Array.from({length:7},()=>({textContent:''}));}appendChild(el){this.children.push(el);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,fn){this.listeners[k]=fn;}set innerHTML(value){this.children=[];this.textContent='';}querySelectorAll(){return this.slots;}}
 const total=new Element('span'),featured=new Element('div'),events={};
 const moderation={refresh:()=>gate,filter:jobs=>removed?[]:jobs,subscribe:callback=>{subscriber=callback;},watch:()=>()=>{}};
 const document={readyState:'loading',body:{},addEventListener:(event,callback)=>events[event]=callback,querySelector:selector=>selector==='#nh-total'?total:selector==='#nh-featured'?featured:null,querySelectorAll:()=>[],getElementById:id=>id==='hero-desktop'?{}:null,createElement:tag=>new Element(tag)};
 const sandbox={window:{SUJobIdentity:Identity,SUJobModeration:moderation,addEventListener(){}},document,URL,btoa:text=>Buffer.from(text,'binary').toString('base64'),fetch:async()=>{requests++;return{ok:true,text:async()=>csv};},setInterval:()=>1,clearInterval(){},console:{warn(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js/home.js'),'utf8'),sandbox,{filename:'js/home.js'});
 events.DOMContentLoaded();
 return {total,featured,moderation,ready:resolveIndex,fail:rejectIndex,requests:()=>requests,remove:()=>removed=true,update:value=>subscriber(value)};
}

test('homepage never renders source roles before availability is ready, and removed identities stay off featured cards',async()=>{
 const h=home();await tick();assert.equal(h.featured.children.length,0);h.remove();h.ready({status:'ready',revision:1});await tick();await tick();
 assert.equal(h.total.textContent,'0');assert.equal(h.featured.children.length,0);assert.match(h.featured.textContent,/No roles available/);
});

test('homepage availability error offers explicit retry and recovers by reading the live source again',async()=>{
 const h=home();h.fail(Error('offline'));await tick();await tick();
 assert.equal(h.total.textContent,'…');assert.equal(h.featured.children[0].attrs.role,'status');assert.match(h.featured.children[0].textContent,/Could not check/);
 assert.equal(h.featured.children[1].tagName,'button');h.moderation.refresh=async()=>({status:'ready',revision:0});
 h.update({status:'ready',revision:0});await tick();await tick();assert.equal(h.requests(),2);assert.equal(h.total.textContent,'1');
 const href=new URL(h.featured.children[0].href,'https://preview--stillunemployed.netlify.app');assert.equal(href.pathname,'/jobs.html');assert.equal(Buffer.from(href.searchParams.get('job'),'base64').toString(),link);
 h.update({status:'error',revision:0});assert.equal(h.featured.children[0].tagName,'p');assert.equal(h.total.textContent,'…');
});
