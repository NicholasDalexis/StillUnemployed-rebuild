import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import Core from './job-moderation-core.cjs';
import Queue from './report-queue-core.cjs';
import Availability from './job-availability-core.cjs';
import Outbox from './availability-outbox.cjs';
const mac=(value,key)=>createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
export function configuration(env){
  if(typeof env.SU_AVAILABILITY_ALERT_SECRET!=='string'||env.SU_AVAILABILITY_ALERT_SECRET.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.SU_AVAILABILITY_ALERT_URL||''))return null;
  return {url:env.SU_AVAILABILITY_ALERT_URL,secret:env.SU_AVAILABILITY_ALERT_SECRET};
}
export async function sendAlert(payload,{config,fetchImpl=fetch,now=Date.now}={}){
  const controller=new AbortController(),sentAt=now(),nonce=randomUUID(),unsigned={...payload,sentAt,nonce},body=JSON.stringify({...unsigned,signature:mac(unsigned,config.secret)});
  try{return await Core.within(async()=>{
    let r=await fetchImpl(config.url,{method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body,signal:controller.signal});
    if(r.redirected)throw Core.unavailable();
    // Apps Script ContentService returns one redirect to its Google-owned body host.
    // The follow-up GET contains no auth header or signed POST body.
    if([302,303].includes(r.status)){
      const location=r.headers.get('location');if(r.body)await r.body.cancel();let u;try{u=new URL(location);}catch{throw Core.unavailable();}
      if(u.protocol!=='https:'||u.hostname!=='script.googleusercontent.com'||u.username||u.password||u.port)throw Core.unavailable();
      r=await fetchImpl(u.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal});
    }
    if(r.redirected||r.status!==200||!(r.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Core.unavailable();
    const result=JSON.parse(await Core.readLimited(r.body,8192)),receipt={schemaVersion:result.schemaVersion,alertId:result.alertId,scope:result.scope,status:result.status,at:result.at};
    if(receipt.schemaVersion!==1||receipt.alertId!==payload.alertId||receipt.scope!==payload.scope||!['accepted_by_sender','uncertain','retry'].includes(receipt.status)||!Number.isFinite(Date.parse(receipt.at))||typeof result.signature!=='string'||!/^[a-f0-9]{64}$/.test(result.signature)||!timingSafeEqual(Buffer.from(mac(receipt,config.secret),'hex'),Buffer.from(result.signature,'hex')))throw Core.unavailable();
    return receipt;
  },5000);}finally{controller.abort();}
}
function boundedStore(store){return {getWithMetadata:(...args)=>Core.within(()=>store.getWithMetadata(...args),1500),setJSON:(...args)=>Core.within(()=>store.setJSON(...args),1500)};}
function scopeFor(context){return Core.scopeFor(new Request(context?.deploy?.context==='production'?'https://stillunemployed.com/api/job-availability':'https://preview--stillunemployed.netlify.app/api/job-availability'),context);}
export function createDelivery({openStore=scope=>getStore({name:'su-job-availability-v1-'+scope,consistency:'strong'}),send=sendAlert,env,now=Date.now}={}){
  return async function run(context){
    const runtime=env||Object.fromEntries(['SU_AVAILABILITY_ALERTS_ENABLED','SU_AVAILABILITY_ALERT_URL','SU_AVAILABILITY_ALERT_SECRET'].map(key=>[key,globalThis.Netlify?.env?.get(key)]));
    const scope=scopeFor(context),config=configuration(runtime);if(runtime.SU_AVAILABILITY_ALERTS_ENABLED!=='true'||!config)return {scope,state:'disabled'};
    const store=boundedStore(openStore(scope)),snapshot=Availability.validate((await Queue.read(store)).state),at=now();let chosen;
    for(const record of snapshot.records){const alert=record.outbox?.find(a=>a.status==='pending'&&(!a.nextAttemptAt||Date.parse(a.nextAttemptAt)<=at)||a.status==='sending'&&Date.parse(a.leaseUntil||'')<=at);if(alert){chosen={record,alert};break;}}
    if(!chosen)return {scope,state:'idle'};const {record,alert}=chosen,claimId=randomUUID();
    async function change(phase,apply){return Queue.mutate({store,scope,input:{requestId:randomUUID(),alertId:alert.id,phase,claimId},uid:'availability-alert-worker',rateExempt:true,attempts:1,now,apply(state){Availability.validate(state);const r=state.records.find(x=>x.reportId===record.reportId),a=r?.outbox?.find(x=>x.id===alert.id);if(!a)throw Core.conflict();apply(a);return {reportId:r.reportId,status:r.status};}});}
    await change('claim',a=>{if(!(a.status==='pending'&&(!a.nextAttemptAt||Date.parse(a.nextAttemptAt)<=now()))&&!(a.status==='sending'&&Date.parse(a.leaseUntil||'')<=now()))throw Core.conflict();a.status='sending';a.claimId=claimId;a.leaseUntil=new Date(now()+60000).toISOString();a.attempts++;delete a.nextAttemptAt;});
    let receipt;try{receipt=await send(Outbox.payload(record,alert,scope),{config,now});}catch{receipt=null;}
    await change('receipt',a=>{
      if(a.claimId!==claimId||a.status!=='sending')throw Core.conflict();
      a.ambiguousAttempts=receipt?0:(a.ambiguousAttempts||0)+1;
      a.status=receipt?.status==='accepted_by_sender'?'accepted_by_sender':receipt?.status==='uncertain'||a.ambiguousAttempts>=5?'uncertain':'pending';
      // A signed retry proves the receiver did not dispatch. Quota/lock recovery
      // stays retryable, without polling every five minutes for a long outage.
      if(receipt?.status==='retry')a.nextAttemptAt=new Date(now()+Math.min(21600000,300000*Math.pow(2,Math.min(a.attempts-1,7)))).toISOString();
      a.lastAttemptAt=new Date(now()).toISOString();if(receipt)a.senderReceipt=receipt;delete a.leaseUntil;delete a.claimId;
    });
    const result={schemaVersion:1,scope,alertId:alert.id,state:receipt?.status||'retry',at:new Date(now()).toISOString()};await Core.within(()=>store.setJSON('last-alert-run',result));return result;
  };
}
export const run=createDelivery();
