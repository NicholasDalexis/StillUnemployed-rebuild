'use strict';
const crypto=require('node:crypto');
const Core=require('./analytics-core.cjs');
const P=require('../../../js/personalization.js');
const bundled=require('../../../jobs-data.json');
const DAY=86400000;
let jobsCache=null,jobsCacheAt=0;
async function liveCatalog(){
  if(jobsCache&&Date.now()-jobsCacheAt<300000)return jobsCache;
  const {loadJobs}=await import('../../../scripts/gen-share.mjs');
  try{const jobs=await loadJobs(null,(url)=>fetch(url,{signal:AbortSignal.timeout(5000)}));jobsCache=Core.catalog(jobs);jobsCacheAt=Date.now();return jobsCache;}catch{if(jobsCache&&Date.now()-jobsCacheAt<3600000)return jobsCache;throw error(503,'Job catalog temporarily unavailable');}
}
function error(status,message){return Object.assign(new Error(message),{status});}
function dependencies(env=process.env) {
  if(!env.SU_ANALYTICS_ENABLED || env.SU_ANALYTICS_ENABLED!=='true' || !env.SU_FIREBASE_SERVICE_ACCOUNT || !env.SU_ANALYTICS_SECRET)throw error(503,'Analytics is not configured');
  const {initializeApp,getApps,cert}=require('firebase-admin/app');
  const {getAuth}=require('firebase-admin/auth');const {getFirestore}=require('firebase-admin/firestore');
  let credential;try{credential=JSON.parse(env.SU_FIREBASE_SERVICE_ACCOUNT);}catch{throw error(503,'Analytics is not configured');}
  if(credential.project_id!=='stillunemployed-17de9')throw error(503,'Analytics project mismatch');
  const app=getApps().find(a=>a.name==='su-analytics')||initializeApp({credential:cert(credential)},'su-analytics');
  return {db:getFirestore(app),auth:getAuth(app),env,now:()=>Date.now(),jobs:Core.catalog(bundled),getJobs:liveCatalog};
}
function hmac(env,value){return crypto.createHmac('sha256',env.SU_ANALYTICS_SECRET).update(value).digest('hex');}
async function identity(request,d,required=false) {
  const authorization=request.headers.authorization||request.headers.Authorization||'';
  if(!authorization){if(required)throw error(401,'Sign in required');return null;}
  if(!/^Bearer [^\s]+$/.test(authorization))throw error(401,'Invalid authentication');
  try {const decoded=await d.auth.verifyIdToken(authorization.slice(7),true);return decoded.uid;}catch{throw error(401,'Invalid authentication');}
}
function body(request){if(Buffer.byteLength(request.body||'')>32768)throw error(413,'Request too large');try{return JSON.parse(request.body||'{}');}catch{throw error(400,'Invalid JSON');}}
async function collect(request,d) {
  Core.authorizeOrigin(request,d.env);
  const input=body(request), choices=input.consent||{};
  if(choices.analytics!==true && choices.personalization!==true)throw error(403,'Consent required');
  if(!Array.isArray(input.events)||input.events.length>30||!input.events.length)throw error(400,'Invalid batch');
  if(!/^[a-zA-Z0-9_-]{16,64}$/.test(input.session||''))throw error(400,'Invalid session');
  const uid=await identity(request,d,choices.personalization===true);
  if(!uid&&!/^[a-zA-Z0-9_-]{16,64}$/.test(input.visitor||''))throw error(400,'Invalid visitor');
  const actor=hmac(d.env,uid?'account:'+uid:'guest:'+input.visitor);
  if(d.getJobs&&input.events.some(e=>e.jobId))d.jobs=await d.getJobs();
  const cleaned=input.events.map(e=>{if(!Number.isFinite(e.occurredAt)||Math.abs(d.now()-e.occurredAt)>300000)throw error(400,'Expired event');return Core.cleanEvent(e,d.jobs);});
  if(cleaned.some(e=>e.name.startsWith('auth_'))&&!uid)throw error(401,'Authentication required');
  // A browser never gets to declare itself a new account. Resolve from Auth metadata.
  const account=uid && cleaned.some(e=>e.name==='auth_login') ? await d.auth.getUser(uid) : null;
  const now=d.now(),expiresAt=new Date(now+90*DAY),ref=d.db.doc('suAnalyticsProfiles/'+actor);
  const rateRef=d.db.doc('suAnalyticsRates/'+hmac(d.env,request.headers['x-nf-client-connection-ip']||actor));
  return d.db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref),rate=await tx.get(rateRef),old=snapshot.exists?snapshot.data():{};
    const current=rate.exists?rate.data():{},window=Math.floor(now/60000);
    const used=current.window===window?(current.count||0):0;
    if(used+cleaned.length>300)throw error(429,'Please retry later');
    const eventRefs=cleaned.map(e=>d.db.doc('suAnalyticsEvents/'+Core.hash(actor+':'+e.id)));
    const eventDocs=await Promise.all(eventRefs.map(r=>tx.get(r)));
    let profile=old.expiresAt && Number(old.expiresAt.toMillis?old.expiresAt.toMillis():old.expiresAt)<=now ? {} : old.jobs||{};
    Object.keys(profile).forEach(id=>{if(!Number.isFinite(profile[id].at)||profile[id].at<=now-90*DAY)delete profile[id];});
    let accepted=0,signupRecorded=!!old.signupRecorded;
    for(let i=0;i<cleaned.length;i++) {
      if(eventDocs[i].exists || (Number.isFinite(input.events[i].occurredAt) && input.events[i].occurredAt <= (old.resetAt||0)))continue;
      const e=cleaned[i];
      if(e.name==='auth_signup')continue;
      if(choices.personalization===true && e.jobId)profile=P.update(profile,e,d.jobs[e.jobId],now);
      // Idempotency receipts also exist for personalization-only requests, but contain
      // no analytics behavior in that mode and are never included in aggregates.
      const receipt={at:now,expiresAt,actor,session:input.session,id:e.id,analytics:choices.analytics===true};
      if(choices.analytics===true)Object.assign(receipt,e);
      tx.set(eventRefs[i],receipt);accepted++;
      if(choices.analytics===true&&e.name==='auth_login'&&!signupRecorded&&account) {
        const created=Date.parse(account.metadata.creationTime);
        if(now-created>=0&&now-created<300000) {
          tx.set(d.db.doc('suAnalyticsEvents/'+Core.hash(actor+':signup')),{...receipt,id:'server-signup',name:'auth_signup',page:e.page});signupRecorded=true;
        }
      }
    }
    tx.set(ref,{jobs:profile,signupRecorded,resetAt:old.resetAt||0,expiresAt,updatedAt:now});
    tx.set(rateRef,{window,count:used+cleaned.length,expiresAt:new Date(now+DAY)});
    return {accepted,receivedAt:new Date(now).toISOString()};
  });
}
async function profile(request,d) {
  Core.authorizeOrigin(request,d.env);const uid=await identity(request,d,request.httpMethod!=='DELETE');
  const input=request.httpMethod==='DELETE'?body(request):{};if(!uid&&!/^[a-zA-Z0-9_-]{16,64}$/.test(input.visitor||''))throw error(401,'Identity required');
  const actor=hmac(d.env,uid?'account:'+uid:'guest:'+input.visitor),ref=d.db.doc('suAnalyticsProfiles/'+actor);
  if(request.httpMethod==='DELETE') {
    const actors=[actor];
    if(uid&&/^[a-zA-Z0-9_-]{16,64}$/.test(input.visitor||'')){const guest=hmac(d.env,'guest:'+input.visitor);if(guest!==actor)actors.push(guest);}
    let deleted=0;
    for(const target of actors){
      await d.db.doc('suAnalyticsProfiles/'+target).set({jobs:{},resetAt:d.now(),updatedAt:d.now(),expiresAt:new Date(d.now()+90*DAY)},{merge:true});
      while(true){const docs=await d.db.collection('suAnalyticsEvents').where('actor','==',target).limit(400).get();if(docs.empty)break;const batch=d.db.batch();docs.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();deleted+=docs.size;if(deleted>=20000)throw error(503,'Reset is still processing. Please retry.');}
    }
    return {reset:true,deleted};
  }
  const snap=await ref.get(),data=snap.exists?snap.data():{};
  if(data.expiresAt && Number(data.expiresAt.toMillis?data.expiresAt.toMillis():data.expiresAt)<=d.now()){await ref.delete();return {jobs:{},updatedAt:null};}
  const jobs={};Object.entries(data.jobs||{}).forEach(([id,v])=>{if(v.at>d.now()-90*DAY)jobs[id]=v;});
  return {jobs,updatedAt:data.updatedAt||null};
}
async function admin(request,d) {
  Core.authorizeOrigin(request,d.env);const uid=await identity(request,d,true);
  const allowed=(d.env.SU_ANALYTICS_ADMIN_UIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!allowed.includes(uid))throw error(403,'Owner access required');
  const days=Math.max(1,Math.min(90,Number(request.queryStringParameters?.days)||30));
  const docs=await d.db.collection('suAnalyticsEvents').where('at','>=',d.now()-days*DAY).limit(20001).get();
  if(docs.size>20000)throw error(503,'This window is too large; choose fewer days');
  const rows=docs.docs.map(doc=>doc.data()).filter(e=>e.analytics===true && e.name && e.at<=d.now());
  return {...Core.reduceRows(rows,days,d.now()),coverage:{label:'Only visitors who opted into analytics',dimensionSuppression:'Field, role and theme groups with fewer than 5 visitors are withheld',complete:true}};
}
async function cleanup(d) {
  let deleted=0;
  for(const collection of ['suAnalyticsEvents','suAnalyticsProfiles','suAnalyticsRates']) {
    // Bounded scheduling work. Read paths independently reject expired records.
    for(let pass=0;pass<5;pass++){const rows=await d.db.collection(collection).where('expiresAt','<=',new Date(d.now())).limit(400).get();if(rows.empty)break;const batch=d.db.batch();rows.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();deleted+=rows.size;}
  }
  for(const collection of ['suAnalyticsEvents','suAnalyticsProfiles','suAnalyticsRates']){const remainder=await d.db.collection(collection).where('expiresAt','<=',new Date(d.now())).limit(1).get();if(!remainder.empty)throw error(503,'Retention backlog requires another run');}
  return {deleted};
}
function handler(action,methods){return async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin, Authorization','X-Content-Type-Options':'nosniff'};
  try{if(!methods.includes(request.httpMethod))throw error(405,'Method not allowed');const result=await action(request,dependencies());return {statusCode:200,headers,body:JSON.stringify(result)};}catch(e){return {statusCode:e.status||503,headers,body:JSON.stringify({error:e.status?e.message:'Analytics service unavailable'})};}
};}
module.exports={dependencies,identity,collect,profile,admin,cleanup,handler,hmac};
