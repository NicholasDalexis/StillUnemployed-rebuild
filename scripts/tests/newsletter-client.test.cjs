const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../../js/newsletter-attribution.js'),'utf8');
const BASE='https://subscribe-forms.beehiiv.com/af2e314d-125f-431d-a8e0-0020be04d97c';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function harness({consent=true,excluded=false,mode='ok',origin='https://preview--stillunemployed.netlify.app'}={}){
 const storage={},session={},events=[],requests=[],issued=[],listeners={},observers=[],timers=[],liveFrames=[],confirmed=[];let activeConsent=consent;
 const doc={hidden:false,activeElement:null,querySelectorAll:()=>liveFrames};
 const win={location:{origin,href:origin+'/jobs.html?theme=beauty'},sessionStorage:{getItem:k=>session[k]||null,setItem:(k,v)=>{session[k]=v;},removeItem:k=>{delete session[k];}},SUNewsletterSuccess:{open:frame=>confirmed.push(frame)},crypto:crypto.webcrypto,SUAnalytics:{choices:()=>({analytics:activeConsent}),excluded:()=>excluded,emit:(name,params)=>events.push({name,...params}),newsletterRequest:async(token,context,signal)=>{issued.push({token,context});if(mode==='fail')throw Error('offline');if(mode==='timeout')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));return {campaign:'su_'+token,jobId:context.link?'b'.repeat(64):undefined};}},addEventListener:(n,f)=>{listeners[n]=f;}};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(frame){this.frame=frame;}disconnect(){this.disconnected=true;}}
 win.IntersectionObserver=Observer;
 vm.runInNewContext(source,{window:win,document:doc,URL,Uint8Array,AbortController,IntersectionObserver:Observer,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};}});
 return {win,doc,storage,session,events,requests,issued,observers,timers,confirmed,listeners,liveFrames,load:(frame,context={placement:'advice',cta:'N01',exposure:1})=>{liveFrames.push(frame);win.SUNewsletter.load(frame,BASE,context);},consent:value=>{activeConsent=value;listeners['su:consent-changed']();},auth:()=>listeners['su:auth-changed']({detail:{accountChanged:true}}),blur:frame=>{doc.activeElement=frame;listeners.blur();timers.filter(t=>t.ms===0).forEach(t=>t.fn());}};
}
test('production and preview overlay signup context survives the complete parent-tab callback without analytics consent',async()=>{
 const receipt=fs.readFileSync(require.resolve('../../js/newsletter-confirmed.js'),'utf8');
 for(const origin of ['https://stillunemployed.com','https://www.stillunemployed.com','https://preview--stillunemployed.netlify.app']){
  const h=harness({origin,consent:false}),context={placement:'job-detail',link:'https://example.com/job?id=9',cta:'N01',exposure:1},frame={isConnected:true,closest:selector=>selector==='#overlay-root'?{}:null};
  h.load(frame,context);await turn();
  const saved=JSON.parse(h.session.su_newsletter_return_v1);assert.equal(saved.url,h.win.location.href);assert.deepEqual(saved.context,context);
  assert.equal(h.confirmed.length,0,'loading a form never confirms a signup');assert.equal(h.issued.length,0);assert.deepEqual(h.storage,{});assert.deepEqual(h.events,[]);
  const visited=[],documentElement={hidden:false},win={sessionStorage:h.win.sessionStorage,document:{documentElement},location:{origin,replace:url=>{assert.equal(documentElement.hidden,true);visited.push(url);}}};win.parent=win;
  vm.runInNewContext(receipt,{window:win,URL,Date,btoa,unescape,encodeURIComponent});
  assert.equal(visited.length,1);const restored=new URL(visited[0]);assert.equal(restored.origin,origin);assert.equal(restored.pathname,'/jobs.html');assert.equal(restored.searchParams.get('theme'),'beauty');assert.equal(atob(restored.searchParams.get('job')),context.link);
  assert.deepEqual(JSON.parse(h.session.su_newsletter_resume_v1).context,context);assert.equal(h.session.su_newsletter_return_v1,undefined);
 }
});
test('newsletter return markers reject unknown origins, insecure hosts and hostname lookalikes',async()=>{
 for(const origin of ['https://evil.invalid','https://stillunemployed.com.evil.invalid','https://preview--stillunemployed.netlify.app.evil.invalid','http://stillunemployed.com','http://localhost:8054','https://stillunemployed.netlify.app']){
  const h=harness({origin,consent:false}),frame={isConnected:true,closest:()=>({})};h.load(frame);await turn();h.blur(frame);
  assert.deepEqual(h.session,{},origin);assert.equal(h.confirmed.length,0);assert.deepEqual(h.events,[]);
 }
});
test('denied, QA and excluded browsing load the original form with no attribution requests or IDs',async()=>{for(const opts of [{consent:false},{excluded:true}]){const h=harness(opts),frame={isConnected:true};h.load(frame);await turn();assert.equal(frame.src,BASE);assert.equal(h.issued.length,0);assert.deepEqual(h.storage,{});assert.deepEqual(h.events,[]);}});
test('tracked form carries only source and opaque receipt, counts actual visible exposure and focus separately',async()=>{const h=harness(),frame={isConnected:true};h.load(frame,{placement:'job-detail',cta:'N16',link:'https://example.invalid/job',exposure:1});await turn();const url=new URL(frame.src);assert.equal(url.searchParams.get('utm_source'),'stillunemployed');assert.match(url.searchParams.get('utm_campaign'),/^su_[a-f0-9]{64}$/);assert.doesNotMatch(frame.src,/example.invalid|N16|email/);assert.equal(h.events.length,0);h.observers[0].callback([{isIntersecting:true,intersectionRatio:0.49}]);assert.equal(h.events.length,0);h.observers[0].callback([{isIntersecting:true,intersectionRatio:0.8}]);h.blur(frame);h.blur(frame);assert.deepEqual(h.events.map(e=>e.name),['newsletter_impression','newsletter_engagement']);assert.equal(h.events[0].cta,'N16');assert.equal(h.events[0].revision,2);assert.equal(h.events.some(e=>e.name==='newsletter_confirmed'),false);});
test('rerenders and retries reuse one receipt and do not add duplicate visible exposures',async()=>{const h=harness(),frame={isConnected:true};h.load(frame);await turn();h.observers[0].callback([{isIntersecting:true,intersectionRatio:1}]);const next={isConnected:true};h.load(next);await turn();assert.equal(h.issued.length,1);assert.equal(frame.src,next.src);assert.equal(h.events.length,1);});
test('measurement failure and timeout still load a functioning plain form',async()=>{for(const mode of ['fail','timeout']){const h=harness({mode}),frame={isConnected:true};h.load(frame);if(mode==='timeout')h.timers.find(t=>t.ms===1200).fn();await turn();assert.equal(frame.src,BASE);assert.equal(h.events.length,0);}});
test('withdrawal revokes existing receipts; opting back in cannot attribute focus on an old form',async()=>{const h=harness(),frame={isConnected:true};h.load(frame);await turn();h.consent(false);await turn();assert.equal(h.requests[0].body.action,'revoke');assert.equal(h.requests[0].body.tokens.length,1);assert.deepEqual(h.storage,{});h.consent(true);h.blur(frame);assert.equal(h.events.length,0);});
test('account change revokes issued context and in-flight load cannot keep attribution',async()=>{const h=harness(),frame={isConnected:true};h.load(frame);h.auth();await turn();assert.equal(frame.src,BASE);assert.equal(h.events.length,0);assert.ok(h.requests.some(r=>r.body.action==='revoke'));});
test('detached form does not start a provider request',async()=>{const h=harness(),frame={isConnected:false};h.load(frame);await turn();assert.equal(frame.src,undefined);});

