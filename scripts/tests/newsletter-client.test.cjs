const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../../js/newsletter-attribution.js'),'utf8');
const BASE='https://subscribe-forms.beehiiv.com/af2e314d-125f-431d-a8e0-0020be04d97c';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function harness({consent=true,excluded=false,mode='ok'}={}){
 const storage={},events=[],requests=[],issued=[],listeners={},observers=[],timers=[],liveFrames=[],confirmed=[];let activeConsent=consent;
 const doc={hidden:false,activeElement:null,querySelectorAll:()=>liveFrames};
 const win={location:{origin:'https://preview--stillunemployed.netlify.app'},SUNewsletterSuccess:{open:frame=>confirmed.push(frame)},crypto:crypto.webcrypto,SUAnalytics:{choices:()=>({analytics:activeConsent}),excluded:()=>excluded,emit:(name,params)=>events.push({name,...params}),newsletterRequest:async(token,context,signal)=>{issued.push({token,context});if(mode==='fail')throw Error('offline');if(mode==='timeout')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));return {campaign:'su_'+token,jobId:context.link?'b'.repeat(64):undefined};}},addEventListener:(n,f)=>{listeners[n]=f;}};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(frame){this.frame=frame;}disconnect(){this.disconnected=true;}}
 win.IntersectionObserver=Observer;
 vm.runInNewContext(source,{window:win,document:doc,URL,Uint8Array,AbortController,IntersectionObserver:Observer,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};}});
 return {win,doc,storage,events,requests,issued,observers,timers,confirmed,listeners,liveFrames,load:(frame,context={placement:'advice',cta:'N01',exposure:1})=>{liveFrames.push(frame);win.SUNewsletter.load(frame,BASE,context);},consent:value=>{activeConsent=value;listeners['su:consent-changed']();},auth:()=>listeners['su:auth-changed']({detail:{accountChanged:true}}),blur:frame=>{doc.activeElement=frame;listeners.blur();timers.filter(t=>t.ms===0).forEach(t=>t.fn());}};
}
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
 const win={sessionStorage,location:{origin:'https://preview--stillunemployed.netlify.app',replace:url=>visited.push(url)}};win.parent=win;
 vm.runInNewContext(receipt,{window:win,URL,Date,btoa,unescape,encodeURIComponent});
 assert.equal(visited.length,1);const url=new URL(visited[0]);assert.equal(url.pathname,'/jobs.html');assert.equal(url.searchParams.get('theme'),'beauty');
 assert.equal(atob(url.searchParams.get('job')),'https://example.com/job?id=9');
 assert.equal(JSON.parse(storage.su_newsletter_resume_v1).context.placement,'job-detail');assert.equal(storage.su_newsletter_return_v1,undefined);
});
test('unrecognized success return cannot navigate the browser',()=>{
 const receipt=fs.readFileSync(require.resolve('../../js/newsletter-confirmed.js'),'utf8'),visited=[];
 const storage={su_newsletter_return_v1:JSON.stringify({at:Date.now(),url:'https://evil.invalid/jobs.html',context:{placement:'job-detail',link:'https://example.com/job'}})};
 const win={sessionStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},location:{origin:'https://preview--stillunemployed.netlify.app',replace:url=>visited.push(url)}};win.parent=win;
 vm.runInNewContext(receipt,{window:win,URL,Date,btoa,unescape,encodeURIComponent});assert.equal(visited.length,0);assert.equal(storage.su_newsletter_resume_v1,undefined);
});
test('returned board restores the thank-you layer over the matching job without a second signup frame',()=>{
 const source=fs.readFileSync(require.resolve('../../js/newsletter-success.js'),'utf8');
 const context={placement:'job-detail',link:'https://example.com/job'},storage={su_newsletter_resume_v1:JSON.stringify({at:Date.now(),context})};
 const controls={addEventListener(){},focus(){}},dialog={isConnected:true,open:false,setAttribute(){},querySelector:()=>controls,addEventListener(){},showModal(){this.open=true;}};
 const action={getAttribute:()=>context.link,closest:()=>dialog};
 const doc={body:{appendChild(){}},createElement:()=>dialog,querySelectorAll:()=>[],querySelector:()=>action};
 const win={document:doc,navigator:{userAgent:'Mozilla/5.0',platform:'MacIntel',maxTouchPoints:0},sessionStorage:{getItem:k=>storage[k]||null,removeItem:k=>{delete storage[k];}}};
 vm.runInNewContext(source,{window:win,Date,Array});
 assert.equal(win.SUNewsletterSuccess.pendingContext().placement,'job-detail');
 win.SUNewsletterSuccess.tryResume();assert.equal(dialog.open,true);assert.equal(storage.su_newsletter_resume_v1,undefined);
 assert.equal(win.SUNewsletterSuccess.confirmed(),true);
 assert.match(dialog.innerHTML,/<h2 id="su-newsletter-title" tabindex="-1">Welcome email sent!<\/h2>/);
 assert.match(dialog.innerHTML,/<p id="su-newsletter-message">Check promotions or spam folder!<\/p>/);
 assert.match(dialog.innerHTML,/Let’s go .*<p class="su-newsletter-success-ps">p\.s <span>Free Resume<\/span> template attached<\/p>/);
});
test('an inline success hides the completed signup while keeping its note available',()=>{
 const source=fs.readFileSync(require.resolve('../../js/newsletter-success.js'),'utf8');
 const controls={addEventListener(){},focus(){}},dialog={open:false,setAttribute(){},querySelector:()=>controls,addEventListener(){},showModal(){this.open=true;}};
 const note={isConnected:true,focus(){}},capture={hidden:false},frame={isConnected:true,closest:selector=>selector==='[data-newsletter-id]'?capture:note};
 const doc={body:{appendChild(){}},createElement:()=>dialog};
 const win={document:doc,navigator:{userAgent:'Mozilla/5.0',platform:'MacIntel',maxTouchPoints:0}};
 vm.runInNewContext(source,{window:win,Date,Array});
 win.SUNewsletterSuccess.open(frame);
 assert.equal(dialog.open,true);assert.equal(capture.hidden,true);assert.equal(win.SUNewsletterSuccess.confirmed(),true);
});
test('provider handshake and bounded resize do not confirm a signup',async()=>{
 const h=harness(),sent=[],source={postMessage:(...x)=>sent.push(x)},frame={isConnected:true,contentWindow:source,style:{}};h.load(frame);await turn();
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:'childReady'});assert.equal(sent[0][0],'parentReady');
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:{type:'beehiiv:styles',payload:{height:'120px'}}});assert.equal(frame.style.height,'120px');
 h.listeners.message({origin:'https://subscribe-forms.beehiiv.com',source,data:{type:'beehiiv:styles',payload:{height:'200000px'}}});assert.equal(frame.style.height,'120px');assert.equal(h.confirmed.length,0);
});
