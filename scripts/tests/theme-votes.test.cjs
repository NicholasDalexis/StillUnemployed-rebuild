const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../../netlify/functions/lib/analytics-core.cjs');
const Service=require('../../netlify/functions/lib/analytics-service.cjs');
const Dashboard=require('../../js/analytics-dashboard.js');
const {database}=require('./helpers/analytics-store.cjs');
const now=Date.UTC(2026,8,6),themes=['original','girly','poker','mermaid','bratt','noir','beauty','chess'];
function event(theme='poker',vote='up',id='theme-event-00001'){return {id,name:'theme_vote',theme,vote,page:'board',occurredAt:now};}
function deps(){return {env:{SU_ALLOWED_ORIGINS:'http://localhost:8013',SU_ANALYTICS_SECRET:'synthetic-only',SU_ANALYTICS_ADMIN_UIDS:'owner'},db:database(),jobs:{},now:()=>now,auth:{verifyIdToken:async token=>({uid:token})}};}
function request(actor,events,consent={analytics:true,personalization:false}){return {httpMethod:'POST',headers:{origin:'http://localhost:8013',authorization:'Bearer '+actor},body:JSON.stringify({session:'session-votes-0001',events,consent})};}

test('server preserves all eight exact theme keys and both directions, and rejects incomplete votes',()=>{
 for(const theme of themes)for(const vote of ['up','down']){
  const out=Core.cleanEvent({...event(theme,vote),notes:'private',email:'hidden@example.invalid'},{});
  assert.deepEqual(out,{id:'theme-event-00001',name:'theme_vote',page:'board',theme,vote});
 }
 for(const [theme,vote] of [['cod','up'],['Casino','up'],['','up'],['poker','yes'],['poker',undefined],['__proto__','down']])assert.throws(()=>Core.cleanEvent({...event(theme),vote},{}),e=>e.status===400);
 const missing=event();delete missing.vote;assert.throws(()=>Core.cleanEvent(missing,{}),e=>e.status===400);
});

test('like/dislike aggregation suppresses each small cohort without publishing a revealing total',()=>{
 const rows=[];
 for(let i=0;i<5;i++)rows.push({...event(),actor:'v'+i,at:now});
 for(let i=0;i<4;i++)rows.push({...event('poker','down'),actor:'v'+i,at:now});
 for(let i=0;i<20;i++)rows.push({...event('noir','down'),actor:'one',at:now});
 rows.push({...event('beauty','up'),actor:'old',at:now-31*86400000},{...event('beauty','down'),actor:'future',at:now+1});
 const out=Core.reduceRows(rows,30,now);
 assert.deepEqual(out.themeVotes,{up:[{label:'poker',count:5}],down:[]});
 assert.deepEqual(out.themes,[]);assert.equal(out.themeVotes.total,undefined);
 rows.push({...event('poker','down'),actor:'v4',at:now});
 assert.deepEqual(Core.reduceRows(rows,30,now).themeVotes.down,[{label:'poker',count:5}]);
});

test('collector persistence and owner readback keep votes apart from selections and career profiles; retries count once',async()=>{
 const d=deps();
 for(let i=0;i<5;i++){
  const r=request('v'+i,[event('poker','up'),event('poker','down','theme-event-00002'),{...event('poker','up','theme-event-00003'),name:'theme_change'}]);
  assert.equal((await Service.collect(r,d)).accepted,3);assert.equal((await Service.collect(r,d)).accepted,0);
 }
 await Service.collect(request('v0',[event('poker','up','theme-event-00004')]),d);
 const owner={...request('owner',[]),httpMethod:'GET',queryStringParameters:{days:'30'}};
 const out=await Service.admin(owner,d);
 assert.deepEqual(out.themeVotes,{up:[{label:'poker',count:6}],down:[{label:'poker',count:5}]});
 assert.deepEqual(out.themes,[{label:'poker',count:5}]);
 const normalized=Dashboard.normalize(out);
 assert.match(Dashboard.answer('Which theme has the most likes?',normalized),/Casino leads with 6 recorded like votes/);
 assert.match(Dashboard.answer('Which theme has the most dislikes?',normalized),/Casino leads with 5 recorded dislike votes/);
 assert.doesNotMatch(JSON.stringify(out),/v0|session-votes|theme-event/);
 for(const [path,value] of d.db.data)if(path.startsWith('suAnalyticsProfiles/'))assert.deepEqual(value.jobs,{});
});

test('no-consent votes are rejected; personalization-only cannot enter owner analytics',async()=>{
 const d=deps();
 await assert.rejects(()=>Service.collect(request('v0',[event()],{analytics:false,personalization:false}),d),e=>e.status===403);
 assert.equal(d.db.data.size,0);
 for(let i=0;i<5;i++)await Service.collect(request('v'+i,[event()],{analytics:false,personalization:true}),d);
 const out=await Service.admin({...request('owner',[]),httpMethod:'GET'},d);
 assert.equal(out.totals.events,0);assert.deepEqual(out.themeVotes,{up:[],down:[]});
 for(const [path,value] of d.db.data)if(path.startsWith('suAnalyticsEvents/')){assert.equal(value.name,undefined);assert.equal(value.theme,undefined);assert.equal(value.vote,undefined);}
});