test('confirmation accepts only same-origin success receipt from the connected frame',async()=>{
 const h=harness({consent:false}),source={postMessage(){}},frame={isConnected:true,contentWindow:source,style:{}};h.load(frame);await turn();
 const message=(data,origin='https://preview--stillunemployed.netlify.app',from=source)=>h.listeners.message({origin,source:from,data});
 for(const event of ['iframe.form_view','iframe.form_submit','iframe.subscription_created'])message({event},'https://subscribe-forms.beehiiv.com');
 message({type:'su:newsletter-confirmed',path:'/newsletter-confirmed.html'},'https://evil.invalid');
 message({type:'su:newsletter-confirmed',path:'/newsletter-confirmed.html'},undefined,{});
 message({type:'su:newsletter-confirmed',path:'/other.html'});assert.equal(h.confirmed.length,0);
 message({type:'su:newsletter-confirmed',path:'/newsletter-confirmed.html'});
 message({type:'su:newsletter-confirmed',path:'/newsletter-confirmed.html'});
 assert.equal(h.confirmed.length,1);assert.equal(h.confirmed[0],frame);assert.equal(h.events.length,0,'UI feedback is not a webhook-confirmed analytics conversion');
 const next={isConnected:false,contentWindow:{},style:{}};h.load(next);message('iframe.subscription_created',undefined,next.contentWindow);assert.equal(h.confirmed.length,1);
});
test('receipt page sends only its fixed success message to a same-origin parent',()=>{
 const receipt=fs.readFileSync(require.resolve('../../js/newsletter-confirmed.js'),'utf8'),sent=[];
 const parent={postMessage:(...args)=>sent.push(args)},win={parent,location:{origin:'https://preview--stillunemployed.netlify.app'}};
 vm.runInNewContext(receipt,{window:win});assert.equal(sent.length,1);
 assert.equal(sent[0][0].type,'su:newsletter-confirmed');assert.equal(sent[0][0].path,'/newsletter-confirmed.html');
 assert.equal(sent[0][1],win.location.origin);
 sent.length=0;win.parent=win;vm.runInNewContext(receipt,{window:win});assert.equal(sent.length,0);
});
test('Beehiiv parent-tab redirect restores the exact board and selected job after success',()=>{
 const receipt=fs.readFileSync(require.resolve('../../js/newsletter-confirmed.js'),'utf8'),storage={
  su_newsletter_return_v1:JSON.stringify({at:Date.now(),url:'https://preview--stillunemployed.netlify.app/jobs.html?theme=beauty',context:{placement:'job-detail',link:'https://example.com/job?id=9'}})
 },visited=[];
 const sessionStorage={getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}};
 const documentElement={hidden:false};
 const win={document:{documentElement},sessionStorage,location:{origin:'https://preview--stillunemployed.netlify.app',replace:url=>{assert.equal(documentElement.hidden,true,'success receipt fallback is hidden before navigation');visited.push(url);}}};win.parent=win;
 vm.runInNewContext(receipt,{window:win,URL,Date,btoa,unescape,encodeURIComponent});
 assert.equal(visited.length,1);const url=new URL(visited[0]);assert.equal(url.pathname,'/jobs.html');assert.equal(url.searchParams.get('theme'),'beauty');
 assert.equal(atob(url.searchParams.get('job')),'https://example.com/job?id=9');
 assert.equal(JSON.parse(storage.su_newsletter_resume_v1).context.placement,'job-detail');assert.equal(storage.su_newsletter_return_v1,undefined);
});
test('invalid callback returns preserve a visible fallback and cannot navigate or confirm',()=>{
 const receipt=fs.readFileSync(require.resolve('../../js/newsletter-confirmed.js'),'utf8');
 const valid={at:Date.now(),url:'https://preview--stillunemployed.netlify.app/jobs.html',context:{placement:'job-detail',link:'https://example.com/job'}};
 const invalid=[null,'not JSON',{...valid,url:'https://evil.invalid/jobs.html'},{...valid,url:'https://preview--stillunemployed.netlify.app/tracker.html'},
  {...valid,at:Date.now()-600001},{...valid,at:Date.now()+60000},{...valid,at:'bad date'},{...valid,context:{placement:'unknown'}}];
 for(const saved of invalid){
  const visited=[],documentElement={hidden:false},storage={su_newsletter_return_v1:typeof saved==='string'?saved:JSON.stringify(saved)};
  const win={document:{documentElement},sessionStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},location:{origin:'https://preview--stillunemployed.netlify.app',replace:url=>visited.push(url)}};win.parent=win;
  vm.runInNewContext(receipt,{window:win,URL,Date,btoa,unescape,encodeURIComponent});
  assert.equal(visited.length,0);assert.equal(storage.su_newsletter_resume_v1,undefined);assert.equal(documentElement.hidden,false,'invalid return retains the usable fallback');
 }
});
function successHarness({marker,storage:sharedStorage}={}){
 const storage=sharedStorage||{};
 if(marker!==undefined)storage.su_newsletter_resume_v1=typeof marker==='string'?marker:JSON.stringify(marker);
 const frames=[],dialogs=[],focused=[],events=[],docListeners={};let action=null;
 function control(name){return {handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},focus(){focused.push(name);}};}
 const heading=control('success heading'),closeButton=control('success close'),gmail=control('gmail');
 const doc={readyState:'loading',body:{appendChild(node){node.isConnected=true;}},documentElement:{hidden:false},
  addEventListener:(name,fn)=>{docListeners[name]=fn;},
  createElement(tag){assert.equal(tag,'dialog');const handlers={},attributes={};const dialog={open:false,isConnected:false,showCount:0,handlers,attributes,
   setAttribute:(key,value)=>{attributes[key]=value;},removeAttribute:key=>{delete attributes[key];},querySelector:selector=>selector==='button'?closeButton:selector==='a'?gmail:heading,
   addEventListener:(name,fn)=>{handlers[name]=fn;},
   showModal(){this.open=true;this.showCount++;},
   close(){if(!this.open)return;this.open=false;if(handlers.close)handlers.close();}};
   dialogs.push(dialog);return dialog;},
  querySelectorAll:()=>frames,querySelector:()=>action};
 const win={document:doc,location:{origin:'https://preview--stillunemployed.netlify.app'},navigator:{userAgent:'Mozilla/5.0',platform:'MacIntel',maxTouchPoints:0},
  sessionStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},
  SUAnalytics:{emit:(...args)=>events.push(args)},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../js/newsletter-success.js'),'utf8'),{window:win,Date,Array,URL,Number});
 const api=win.SUNewsletterSuccess;
 function job(link){
  const note={isConnected:true,focus(){focused.push('job note');},closest(){return null;}};
  action={getAttribute:()=>link,closest:()=>note};return note;
 }
 function inline(context){
  const note={isConnected:true,focus(){focused.push('inline note');}},capture={hidden:false};
  const frame={isConnected:true,getAttribute:()=>JSON.stringify(context),closest:selector=>selector==='[data-newsletter-id]'?capture:note};
  frames.push(frame);return {frame,note,capture};
 }
 return {api,storage,dialogs,focused,events,job,inline,closeButton,gmail,doc};
}
const resumeJob={placement:'job-detail',link:'https://example.com/job'};
function successMarker(context=resumeJob){return {at:Date.now(),context};}

