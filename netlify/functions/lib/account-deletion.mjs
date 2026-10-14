import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import Core from './job-moderation-core.cjs';
import Queue from './report-queue-core.cjs';
import Account from './account-state.cjs';
import Native from './native-origin.cjs';
import {eraseReportAttribution} from './account-report-erasure.mjs';
import {createAppleRevoker} from './apple-revocation.mjs';
const unavailable=()=>Core.fail(503,'Account deletion is unavailable. Please retry.');
const tokenFrom=request=>{const value=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(value))throw Core.fail(401,'Sign in again to delete your account.');return value.slice(7);};
function validateBody(input){
  if(input.confirm!==true)throw Core.fail(400,'Confirm account deletion.');
  if(input.apple!==undefined&&(!Queue.plain(input.apple)||Object.keys(input.apple).some(k=>!['idToken','authorizationCode','accessToken'].includes(k))))throw Core.fail(400,'Invalid Apple authorization.');
  return input;
}
async function eraseEvents(db,actor){
  for(let pass=0;pass<5;pass++){
    const rows=await db.collection('suAnalyticsEvents').where('actor','==',actor).limit(400).get();if(rows.empty)break;
    const batch=db.batch();rows.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();
  }
  if(!(await db.collection('suAnalyticsEvents').where('actor','==',actor).limit(1).get()).empty)throw Core.fail(503,'Deletion is still processing. Please retry.');
  await db.doc('suAnalyticsProfiles/'+actor).delete();
}
function hashed(env,value){return createHmac('sha256',env.SU_ANALYTICS_SECRET).update(value).digest('hex');}
async function rateLimit(d,uid,ip){
  const at=d.now(),window=Math.floor(at/60000);
  const entries=[{ref:d.db.doc('suAnalyticsRates/account-delete-'+hashed(d.env,uid)),limit:5}];
  if(typeof ip==='string'&&ip)entries.push({ref:d.db.doc('suAnalyticsRates/account-delete-network-'+hashed(d.env,ip)),limit:20});
  await d.db.runTransaction(async tx=>{
    const values=await Promise.all(entries.map(x=>tx.get(x.ref)));
    values.forEach((snap,i)=>{const used=snap.exists&&snap.data().window===window?snap.data().count:0;if(used>=entries[i].limit)throw Core.fail(429,'Please wait a minute before retrying deletion.');});
    values.forEach((snap,i)=>tx.set(entries[i].ref,{window,count:(snap.exists&&snap.data().window===window?snap.data().count:0)+1,expiresAt:new Date(at+86400000)}));
  });
}
function continuation(uid,requestId,expiresAt,env){
  const payload=Buffer.from(JSON.stringify({uid,requestId,expiresAt})).toString('base64url');
  return 'v1.'+payload+'.'+createHmac('sha256',env.SU_ANALYTICS_SECRET).update('account-delete-continuation:'+payload).digest('base64url');
}
function verifyContinuation(value,env){
  const deny=()=>Core.fail(401,'Account deletion authorization expired. Resume from Account settings.');
  if(!env.SU_ANALYTICS_SECRET||typeof value!=='string'||value.length>2048)throw deny();
  const parts=value.split('.');if(parts.length!==3||parts[0]!=='v1'||!/^[A-Za-z0-9_-]+$/.test(parts[1]))throw deny();
  const expected=createHmac('sha256',env.SU_ANALYTICS_SECRET).update('account-delete-continuation:'+parts[1]).digest('base64url');
  if(parts[2].length!==expected.length||!timingSafeEqual(Buffer.from(parts[2]),Buffer.from(expected)))throw deny();
  let payload;try{payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));}catch{throw deny();}
  if(typeof payload.uid!=='string'||!payload.uid||!Queue.uuid(payload.requestId)||!Number.isSafeInteger(payload.expiresAt))throw deny();
  return payload;
}
export function createService({getDependencies=Account.dependencies,eraseReports=eraseReportAttribution,appleRevoker=createAppleRevoker()}={}){
  return async function handle(request,context){let pending=null,lease=null,ref=null,d=null;try{
    if(request.method!=='POST')return Queue.response(405,{error:'Method not allowed'});
    Core.scopeFor(request,context);Native.authorizeOrigin(request,{native:true});
    d=getDependencies();
    const input=validateBody(await Queue.body(request,['phase','requestId','confirm','apple','continuation']));
    if(!['start','process'].includes(input.phase))throw Core.fail(400,'Invalid deletion phase.');
    let uid,decoded=null,token=null,capability=null;
    if(input.phase==='start'){
      token=tokenFrom(request);
      try{decoded=await d.auth.verifyIdToken(token,false);}catch{throw Core.fail(401,'Sign in again to delete your account.');}
      uid=decoded.uid;if(typeof uid!=='string'||!uid||decoded.firebase?.tenant)throw Core.fail(401,'Sign in again.');
    }else{
      capability=verifyContinuation(input.continuation,d.env);uid=capability.uid;
      if(capability.requestId!==input.requestId)throw Core.fail(401,'Deletion authorization does not match this request.');
    }
    ref=d.db.doc(Account.MARKERS+'/'+uid);
    let previous=(await ref.get());previous=previous.exists?previous.data():null;pending=!!previous;
    if(previous&&previous.requestId!==input.requestId)throw Core.fail(409,'Resume the deletion already started for this account.');
    if(input.phase==='process'&&(!previous||previous.continuationHash!==hashed(d.env,input.continuation)))throw Core.fail(401,'Deletion authorization does not match this account.');
    if(capability&&capability.expiresAt<=d.now())throw Core.fail(401,'Account deletion authorization expired. Resume from Account settings.');
    // A completion receipt is useful even after Firebase has invalidated the
    // deleted user's refresh token. It exposes only this operation's outcome.
    if(previous?.state==='complete')return Queue.response(200,{deleted:true,requestId:input.requestId});
    if(!Account.enabled(d.env)||!d.env.SU_ANALYTICS_SECRET)throw unavailable();
    await rateLimit(d,uid,context.ip);
    if(input.phase==='start'){
      let account;try{await d.auth.verifyIdToken(token,true);account=await d.auth.getUser(uid);}catch{throw Core.fail(401,'Sign in again to resume deletion.');}
      const now=d.now();
      if(!previous&&(!Number.isInteger(decoded.auth_time)||now/1000-decoded.auth_time>300||decoded.auth_time>now/1000+30))throw Core.fail(401,'Sign in again before deleting your account.');
      if(!previous&&!['google.com','apple.com'].includes(decoded.firebase?.sign_in_provider))throw Core.fail(401,'Sign in with Google or Apple again.');
      const appleLinked=account.providerData.some(p=>p.providerId==='apple.com');
      let sealed=previous?.appleSealed;
      if(appleLinked&&!previous?.appleRevoked&&!sealed)sealed=await appleRevoker.prepare(input.apple,account,d.env);
      const expiresAt=previous?.continuationExpiresAt>now?previous.continuationExpiresAt:now+86400000;
      const capabilityValue=continuation(uid,input.requestId,expiresAt,d.env);
      pending=true;
      const marker=await d.db.runTransaction(async tx=>{
        const snap=await tx.get(ref),current=snap.exists?snap.data():null;
        if(current&&current.requestId!==input.requestId)throw Core.fail(409,'Deletion is already processing.');
        if(current?.state==='complete')return current;
        // First confirmation closes writes. The start response returns before
        // Apple revocation or Auth erasure; the client persists its continuation.
        const value={...(current||{state:'deleting',requestId:input.requestId,startedAt:now,authTime:decoded.auth_time,appleRevoked:!appleLinked,...(sealed?{appleSealed:sealed}:{})}),continuationExpiresAt:expiresAt,continuationHash:hashed(d.env,capabilityValue)};
        tx.set(ref,value);return value;
      });
      if(marker.state==='complete')return Queue.response(200,{deleted:true,requestId:input.requestId});
      return Queue.response(202,{deleted:false,processing:true,requestId:input.requestId,continuation:capabilityValue});
    }
    // Serialize processing for the same confirmed request. Every transition is
    // transactional and tied to this lease, so a stale concurrent invocation
    // cannot downgrade erased/complete progress or revoke Apple a second time.
    const leaseKey=randomUUID(),now=d.now();
    let marker=await d.db.runTransaction(async tx=>{
      const snap=await tx.get(ref),current=snap.exists?snap.data():null;
      if(!current||current.requestId!==input.requestId||current.continuationHash!==hashed(d.env,input.continuation))throw Core.fail(401,'Invalid deletion authorization.');
      if(current.state==='complete')return current;
      if(current.processingUntil>now)return null;
      const next={...current,processingKey:leaseKey,processingUntil:now+120000};tx.set(ref,next);return next;
    });
    if(!marker)return Queue.response(202,{deleted:false,processing:true,requestId:input.requestId});
    if(marker.state==='complete')return Queue.response(200,{deleted:true,requestId:input.requestId});
    lease=leaseKey;
    async function transition(patch){return d.db.runTransaction(async tx=>{const snap=await tx.get(ref),current=snap.data();if(current?.state==='complete')return current;if(!current||current.processingKey!==leaseKey)throw unavailable();const next={...current,...patch};tx.set(ref,next);return next;});}
    const operations=await d.db.doc(Account.OPERATIONS+'/'+uid).get();
    if(Account.hasOperations(operations,now))return Queue.response(202,{deleted:false,processing:true,requestId:input.requestId});
    if(!marker.appleRevoked){await appleRevoker.revoke(marker.appleSealed,d.env);marker=await transition({appleRevoked:true,appleSealed:null});}
    await d.db.doc('users/'+uid).delete();
    const actor=createHmac('sha256',d.env.SU_ANALYTICS_SECRET).update('account:'+uid).digest('hex');
    await eraseEvents(d.db,actor);await eraseReports(uid);
    const accountRate=hashed(d.env,actor);
    for(const key of [accountRate,'reset-'+accountRate,'newsletter-'+accountRate])await d.db.doc('suAnalyticsRates/'+key).delete();
    await d.db.doc(Account.OPERATIONS+'/'+uid).delete();
    if((await d.db.doc('users/'+uid).get()).exists)throw unavailable();
    marker=await transition({state:'erased'});
    try{await d.auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw unavailable();}
    try{await d.auth.getUser(uid);throw unavailable();}catch(e){if(e.code!=='auth/user-not-found')throw e;}
    await d.db.doc('suAnalyticsRates/account-delete-'+hashed(d.env,uid)).delete();
    await transition({state:'complete',completedAt:d.now(),expiresAt:new Date(d.now()+86400000)});
    return Queue.response(200,{deleted:true,requestId:input.requestId});
  }catch(e){const error=Queue.error(e);return Queue.response(error.status,{...await error.json(),pending});}
  finally{if(lease&&ref&&d)try{await d.db.runTransaction(async tx=>{const snap=await tx.get(ref),current=snap.exists?snap.data():null;if(current?.processingKey===lease){const next={...current};delete next.processingKey;delete next.processingUntil;tx.set(ref,next);}});}catch{/* The bounded lease remains safe if cleanup is interrupted. */}};
}
}
export const handle=createService();
