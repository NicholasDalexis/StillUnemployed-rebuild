const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../js/advice-motion.js'),'utf8');
const Art=require('../../js/advice-illustrations.js');
const stories=vm.runInNewContext('('+source.match(/var stories = (\{[\s\S]*?\n  \});/)[1]+')');
test('each authored sequence addresses real, non-overlapping SVG parts and settles within four seconds',()=>{
 assert.deepEqual(Object.keys(stories).sort(),Art.ids.slice().sort());
 for(const id of Art.ids){
  const html=Art.html(id,false),count=(html.match(/<(?:path|rect|text|circle)\b/g)||[]).length,used=new Set();
  for(const [parts,action,delay,duration] of stories[id]){
   assert(delay+duration<4000,id);assert(duration>0);
   for(const i of parts){assert(i<count,id+' missing shape '+i);assert(!used.has(i),id+' duplicate actor '+i);used.add(i);}
  }
 }
});
function setup(reduce=false){
 let intersect,mutate;const animations=[],events={},mediaEvents={},observed=new Set();
 const shape={matches:()=>true,getTotalLength:()=>100,animate(frames,options){const a={frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:{then(done){a.done=done;}}};animations.push(a);return a;}};
 const card={nodeType:1,dataset:{adviceMotion:'board-trap'},isConnected:true,matches:()=>true,querySelector:()=>null,querySelectorAll:()=>[shape,shape,shape,shape,shape,shape]};
 const body={nodeType:1,matches:()=>false,querySelectorAll:()=>[card]};
 const media={matches:reduce,addEventListener:(n,f)=>mediaEvents[n]=f};
 const document={body,hidden:false,readyState:'complete',addEventListener:(n,f)=>events[n]=f};
 function IO(cb){intersect=cb;this.observe=e=>observed.add(e);this.unobserve=e=>observed.delete(e);}
 function MO(cb){mutate=cb;this.observe=()=>{};}
 vm.runInNewContext(source,{window:{IntersectionObserver:IO,matchMedia:()=>media},Element:{prototype:{animate(){}}},IntersectionObserver:IO,MutationObserver:MO,document,getComputedStyle:()=>({stroke:'#222'}),Map,Array,Number});
 return {animations,card,document,observed,media,events,mediaEvents,enter:()=>intersect([{target:card,isIntersecting:true,intersectionRatio:1}]),leave:()=>intersect([{target:card,isIntersecting:false,intersectionRatio:0}]),remove:()=>{card.isConnected=false;mutate([{addedNodes:[]}]);}};
}
test('offscreen illustrations do no animation work, visible ones play once without looping',()=>{const q=setup();assert.equal(q.animations.length,0);q.enter();assert.equal(q.animations.length,6);for(const a of q.animations){assert.equal(a.options.iterations,1);assert(a.options.delay+a.options.duration<4000);}q.leave();assert(q.animations.every(a=>a.cancelled));q.enter();assert.equal(q.animations.length,6);});
test('reduced motion is static and a changed preference cancels active strokes',()=>{const a=setup(true);a.enter();assert.equal(a.animations.length,0);const b=setup();b.enter();b.media.matches=true;b.mediaEvents.change();assert(b.animations.every(a=>a.cancelled));});
test('hidden tabs and detached cards release animations and observation',()=>{const q=setup();q.enter();q.document.hidden=true;q.events.visibilitychange();assert(q.animations.every(a=>a.cancelled));q.remove();assert.equal(q.observed.size,0);});
test('completed animation effects are removed so static artwork remains the final frame',()=>{const q=setup();q.enter();q.animations.forEach(a=>a.done());assert(q.animations.every(a=>a.cancelled));});
