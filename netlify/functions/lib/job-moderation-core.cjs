'use strict';
// One conditional-write document preserves unlisting and its audit atomically.
const {createHash}=require('node:crypto');
const Identity=require('../../../js/job-identity.js');
const SITE_ID='13d48d6e-e0ac-4d52-8a65-4fcbb9fdbc16';
const LIMITS=Object.freeze({requestBytes:16384,stateBytes:4194304,records:1000,history:5000,attempts:3,ioMs:4000});
const fail=(status,message)=>Object.assign(new Error(message),{status,moderationSafe:true});
const unavailable=()=>fail(503,'Job moderation is temporarily unavailable. Please retry.');
const conflict=()=>fail(409,'The board changed. Refresh before trying again.');
const hash=value=>createHash('sha256').update(value).digest('hex');
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validLink=value=>typeof value==='string'&&value.length<=8192&&Identity.inspect(value).valid&&!Identity.inspect(value).ambiguous;
const overlap=(a,b)=>a.some(key=>b.includes(key));
function scopeFor(request,context){
  if(context?.site?.id!==SITE_ID||context.site.name!=='stillunemployed')throw unavailable();
  const deploy=context?.deploy?.context;
  const scope=deploy==='production'?'production':['branch-deploy','deploy-preview'].includes(deploy)?'preview':null;
  if(!scope)throw unavailable();
  const url=new URL(request.url),host=url.hostname;
  const known=scope==='production'?['stillunemployed.com','www.stillunemployed.com','stillunemployed.netlify.app'].includes(host):/^[a-z0-9-]+--stillunemployed\.netlify\.app$/.test(host);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!known)throw fail(403,'Request not allowed');
  return scope;
}
function authorizeOrigin(request,{readOnly=false}={}){
  const origin=request.headers.get('origin');
  if((!readOnly||origin!==null)&&origin!==new URL(request.url).origin)throw fail(403,'Request not allowed');
  const site=request.headers.get('sec-fetch-site');
  if(site&&site!=='same-origin')throw fail(403,'Request not allowed');
}
async function within(work,ms=LIMITS.ioMs){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),ms);})]);}finally{clearTimeout(timer);}}
async function readLimited(body,bytes){
  if(!body?.getReader)throw fail(400,'Invalid request');
  const reader=body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>bytes){await reader.cancel();throw fail(413,'Request too large');}parts.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
}
async function requestBody(request){
  if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')throw fail(415,'Use JSON');
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>LIMITS.requestBytes))throw fail(413,'Request too large');
  let input;try{input=JSON.parse(await within(()=>readLimited(request.body,LIMITS.requestBytes),3000));}catch(e){if(e.status)throw e;throw fail(400,'Invalid request');}
  if(!plain(input)||Object.keys(input).some(key=>!['action','link','requestId','expectedRevision'].includes(key))||!['report','restore'].includes(input.action)||!validLink(input.link)||typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))throw fail(400,'Invalid request');
  if(input.expectedRevision!==undefined&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0))throw fail(400,'Invalid revision');
  if(input.action==='restore'&&input.expectedRevision===undefined)throw fail(400,'Refresh before restoring a job');
  return {...input,requestId:input.requestId.toLowerCase()};
}
function empty(){return {schemaVersion:1,revision:0,records:[],history:[]};}
function validateState(state){
  if(!plain(state)||state.schemaVersion!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.records)||!Array.isArray(state.history)||state.records.length>LIMITS.records||state.history.length>LIMITS.history||Buffer.byteLength(JSON.stringify(state))>LIMITS.stateBytes)throw unavailable();
  const recordIds=new Set(),requests=new Set();
  for(const record of state.records){
    if(!plain(record)||typeof record.id!=='string'||!/^[a-f0-9]{64}$/.test(record.id)||recordIds.has(record.id)||!validLink(record.link)||!Array.isArray(record.keys)||!record.keys.length||record.keys.length>64||record.keys.some(key=>typeof key!=='string'||key.length>8200||!/^(url:|ats:)/.test(key))||!Array.isArray(record.slugs)||record.slugs.length>64||record.slugs.some(slug=>typeof slug!=='string'||!/^[a-zA-Z0-9_-]{1,300}$/.test(slug))||typeof record.removed!=='boolean'||!Number.isSafeInteger(record.revision)||record.revision<1||record.revision>state.revision||!plain(record.metadata))throw unavailable();
    recordIds.add(record.id);
  }
  let previous=0;
  for(const event of state.history){
    if(!plain(event)||typeof event.requestId!=='string'||requests.has(event.requestId)||!recordIds.has(event.recordId)||!['report','restore'].includes(event.action)||event.actor!=='owner'||!Number.isSafeInteger(event.revision)||event.revision<=previous||event.revision>state.revision||!Number.isFinite(Date.parse(event.at)))throw unavailable();
    previous=event.revision;requests.add(event.requestId);
  }
  if(state.history.length!==state.revision||previous!==state.revision)throw unavailable();
  return state;
}
async function readState(store){
  const read=await within(()=>store.getWithMetadata('state',{type:'text',consistency:'strong'}));
  if(read===null)return {state:empty(),etag:null};
  if(!read||typeof read.data!=='string'||Buffer.byteLength(read.data)>LIMITS.stateBytes||typeof read.etag!=='string'||!read.etag)throw unavailable();
  let state;try{state=JSON.parse(read.data);}catch{throw unavailable();}
  return {state:validateState(state),etag:read.etag};
}
function publicIndex(state,now=Date.now()){
  validateState(state);
  return {schemaVersion:1,revision:state.revision,removed:state.records.filter(record=>record.removed).map(record=>({keys:record.keys.slice(),slugs:record.slugs.slice(),link:record.link})),checkedAt:new Date(now).toISOString()};
}
function sourceRecord(job){
  if(!plain(job)||!validLink(job.link))throw unavailable();
  const keys=[...new Set([...(job.identity?[job.identity]:[]),...Identity.keys(job.link)])];
  const slugs=[...new Set(job.aliases||[])];
  const metadata={lane:job.internship?'internships':'jobs',sourceStatus:'Active'};
  for(const field of ['co','role','loc','pay','exp','style','ind','summary','description','sourceRevision','applicationStatus','added','posted'])if(job[field]!==undefined){if(typeof job[field]!=='string'||job[field].length>20000)throw unavailable();metadata[field]=job[field];}
  return {id:hash(keys[0]),link:job.link,keys,slugs,metadata,removed:true,revision:1};
}
function replay(state,input,scope){
  const event=state.history.find(item=>item.requestId===input.requestId);
  if(!event)return null;
  if(event.action!==input.action||event.requestLink!==input.link)throw conflict();
  const record=state.records.find(item=>item.id===event.recordId);
  // A retry acknowledges the original operation, never repeats it after a later reversal.
  if(!record||record.revision!==event.revision)throw conflict();
  return {...(event.action==='report'?{reported:true}:{restored:true}),link:record.link,revision:event.revision,requestId:input.requestId,scope};
}
async function mutate({store,input,scope,getCatalog,now=Date.now}){
  let catalog;
  for(let attempt=0;attempt<LIMITS.attempts;attempt++){
    const {state,etag}=await readState(store),prior=replay(state,input,scope);if(prior)return prior;
    if(input.expectedRevision!==undefined&&input.expectedRevision!==state.revision)throw conflict();
    if(state.history.length>=LIMITS.history)throw fail(503,'Moderation history is full. No change was made.');
    const requestedKeys=Identity.keys(input.link),matches=state.records.filter(record=>overlap(record.keys,requestedKeys));
    if(matches.length>1)throw conflict();
    let record=matches[0];
    if(input.action==='report'){
      catalog ||= await within(()=>getCatalog(input.link),12000);
      if(!catalog||!Array.isArray(catalog.jobs)||!Number.isFinite(catalog.checkedAt)||now()-catalog.checkedAt>30000||catalog.checkedAt>now()+1000)throw unavailable();
      const jobs=catalog.jobs.filter(job=>overlap(Identity.keys(job.link),requestedKeys));
      if(jobs.length!==1)throw fail(409,'This job is not in the current board. Refresh to check it.');
      const candidate=sourceRecord(jobs[0]);
      if(!record){if(state.records.length>=LIMITS.records)throw fail(503,'Moderation history is full. No change was made.');record=candidate;state.records.push(record);}
      else{record.keys=[...new Set(record.keys.concat(candidate.keys))];record.slugs=[...new Set(record.slugs.concat(candidate.slugs))];}
    }else if(!record||!record.removed)throw conflict();
    const revision=state.revision+1;
    record.removed=input.action==='report';record.revision=revision;state.revision=revision;
    state.history.push({requestId:input.requestId,requestLink:input.link,recordId:record.id,action:input.action,reason:input.action==='report'?'Owner reported job no longer available':'Owner restored board visibility',actor:'owner',at:new Date(now()).toISOString(),revision});
    validateState(state);
    const written=await within(()=>store.setJSON('state',state,etag?{onlyIfMatch:etag}:{onlyIfNew:true}));
    if(!written?.modified)continue;
    const confirmed=await readState(store),result=replay(confirmed.state,input,scope);
    if(!result)throw unavailable();
    return result;
  }
  throw conflict();
}
module.exports={SITE_ID,LIMITS,fail,unavailable,conflict,scopeFor,authorizeOrigin,within,readLimited,requestBody,empty,validateState,readState,publicIndex,sourceRecord,mutate};