test('return confirmation opens immediately while the job feed is still unavailable',()=>{
 const h=successHarness({marker:successMarker()});
 assert.equal(h.dialogs.length,1);
 assert.equal(h.api.isOpen(),true,'the first render cannot wait for a catalog or iframe');
 assert.equal(h.api.confirmed(),true);
 assert.equal(h.storage.su_newsletter_resume_v1,undefined,'a reload cannot replay the receipt');
 assert.equal(h.api.pendingContext().link,resumeJob.link,'job restoration still needs its original context');
 h.api.tryResume();h.api.tryResume();
 assert.equal(h.dialogs[0].open,true,'slow, failed or absent feed never hides the confirmed signup');
 assert.equal(h.dialogs[0].showCount,1);
 assert.deepEqual(h.events,[],'UI confirmation never invents an analytics conversion');
 assert.match(h.dialogs[0].innerHTML,/<h2 id="su-newsletter-title" tabindex="-1">Welcome email sent!<\/h2>/);
 assert.match(h.dialogs[0].innerHTML,/<p id="su-newsletter-message">Check promotions or spam folder!<\/p>/);
 assert.match(h.dialogs[0].innerHTML,/Let’s go .*<p class="su-newsletter-success-ps">p\.s <span>Free Resume<\/span> template attached<\/p>/);
});
test('a delayed matching job attaches beneath the existing confirmation without reopening or moving focus',()=>{
 const h=successHarness({marker:successMarker()});
 h.job('https://example.com/unrelated');h.api.tryResume();
 assert.equal(h.api.pendingContext().link,resumeJob.link,'an unrelated modal must not consume the return');
 h.job(resumeJob.link);const focusBefore=h.focused.length;h.api.tryResume();h.api.tryResume();
 assert.equal(h.api.pendingContext(),null);
 assert.equal(h.dialogs[0].showCount,1);
 assert.equal(h.focused.length,focusBefore,'restoring background content cannot steal focus from confirmation');
 h.dialogs[0].close();assert.equal(h.api.isOpen(),false);
 assert.equal(h.focused.at(-1),'job note','closing confirmation returns to the restored job');
});
test('dismissing confirmation before a slow job returns cannot reopen it',()=>{
 const h=successHarness({marker:successMarker()});
 h.closeButton.handlers.click();assert.equal(h.api.isOpen(),false);
 assert.equal(h.api.pendingContext().link,resumeJob.link);
 h.job(resumeJob.link);h.api.tryResume();h.api.tryResume();
 assert.equal(h.dialogs[0].showCount,1);assert.equal(h.api.isOpen(),false);
 assert.equal(h.api.pendingContext(),null);
 assert.equal(h.api.confirmed(),true);
});
test('confirmation remains dismissible when a removed job or failed feed cannot restore a note',()=>{
 const h=successHarness({marker:successMarker()});
 h.api.tryResume();h.closeButton.handlers.click();h.api.tryResume();
 assert.equal(h.api.isOpen(),false);assert.equal(h.dialogs[0].showCount,1);
 const reloaded=successHarness({storage:h.storage});
 assert.equal(reloaded.dialogs.length,0,'failed restoration cannot replay success on a later ordinary load');
 assert.equal(reloaded.api.confirmed(),false);
});
test('advice and signup returns retain their underlying note and hide the completed form',()=>{
 for(const context of [{placement:'advice',noteId:'resume-layout'},{placement:'signup-card'}]){
  const h=successHarness({marker:successMarker(context)}),restored=h.inline(context);
  h.api.tryResume();assert.equal(restored.capture.hidden,true);assert.equal(h.api.pendingContext(),null);
  assert.equal(h.dialogs[0].showCount,1);assert.equal(h.api.isOpen(),true);
  h.dialogs[0].close();assert.equal(h.focused.at(-1),'inline note');
 }
});
test('ordinary, malformed, expired and future markers do not display or confirm a signup',()=>{
 const invalid=[undefined,'not JSON',{at:Date.now()},successMarker({placement:'unknown'}),
  {at:Date.now()-600001,context:resumeJob},{at:Date.now()+60000,context:resumeJob},
  {at:'bad date',context:resumeJob},{context:resumeJob}];
 for(const marker of invalid){
  const h=successHarness({marker});h.api.tryResume();
  assert.equal(h.dialogs.length,0,JSON.stringify(marker));assert.equal(h.api.isOpen(),false);
  assert.equal(h.api.pendingContext(),null);assert.equal(h.api.confirmed(),false);assert.deepEqual(h.events,[]);
 }
});
test('an inline success hides the completed signup while keeping its note available',()=>{
 const h=successHarness(),restored=h.inline({placement:'advice',noteId:'resume-layout'});
 h.api.open(restored.frame);
 assert.equal(h.api.isOpen(),true);assert.equal(restored.capture.hidden,true);assert.equal(h.api.confirmed(),true);
 h.dialogs[0].close();assert.equal(h.focused.at(-1),'inline note');
});
test('provider handshake and bounded resize do not confirm a signup',async()=>{
 const h=harness(),sent=[],source={postMessage:(...x)=>sent.push(x)},frame={isConnected:true,contentWindow:source,style:{}};h.load(frame);await turn();
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:'childReady'});assert.equal(sent[0][0],'parentReady');
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:{type:'beehiiv:styles',payload:{height:'120px'}}});assert.equal(frame.style.height,'120px');
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:{type:'beehiiv:styles',payload:{height:'200000px'}}});assert.equal(frame.style.height,'120px');assert.equal(h.confirmed.length,0);
});

test('success return scripts run before their pages can paint fallback or board content',()=>{
 const receiptHtml=fs.readFileSync(require.resolve('../../newsletter-confirmed.html'),'utf8');
 const callback=receiptHtml.match(/<script[^>]*src="[^"\n]*newsletter-confirmed\.js[^"\n]*"[^>]*><\/script>/);
 assert.ok(callback);assert.doesNotMatch(callback[0],/\b(?:defer|async)\b/);
 assert.ok(callback.index<receiptHtml.indexOf('<link rel="stylesheet"'),'callback navigation must not wait for fallback styles');
 for(const page of ['index.html','jobs.html','internships.html']){
  const html=fs.readFileSync(require.resolve('../../'+page),'utf8');
  const openingBody=html.match(/<body\b[^>]*>/);assert.ok(openingBody,page);
  const body=html.slice(openingBody.index+openingBody[0].length);
  assert.match(body,/^\s*(?:<!--[\s\S]*?-->\s*)?<script src="[^"\n]*newsletter-success\.js[^"\n]*"><\/script>/,page+' must display valid confirmation before board markup');
 }
});
