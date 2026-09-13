// Deterministic public ATS evidence. Never execute or follow a supplied page URL.
import Core from './job-moderation-core.cjs';
import Identity from '../../../js/job-identity.js';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const tenant=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/;
function segments(path){const parts=path.split('/');for(const p of parts){let decoded;try{decoded=decodeURIComponent(p);}catch{return false;}if(['.','..'].includes(decoded)||/[\\/\u0000-\u001f]/.test(decoded))return false;}return true;}
export function targetFor(link){
  const info=Identity.inspect(link);if(!info.valid||info.ambiguous)return null;
  const key=info.keys.find(k=>k.startsWith('ats:'));if(!key)return null;const bits=key.split(':'),provider=bits[1],name=bits[2],id=bits[3];
  if(['greenhouse','greenhouse-eu'].includes(provider)&&tenant.test(name)&&/^\d+$/.test(id))return {provider,name,id,url:'https://'+(provider==='greenhouse-eu'?'boards-api.eu.greenhouse.io':'boards-api.greenhouse.io')+'/v1/boards/'+encodeURIComponent(name)+'/jobs/'+id};
  if(['lever','lever-eu'].includes(provider)&&tenant.test(name)&&uuid.test(id))return {provider,name,id,url:'https://'+(provider==='lever-eu'?'api.eu.lever.co':'api.lever.co')+'/v0/postings/'+encodeURIComponent(name)+'/'+id+'?mode=json'};
  if(provider==='ashby'&&tenant.test(name)&&uuid.test(id))return {provider,name,id,url:'https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(name)};
  if(provider==='smartrecruiters'&&tenant.test(name)&&/^\d+$/.test(id))return {provider,name,id,url:'https://api.smartrecruiters.com/v1/companies/'+encodeURIComponent(name)+'/postings/'+id};
  if(provider==='workday'&&/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(name)&&tenant.test(id)&&/^[A-Za-z0-9-]+$/.test(bits[4]||'')){
    const u=new URL(link),m=u.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?([^/]+)\/job\/(.+)$/);if(!m||m[1]!==id||!segments(m[2]))return null;
    return {provider,name,id:bits[4],url:'https://'+name+'/wday/cxs/'+name.split('.')[0]+'/'+encodeURIComponent(id)+'/job/'+m[2]};
  }
  return null;
}
async function read(target,fetchImpl){
  const controller=new AbortController();try{return await Core.within(async()=>{
    const r=await fetchImpl(target.url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
    if(r.redirected||r.url&&r.url!==target.url||![200,404].includes(r.status)){if(r.body)await r.body.cancel();throw Error('unavailable');}
    if(!(r.headers.get('content-type')||'').toLowerCase().startsWith('application/json')){if(r.body)await r.body.cancel();throw Error('not-json');}
    const length=r.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>1048576)){if(r.body)await r.body.cancel();throw Error('oversized');}
    const data=JSON.parse(await Core.readLimited(r.body,1048576));return {status:r.status,data};
  },4000);}finally{controller.abort();}
}
const text=x=>typeof x==='string'&&x.trim().length>2;
function explicitNotFound(r){return r.status===404&&r.data&&typeof r.data==='object'&&!Array.isArray(r.data)&&[r.data.error,r.data.message].some(x=>typeof x==='string'&&/^job not found[.!]?$/i.test(x));}
function assess(target,r,link,now){
  const d=r.data;if(r.status!==200||!d||typeof d!=='object'||Array.isArray(d))return null;
  if(target.provider==='workday'){
    if(d.postingAvailable===false)return {result:'closed',type:'workday_unavailable',excerpt:'postingAvailable: false'};
    if(d.postingAvailable===true&&d.jobPostingInfo&&String(d.jobPostingInfo.jobReqId)===target.id&&text(d.jobPostingInfo.title)&&text(d.jobPostingInfo.jobDescription))return {result:'open',type:'explicit_open',excerpt:'Exact Workday requisition with postingAvailable: true'};
  }else if(target.provider.startsWith('greenhouse')){
    if(String(d.id)===target.id&&text(d.title)&&text(d.content)&&(!d.application_deadline||Number.isFinite(Date.parse(d.application_deadline))&&Date.parse(d.application_deadline)>now))return {result:'open',type:'explicit_open',excerpt:'Exact published Greenhouse posting ID returned with job content'};
  }else if(target.provider.startsWith('lever')){
    if(d.id===target.id&&Identity.equivalent(d.hostedUrl,link)&&Identity.equivalent(d.applyUrl,link)&&text(d.text))return {result:'open',type:'explicit_open',excerpt:'Exact published Lever posting with hosted and application URLs'};
  }else if(target.provider==='ashby'){
    if(d.apiVersion==='1'&&Array.isArray(d.jobs)&&d.jobs.length<=5000){const found=d.jobs.filter(j=>Identity.equivalent(j.jobUrl,link));if(found.length===1&&found[0].isListed===true&&text(found[0].title)&&text(found[0].descriptionPlain||found[0].descriptionHtml)&&text(found[0].applyUrl))return {result:'open',type:'explicit_open',excerpt:'Exact published and listed Ashby job URL returned with application link'};}
  }else if(target.provider==='smartrecruiters'){
    if(String(d.id)===target.id&&text(d.name)&&d.jobAd?.sections?.jobDescription&&text(d.jobAd.sections.jobDescription.text))return {result:'open',type:'explicit_open',excerpt:'Exact published SmartRecruiters posting ID returned with job description'};
  }
  return null;
}
export async function verifyPosting(link,{fetchImpl=fetch,now=Date.now}={}){
  const target=targetFor(link),checkedAt=new Date(now()).toISOString();
  const result=(value,checks)=>({result:value.result,evidence:{url:link,sourceUrl:target?.url||null,type:value.type,excerpt:value.excerpt,checkedAt,checks}});
  if(!target)return result({result:'unknown',type:'unknown',excerpt:'No supported authoritative ATS identity; human review required'},0);
  try{
    const first=await read(target,fetchImpl);
    // An exact Job not found body must be observed twice. HTTP404 by itself,
    // missing board-list membership, expired deadlines and shells are UNKNOWN.
    if(explicitNotFound(first)){const second=await read(target,fetchImpl);if(explicitNotFound(second))return result({result:'closed',type:'job_not_found',excerpt:'Job not found'},2);return result({result:'unknown',type:'unknown',excerpt:'Inconsistent exact-posting responses'},2);}
    const found=assess(target,first,link,now());return result(found||{result:'unknown',type:'unknown',excerpt:'Response did not establish current posting availability'},1);
  }catch{return result({result:'unknown',type:'unknown',excerpt:'Could not obtain bounded authoritative posting evidence'},1);}
}
