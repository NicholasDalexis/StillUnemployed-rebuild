'use strict';
const {randomUUID}=require('node:crypto');
const Core=require('./job-moderation-core.cjs');
const MARKERS='suAccountDeletion',OPERATIONS='suAccountOperations';
function dependencies(env=process.env){
  if(!env.SU_FIREBASE_SERVICE_ACCOUNT)throw Core.fail(503,'Account service is unavailable. Please retry.');
  const {initializeApp,getApps,cert}=require('firebase-admin/app');
  const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
  let credential;try{credential=JSON.parse(env.SU_FIREBASE_SERVICE_ACCOUNT);}catch{throw Core.unavailable();}
  if(credential.project_id!=='stillunemployed-17de9')throw Core.unavailable();
  const app=getApps().find(a=>a.name==='su-accounts')||initializeApp({credential:cert(credential)},'su-accounts');
  return {db:getFirestore(app),auth:getAuth(app),env,now:Date.now};
}
function enabled(env){return env.SU_ACCOUNT_DELETION_ENABLED==='true';}
function assertSnapshot(snap){if(snap.exists)throw Core.fail(403,'This account is being deleted.');}
async function assertActive(uid,d){if(!uid||!enabled(d.env))return;assertSnapshot(await d.db.doc(MARKERS+'/'+uid).get());}
// A deletion first closes new writes, then waits for bounded in-flight reports.
// Firestore-backed writes read the marker inside their own transaction as well.
async function runActive(uid,work,d){
  d ||= enabled(process.env)?dependencies():null;
  if(!uid||!d||!enabled(d.env))return work();
  const key=randomUUID(),ref=d.db.doc(OPERATIONS+'/'+uid),marker=d.db.doc(MARKERS+'/'+uid),at=d.now();
  await d.db.runTransaction(async tx=>{
    const m=await tx.get(marker),s=await tx.get(ref);assertSnapshot(m);
    const leases=Object.fromEntries(Object.entries(s.exists?s.data().leases||{}:{}).filter(([,expiry])=>expiry>at));
    if(Object.keys(leases).length>=10)throw Core.fail(429,'Please retry later.');
    leases[key]=at+120000;tx.set(ref,{leases,expiresAt:new Date(at+86400000)});
  });
  try{return await work();}
  finally{await d.db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists){const leases={...s.data().leases};delete leases[key];tx.set(ref,{leases,expiresAt:new Date(d.now()+86400000)});}});}
}
function hasOperations(snap,now){return snap.exists&&Object.values(snap.data().leases||{}).some(at=>at>now);}
// Reuse the existing Netlify retention job and ordinary Firestore deletes.
// Managed Firestore TTL requires billing; incomplete markers never expire.
async function cleanupExpired(d){
  let deleted=0;
  for(const collection of [MARKERS,OPERATIONS]){
    for(let pass=0;pass<5;pass++){
      const expired=await d.db.collection(collection).where('expiresAt','<=',new Date(d.now())).limit(100).get();if(expired.empty)break;
      let removed=0;
      for(const doc of expired.docs)removed+=await d.db.runTransaction(async tx=>{
        const current=await tx.get(doc.ref);if(!current.exists)return 0;const value=current.data(),expiry=value.expiresAt;
        const time=expiry&&typeof expiry.toMillis==='function'?expiry.toMillis():expiry instanceof Date?expiry.getTime():Infinity;
        if(time>d.now()||collection===MARKERS&&value.state!=='complete'||collection===OPERATIONS&&hasOperations(current,d.now()))return 0;
        tx.delete(doc.ref);return 1;
      });
      deleted+=removed;if(!removed)break;
    }
  }
  return deleted;
}
module.exports={MARKERS,OPERATIONS,dependencies,enabled,assertActive,assertSnapshot,runActive,hasOperations,cleanupExpired};
