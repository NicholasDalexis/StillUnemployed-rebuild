const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../../js/discovery.js'),P=require('../../js/personalization.js'),S=require('../../js/sync-store.js'),I=require('../../js/internships.js'),ID=require('../../js/job-identity.js');
function storage(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const job=(ind,n,pay='$80K',role=ind)=>({co:'Fixture',link:'https://example.org/jobs/'+n,role,ind,pay,loc:'Chicago',desc:''});
function fixture(){const events={},clicks={},ls=storage(),store=S.create(ls);let authenticated=false,ready=false,clock=0,nextTimer=0;const timers=new Map();
 const root={setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),SUStore:store,localStorage:ls,SUJobIdentity:ID,SUPersonalization:P,SUAnalytics:{profile:()=>({})},SUAuth:{signedIn:()=>authenticated,syncReady:()=>ready},addEventListener:(e,f)=>(events[e]||(events[e]=[])).push(f),document:{querySelector:()=>null,getElementById:()=>null,addEventListener:(e,f)=>clicks[e]=f}};
 const app={jobs:[job('Brand & Marketing',1)],state:{cat:'all'},render(){},matchesBase:()=>true};const d=D.create(root);d.start(app);
 return {d,store,root,app,advance(ms){clock+=ms;for(const [id,timer] of timers)if(timer.at<=clock){timers.delete(id);timer.fn();}},sign(uid){authenticated=!!uid;ready=false;store.activate(uid);(events['su:auth-changed']||[]).forEach(f=>f());},ready(){ready=true;(events['su:account-ready']||[]).forEach(f=>f());},action(action,extra={}){clicks.click({preventDefault(){},target:{closest:()=>({getAttribute:k=>k==='data-discovery'?action:extra[k]})}});},html:()=>d.html(x=>String(x).replace(/[<>]/g,'')),ls};
}
test('starter six keep the intended lanes and varied input order without salary preference',()=>{
 const jobs=[job('Fashion Design',0,'$180K','Technical Designer'),job('Brand & Marketing',1,'$75K'),job('Brand & Marketing',2,'$105K'),job('Video & Creative',3,'$110K','Graphic Designer'),job('UX/UI Design',4,'$100K','Product Designer'),job('Photography',5,'$75K'),job('Social',6,'$125K'),job('Content & Copy',7,'$95K')];
 const ranked=D.starter(jobs,P);assert.deepEqual(ranked.slice(0,6).map(D.lane),['marketing','graphic','product','photography','social','copy']);assert.equal(ranked[0].link,jobs[1].link);assert.equal(new Set(ranked.map(j=>j.link)).size,jobs.length);assert.equal(D.starter(jobs.slice().reverse(),P)[0].link,jobs[2].link);
});
test('missing lanes and salary do not invent cards or annualize hourly pay',()=>{const jobs=[job('Social',1,'$60/hr'),job('Social',2,'$100K'),job('Fashion Design',3,'Not disclosed')];assert.deepEqual(D.starter(jobs,P).map(j=>j.link),[jobs[0].link,jobs[1].link,jobs[2].link]);});
test('major and adjacent fields add positive hints without dropping other fields',()=>{const b=D.fieldBoost({major:'Graphic design'});assert(b.Creative>0&&b['Product Design']>0);const jobs=[job('Fashion Design',1),job('Video & Creative',2)];const ranked=P.rank(jobs,{}, {fieldBoost:b});assert.equal(ranked.length,2);assert.equal(ranked[0].ind,'Video & Creative');assert.deepEqual(D.fieldBoost({major:'An unrecognized field'}),{});});
test('a posting explicitly naming an otherwise unmapped major gets a positive match',()=>{const f=fixture();f.sign('alice');f.store.setDiscovery('profile',{major:'anthropology'});const jobs=[job('Fashion Design',1),{...job('UX/UI Design',2),desc:'A degree in anthropology or related experience is welcome.'}];assert.equal(f.d.order(jobs,P,{})[0].ind,'UX/UI Design');assert.equal(f.d.order(jobs,P,{}).length,2);});
test('written preference text is bounded and control characters stripped',()=>{assert.equal(D.profile({major:'x'.repeat(120)}).major.length,100);assert.equal(D.profile({info:'x'.repeat(500)}).info.length,300);assert.equal(D.profile({location:'New\nYork'}).location,'New York');});
test('account profile and hidden state never leak to another account or guest',()=>{const f=fixture();f.sign('alice');f.store.setDiscovery('profile',{major:'Photography',info:'Private example'});f.d.dismiss(f.app.jobs[0].link,'applied');assert(f.d.hidden(f.app.jobs[0]));f.sign('bob');assert.equal(f.d.profile().major,'');assert.equal(f.d.hidden(f.app.jobs[0]),false);f.sign(null);assert.equal(f.d.profile().major,'');f.sign('alice');assert.equal(f.d.profile().major,'Photography');assert(f.d.hidden(f.app.jobs[0]));});
test('guest dismissals do not migrate into a signed-in account',()=>{const f=fixture();f.d.dismiss(f.app.jobs[0].link,'not_fit');assert(f.d.hidden(f.app.jobs[0]));f.sign('alice');assert.equal(f.d.hidden(f.app.jobs[0]),false);});
test('application confirmations remain unique without automatically opening preferences',()=>{
 const f=fixture();f.sign('alice');f.d.dismiss('https://example.org/jobs/1','applied');f.d.dismiss('https://example.org/jobs/1','applied');f.d.dismiss('https://example.org/jobs/2','not_fit');assert.equal(f.d.confirmedCount(),1);
 f.d.dismiss('https://example.org/jobs/2','applied');f.d.dismiss('https://example.org/jobs/3','applied');assert.equal(f.d.confirmedCount(),3);assert.equal(f.d.preferencesOpen(),false);
 f.action('settings');assert.equal(f.d.preferencesOpen(),true);f.action('skip');assert.equal(f.d.preferencesOpen(),false);f.action('settings');assert.equal(f.d.preferencesOpen(),true,'explicit access remains available after dismissal');
});

