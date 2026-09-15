'use strict';
const {createHash,createHmac,randomBytes}=require('node:crypto');
const {isIP}=require('node:net');
const Core=require('./job-moderation-core.cjs');
const Identity=require('../../../js/job-identity.js');
const MAX_BYTES=8*1024*1024,MAX_RECORDS=2000,MAX_RECEIPTS=10000,DAY=86400000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[a-f\d]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(x);
const failed=()=>Core.fail(503,'Reports are temporarily unavailable. Please retry.');
function text(value,max,{optional=false}={}){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||(!optional&&!value.trim()))throw Core.fail(400,'Invalid report');return value.trim();}
function publicURL(value,{optional=false}={}){
  if(optional&&value==='')return '';
  if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f]/.test(value))throw Core.fail(400,'Invalid posting link');
  let u;try{u=new URL(value);}catch{throw Core.fail(400,'Invalid posting link');}
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  // Reports store public links only. They never cause a fetch to this address.
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!host.includes('.')||isIP(host)||host.includes(':')||host.startsWith('[')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host))throw Core.fail(400,'Use a public job-posting link');
  // Greenhouse's documented embed token is the public numeric posting ID.
  // Only a confirmed provider identity admits that exception, never arbitrary tokens.
  const publicPostingToken=['boards.greenhouse.io','job-boards.greenhouse.io','boards.eu.greenhouse.io'].includes(host)&&u.pathname==='/embed/job_app'&&Identity.keys(u.href).some(k=>/^ats:greenhouse(?:-eu)?:/.test(k));
  if(Array.from(u.searchParams.keys()).some(k=>/^(access_token|id_token|token|authorization|auth|password|email|session|signature|api_key)$/i.test(k)&&!(k==='token'&&publicPostingToken))||/(?:^|[?#&])(access_token|id_token|token|authorization|auth|password|email|session|signature|api_key)=/i.test(u.hash))throw Core.fail(400,'Use the public posting link without account details');
  // A fragment can identify another role in an application router. Preserve it
  // so reporting that link cannot accidentally select the unfragmented role.
  return u.href;
}
async function body(request,allowed){
  if((request.headers.get('content-type')||'').split(';')[0].toLowerCase().trim()!=='application/json')throw Core.fail(415,'Use JSON');
  const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>16384))throw Core.fail(413,'Request too large');
  let input;try{input=JSON.parse(await Core.within(()=>Core.readLimited(request.body,16384),3000));}catch(e){if(e.status)throw e;throw Core.fail(400,'Invalid report');}
  if(!plain(input)||Object.keys(input).some(k=>!allowed.includes(k))||!uuid(input.requestId))throw Core.fail(400,'Invalid report');return {...input,requestId:input.requestId.toLowerCase()};
}
function empty(){return {schemaVersion:1,revision:0,secret:randomBytes(32).toString('hex'),records:[],receipts:[]};}
function validate(state){
  if(!plain(state)||state.schemaVersion!==1||!id(state.secret)||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.records)||state.records.length>MAX_RECORDS||!Array.isArray(state.receipts)||state.receipts.length>MAX_RECEIPTS||Buffer.byteLength(JSON.stringify(state))>MAX_BYTES)throw failed();
  const ids=new Set(),keys=new Set();for(const r of state.records){if(!plain(r)||!id(r.reportId)||ids.has(r.reportId)||typeof r.status!=='string'||!Number.isFinite(Date.parse(r.receivedAt)))throw failed();ids.add(r.reportId);}
  for(const r of state.receipts){if(!plain(r)||!id(r.key)||keys.has(r.key)||!id(r.fingerprint)||!ids.has(r.reportId)||!Number.isFinite(Date.parse(r.at))||!plain(r.response))throw failed();keys.add(r.key);}
  if(state.revision!==state.receipts.length)throw failed();return state;
}
async function read(store){const r=await Core.within(()=>store.getWithMetadata('state',{type:'text',consistency:'strong'}));if(r===null)return {state:empty(),etag:null};if(!r||typeof r.data!=='string'||Buffer.byteLength(r.data)>MAX_BYTES||typeof r.etag!=='string'||!r.etag)throw failed();let state;try{state=JSON.parse(r.data);}catch{throw failed();}return {state:validate(state),etag:r.etag};}
function actor(state,uid,ip,now){
  if(uid)return 'account:'+uid;
  if(typeof ip!=='string'||!isIP(ip))throw failed();
  // The salt stays inside private storage; daily guest identities cannot be linked across days.
  return 'guest:'+createHmac('sha256',state.secret).update(Math.floor(now/DAY)+'|'+ip).digest('hex');
}
function rate(state,who,now,network){const events=state.receipts.filter(r=>r.actor===who&&now-Date.parse(r.at)<DAY);if(events.length>=20||events.filter(r=>now-Date.parse(r.at)<3600000).length>=5)throw Core.fail(429,'Please wait before sending another report.');if(network){const shared=state.receipts.filter(r=>r.network===network&&now-Date.parse(r.at)<DAY);if(shared.length>=100||shared.filter(r=>now-Date.parse(r.at)<3600000).length>=30)throw Core.fail(429,'Please wait before sending another report.');}}
async function mutate({store,input,scope,uid,ip,now=Date.now,apply,rateExempt=false,attempts=3}){
  for(let attempt=0;attempt<attempts;attempt++){
    const {state,etag}=await read(store),at=now(),who=actor(state,uid,ip,at),key=hash(who+'|'+input.requestId),fingerprint=hash(JSON.stringify(input)),network=typeof ip==='string'&&isIP(ip)?createHmac('sha256',state.secret).update('network|'+Math.floor(at/DAY)+'|'+ip).digest('hex'):null;
    const prior=state.receipts.find(r=>r.key===key);
    if(prior){if(prior.fingerprint!==fingerprint)throw Core.fail(409,'Use a new request ID for a different report.');return {...prior.response,duplicate:true};}
    if(!rateExempt)rate(state,who,at,network);if(state.receipts.length>=MAX_RECEIPTS)throw failed();
    const result=await apply(state,{who,at,reportId:hash(key),uid});
    const response={schemaVersion:1,requestId:input.requestId,reportId:result.reportId,status:result.status,duplicate:!!result.duplicate,scope,...result.extra};
    state.receipts.push({key,actor:who,...(network?{network}:{}),fingerprint,reportId:result.reportId,at:new Date(at).toISOString(),response});state.revision++;validate(state);
    const saved=await Core.within(()=>store.setJSON('state',state,etag?{onlyIfMatch:etag}:{onlyIfNew:true}));if(!saved?.modified)continue;
    const check=await read(store),receipt=check.state.receipts.find(r=>r.key===key);if(!receipt||receipt.fingerprint!==fingerprint)throw failed();return receipt.response;
  }
  throw Core.fail(409,'Reports changed while saving. Please retry.');
}
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
function error(e){const safe=e.moderationSafe&&[400,401,403,404,409,413,415,429,503].includes(e.status);return response(safe?e.status:503,{error:safe?e.message:'Reports are temporarily unavailable. Please retry.'});}
function page(state,request){const url=new URL(request.url),cursor=url.searchParams.get('after'),limit=url.searchParams.get('limit')||'50';if(!/^\d{1,3}$/.test(limit)||Number(limit)<1||Number(limit)>100||cursor&&!id(cursor))throw Core.fail(400,'Invalid page');const start=cursor?state.records.findIndex(r=>r.reportId===cursor)+1:0;if(cursor&&!start)throw Core.fail(400,'Unknown page');const records=state.records.slice(start,start+Number(limit));return {schemaVersion:1,revision:state.revision,records,nextCursor:start+records.length<state.records.length?records.at(-1)?.reportId:null};}
module.exports={hash,plain,id,uuid,text,publicURL,body,empty,validate,read,mutate,response,error,page,MAX_RECORDS};