test('only explicitly opened preferences wait for competing product dialogs',()=>{
 const f=fixture();f.sign('alice');f.app.state.feedbackOpen=true;f.action('settings');assert.equal(f.d.preferencesOpen(),false);
 f.app.state.feedbackOpen=false;assert.equal(f.d.preferencesOpen(),true);assert.doesNotMatch(f.html(),/su-discovery-form/);assert.match(f.d.modalHTML(String),/su-discovery-form/);
 f.action('close');assert.equal(f.d.preferencesOpen(),false);f.sign('bob');assert.equal(f.d.preferencesOpen(),false);
});

test('undo and restore keep application tracker records intact',()=>{const f=fixture();f.sign('alice');f.store.saveTracker([{link:f.app.jobs[0].link,status:'Applied'}]);f.d.dismiss(f.app.jobs[0].link,'applied');f.action('undo');assert.equal(f.d.hidden(f.app.jobs[0]),false);assert.equal(S.view(f.store.snapshot()).tracker.length,1);f.d.dismiss(f.app.jobs[0].link,'applied');f.action('restore',{'data-key':f.d.key(f.app.jobs[0].link)});assert.equal(f.d.hidden(f.app.jobs[0]),false);assert.equal(f.d.confirmedCount(),1);});
test('paused returning picks never create visit history on account readiness or refresh',()=>{
 const f=fixture();f.sign('alice');f.ready();f.d.updateCatalog(f.app.jobs);assert.equal(f.store.discovery().visits,undefined);assert.equal(f.html(),'');
 f.sign(null);f.d.updateCatalog(f.app.jobs);assert.equal(f.html(),'');
});

test('paused returning picks preserve prior visits and never expose the old note or actions',()=>{
 const f=fixture();f.sign('alice');const visits={count:3,lastAt:Date.now()-3600000,seen:['https://example.org/older'],snapshotComplete:true,remindedDay:123};f.store.setDiscovery('visits',visits);
 f.ready();assert.deepEqual(f.store.discovery().visits,visits);assert.equal(f.html(),'');
 for(const action of ['recommend','dismiss-recos']){f.action(action);assert.deepEqual(f.store.discovery().visits,visits);assert.equal(f.html(),'');}
 assert.doesNotMatch(f.d.toolsHTML(String),/recommend|new picks|new pages/i);
 f.sign('alice');f.ready();assert.deepEqual(f.store.discovery().visits,visits);
});

test('incomplete old snapshots and feed failure cannot produce new-job claims',()=>{for(const reason of ['snapshot','failure']){const f=fixture();f.sign('alice');f.store.setDiscovery('visits',{count:4,lastAt:Date.now()-3600000,seen:[],snapshotComplete:reason!=='snapshot'});f.app._loadError=reason==='failure';f.ready();assert.doesNotMatch(f.html(),/new pages/);}});
test('same-tab navigation inside 30 minutes does not increment returning visit count',()=>{const f=fixture();f.sign('alice');f.store.setDiscovery('visits',{count:2,lastAt:Date.now()-60000,seen:[]});f.ready();assert.equal(f.store.discovery().visits.count,2);});
test('preferences merge across devices; a stale remote cannot revive cleared answers',()=>{const a=S.create(storage()),b=S.create(storage());a.activate('alice');b.activate('alice');a.setDiscovery('profile',{major:'Marketing',info:'Private'});const old=a.snapshot();b.receive(old);b.setDiscovery('profile',null);a.receive(b.snapshot());a.receive(old);assert.equal(a.discovery().profile,undefined);});
test('pending old-account sync cannot overwrite a new-account discovery view',async()=>{const a=S.create(storage());a.activate('alice');a.setDiscovery('profile',{major:'Marketing'});let finish;const s=S.connect(a,{listen:()=>()=>{},transaction:x=>new Promise(r=>finish=()=>r(x))},()=>{});s.flush();s.stop();a.activate('bob');finish();await new Promise(r=>setImmediate(r));assert.deepEqual(a.discovery(),{});});
const internship=(extra={})=>({co:'Example',role:'Design Intern',link:'https://example.org/jobs/intern',loc:'Remote, US',ind:'Video & Creative',eligibility:'Current college students',payStatus:'paid',pay:'$22.50/hour',verification:{status:'open',checkedAt:'2026-09-06T15:00:00Z',reviewerType:'source_check'},...extra});
test('internship lane remains empty until explicitly verified, preserving exact hourly pay',()=>{assert.deepEqual(I.jobs({schemaVersion:1,status:'awaiting_verification',jobs:[internship()]}),[]);const rows=I.jobs({schemaVersion:1,status:'verified',jobs:[internship()]});assert.equal(rows[0].pay,'$22.50/hour');assert.equal(rows[0].internship,true);assert.equal(rows[0].verification.reviewerType,'source_check');});
test('unpaid and undisclosed internships are separate truthful states',()=>{const jobs=[internship({payStatus:'unpaid',pay:'Unpaid'}),internship({link:'https://example.org/jobs/2',payStatus:'not_disclosed',pay:'Not disclosed'})];assert.equal(I.jobs({schemaVersion:1,status:'verified',jobs}).length,2);assert.equal(I.jobs({schemaVersion:1,status:'verified',jobs:[internship({payStatus:'unpaid',pay:'Not disclosed'})]}).length,0);});
test('invalid eligibility, unsafe links, expired deadlines and nonverified records do not publish',()=>{for(const changes of [{eligibility:''},{link:'javascript:alert(1)'},{verification:{status:'active'}},{deadlineISO:'2020-01-01'}])assert.deepEqual(I.jobs({schemaVersion:1,status:'verified',jobs:[internship(changes)]}),[]);});
test('valid punctuation in an employer URL can be hidden and restored safely',()=>{const f=fixture();f.sign('alice');const link="https://example.org/jobs/designer-(contract)!";assert.doesNotThrow(()=>f.d.dismiss(link,'applied'));assert.equal(f.d.confirmedCount(),1);f.action('undo');assert.equal(f.d.confirmedCount(),0);});
test('an empty successful catalog does not erase the previous snapshot or manufacture later new jobs',()=>{const f=fixture();f.sign('alice');const old={count:3,lastAt:Date.now()-3600000,seen:['earlier'],snapshotComplete:true};f.store.setDiscovery('visits',old);f.app.jobs=[];f.ready();assert.deepEqual(f.store.discovery().visits,old);assert.doesNotMatch(f.html(),/new pages/);});
test('declined behavioral personalization cannot use a stale activity profile in new-job ordering',()=>{const f=fixture();f.sign('alice');f.root.SUAnalytics.choices=()=>({personalization:false});const jobs=[job('Social',1),job('Fashion Design',2)];const history={old:{field:'Fashion Design',role:'Fashion Design',weight:50,at:Date.now()}};assert.equal(f.d.order(jobs,P,history)[0].ind,'Social');f.root.SUAnalytics.choices=()=>({personalization:true});assert.equal(f.d.order(jobs,P,history)[0].ind,'Fashion Design');});
test('approved internship metadata has the same canonical ID the collector accepts on the internships page',()=>{const Core=require('../../netlify/functions/lib/analytics-core.cjs');const jobs=I.jobs({schemaVersion:1,status:'verified',jobs:[internship()]});const metadata=Core.catalog(jobs),id=Core.jobId(jobs[0]);assert.equal(Core.cleanEvent({id:'fixture_event_id_123',name:'job_open',page:'internships',jobId:id},metadata).jobId,id);});

test('hidden menu counts only current catalog records, including canonical aliases',()=>{
 const f=fixture();f.sign('alice');f.d.dismiss(f.app.jobs[0].link+'?utm_source=old','not_fit');f.d.dismiss('https://example.org/retired','applied');
 assert.equal(f.d.hiddenCount(),1);assert.match(f.d.toolsHTML(String),/Show hidden jobs \(1\)/);
 f.action('hidden');assert.match(f.d.toolsHTML(String),/aria-pressed="true"[^>]*>Hide dismissed jobs \(1\)/);
 f.app.jobs=[];f.d.updateCatalog([]);assert.equal(f.d.hiddenCount(),0);assert.match(f.d.toolsHTML(String),/data-discovery="hidden"[^>]* disabled/);
 assert.equal(f.d.confirmedCount(),1,'catalog removal does not erase account dispositions');
});

test('feed recovery and later refreshes leave paused visit history unchanged',()=>{
 const f=fixture();f.sign('alice');const visits={count:2,lastAt:Date.now()-3600000,seen:['earlier'],snapshotComplete:true};f.store.setDiscovery('visits',visits);
 f.app._loadError=true;f.app.jobs=[];f.ready();f.app._loadError=false;f.app.jobs=[job('Social',2)];f.d.updateCatalog(f.app.jobs);f.d.updateCatalog(f.app.jobs);
 assert.deepEqual(f.store.discovery().visits,visits);assert.doesNotMatch(f.html(),/new pages|new picks/);
});


test('Board menu tools reflect only the current account and expose disabled empty hidden control to guests',()=>{
 const f=fixture();assert.equal(f.html(),'');assert.equal(f.d.hiddenCount(),0);assert.doesNotMatch(f.d.toolsHTML(String),/Your preferences/);assert.match(f.d.toolsHTML(String),/disabled>Show hidden jobs \(0\)/);
 f.d.dismiss(f.app.jobs[0].link,'not_fit');assert.equal(f.d.hiddenCount(),1);assert.doesNotMatch(f.d.toolsHTML(String),/disabled/);assert.match(f.html(),/data-discovery="undo"/);assert.doesNotMatch(f.html(),/Your preferences|data-discovery="hidden"|new picks/);
 f.sign('alice');assert.equal(f.d.hiddenCount(),0);assert.match(f.d.toolsHTML(String),/id="su-preferences-open"[^>]*data-discovery="settings"/);assert.equal(f.html(),'');
 f.d.dismiss(f.app.jobs[0].link,'applied');assert.equal(f.d.hiddenCount(),1);f.sign('bob');assert.equal(f.d.hiddenCount(),0);assert.equal(f.html(),'');
 f.sign('alice');assert.equal(f.d.hiddenCount(),1);f.sign(null);assert.equal(f.d.hiddenCount(),1,'guest history stays separate and returns only for the guest');
});


test('dismissal notice expires after five seconds, resets for a new action and never crosses account ownership',()=>{
 const f=fixture();f.sign('alice');f.d.dismiss(f.app.jobs[0].link,'not_fit');assert.match(f.html(),/su-discovery-feedback/);f.advance(4999);assert.match(f.html(),/Undo/);
 f.d.dismiss('https://example.org/jobs/2','applied');f.advance(1);assert.match(f.html(),/Application noted/);f.advance(4999);assert.equal(f.html(),'');assert(f.d.hidden(f.app.jobs[0]),'expiry only clears the notice, not the saved disposition');
 f.d.dismiss(f.app.jobs[0].link,'not_fit');f.sign('bob');f.advance(5000);assert.equal(f.html(),'');assert.equal(f.d.hidden(f.app.jobs[0]),false);
 f.d.dismiss(f.app.jobs[0].link,'not_fit');f.action('undo');assert.match(f.html(),/Restored/);f.advance(5000);assert.equal(f.html(),'');assert.equal(f.d.hidden(f.app.jobs[0]),false);
});
