'use strict';
// Local-review foundation only: no Netlify entrypoint, rewrite, sitemap or public
// CTA activates this renderer. A source row alone cannot authorize publication.
const {createHash}=require('node:crypto');
const Identity=require('../../../js/job-identity.js');
const SOURCE_URL='https://docs.google.com/spreadsheets/d/1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU/gviz/tq?tqx=out%3Acsv&headers=1&gid=2134483974';
const LIMITS=Object.freeze({bytes:2097152,rows:10000,field:20000,timeoutMs:5000,redirects:3});
const EXPECTED=['company','job title','link','location','type','salary','years of experience','category','description','pick','active/dead','date added','dead date','tl;dr','date posted'];
const HEADERS=Object.freeze({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'none'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
const unavailable=()=>new Error('Job source unavailable');
const hash=value=>createHash('sha256').update(value).digest('hex');
const esc=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const {parseCSV,rowsToJobs,shareEntries}=require('./job-source.cjs');

async function catalogFromCSV(csv,limits=LIMITS){
  if(typeof csv!=='string'||Buffer.byteLength(csv)>limits.bytes||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(csv))throw unavailable();
  const rows=parseCSV(csv);
  if(!rows.length||rows.length>limits.rows+1||rows[0].length!==EXPECTED.length||rows[0].some((value,index)=>value.trim().toLowerCase()!==EXPECTED[index]))throw unavailable();
  const all=[];
  for(const cells of rows.slice(1)){
    if(cells.every(value=>!value.trim()))continue;
    if(cells.length!==EXPECTED.length||cells.some(value=>value.length>limits.field))throw unavailable();
    const values=cells.map(value=>value.trim()),link=values[2];
    // Missing or malformed URLs never authorize a listing. All known aliases,
    // including inactive ones, stay in grouping until after status resolution.
    if(!link)continue;
    const inspected=Identity.inspect(link);
    if(!inspected.valid||inspected.ambiguous||!inspected.keys.length)throw unavailable();
    all.push({link,values});
  }
  const output=[];
  for(const group of Identity.groupJobs(all)){
    if(group.members.some(row=>row.values[10].toLowerCase()!=='active'))continue;
    const cells=group.job.values;
    const facts=row=>[...row.values.slice(0,2),...row.values.slice(3,9),row.values[13],row.values[14]];
    const fingerprint=JSON.stringify(facts(group.job));
    if(group.members.some(row=>JSON.stringify(facts(row))!==fingerprint))continue;
    const eligible=rowsToJobs([EXPECTED,cells]);
    if(eligible.length!==1)continue;
    const job={...eligible[0],identity:group.key,description:cells[8],summary:cells[13],posted:cells[14]};
    job.id=hash(job.identity).slice(0,24);
    job.sourceRevision=hash(JSON.stringify([job.identity,...facts(group.job)]));
    job.aliases=shareEntries({...job,_aliases:group.aliases}).map(entry=>entry.slug);
    output.push(job);
  }
  return output;
}

function allowedURL(url){return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname==='docs.google.com'||/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(url.hostname));}
async function boundedText(response,limits){
  if(!['text/csv','text/plain','application/csv'].includes((response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()))throw unavailable();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limits.bytes))throw unavailable();
  if(!response.body?.getReader)throw unavailable();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limits.bytes){await reader.cancel();throw unavailable();}chunks.push(Buffer.from(part.value));}}
  finally{reader.releaseLock();}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
async function fetchCatalog({fetchImpl=fetch,now=Date.now,limits=LIMITS}={}){
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable());},limits.timeoutMs);});
  const work=(async()=>{
    let url=new URL(SOURCE_URL);url.searchParams.set('_',String(now()));
    for(let redirects=0;redirects<=limits.redirects;redirects++){
      if(!allowedURL(url))throw unavailable();
      const response=await fetchImpl(url.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Accept:'text/csv','Cache-Control':'no-cache'}});
      if(response.redirected||(response.url&&!allowedURL(new URL(response.url))))throw unavailable();
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');if(response.body)await response.body.cancel();
        if(!location||redirects===limits.redirects)throw unavailable();url=new URL(location,url);continue;
      }
      if(response.status!==200){if(response.body)await response.body.cancel();throw unavailable();}
      return {jobs:await catalogFromCSV(await boundedText(response,limits),limits),checkedAt:now()};
    }
    throw unavailable();
  })();
  try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);controller.abort();}
}

function document(title,body){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>'+esc(title)+' | StillUnemployed.com</title><link rel="stylesheet" href="/css/brand.css"><link rel="stylesheet" href="/css/about.css"></head><body class="su-about"><main class="about-wrap"><nav aria-label="Site navigation"><a href="/jobs.html">← Back to jobs</a></nav>'+body+'</main></body></html>';}
function response(status,title,body){return{statusCode:status,headers:{...HEADERS},body:document(title,body)};}
async function availabilityWithin(availability,input,timeoutMs){
  let timer;
  try{return await Promise.race([Promise.resolve().then(()=>availability(input)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
function createHandler({getCatalog=fetchCatalog,availability,now=Date.now,gateTimeoutMs=5000}={}){
  return async event=>{
    if(!['GET','HEAD'].includes(event?.httpMethod))return {...response(405,'Method not allowed','<h1>Use the job link to view this page.</h1>'),headers:{...HEADERS,Allow:'GET, HEAD'}};
    const match=String(event.path||'').match(/^\/job\/([a-z0-9]{2,64})\/?$/);
    let result;
    if(!match)result=response(404,'Job not found','<h1>We could not find that job.</h1>');
    else try{
      // Default-closed and explicit: a future adapter must recheck authoritative
      // quarantine/closure state against these exact current source facts.
      if(typeof availability!=='function')throw unavailable();
      const source=await getCatalog();
      if(!Array.isArray(source.jobs)||!Number.isFinite(source.checkedAt)||source.checkedAt>now()+1000||now()-source.checkedAt>30000)throw unavailable();
      const matches=source.jobs.filter(job=>job.id===match[1]||job.aliases.includes(match[1]));
      if(matches.length!==1)result=response(404,'Job no longer available','<h1>This job is no longer available on the board.</h1>');
      else{
        const job=matches[0],gate=await availabilityWithin(availability,{identity:job.identity,sourceRevision:job.sourceRevision},gateTimeoutMs);
        if(!gate||gate.identity!==job.identity||gate.sourceRevision!==job.sourceRevision||!Number.isSafeInteger(gate.revision)||gate.revision<0||!Number.isFinite(gate.checkedAt)||gate.checkedAt>now()+1000||now()-gate.checkedAt>5000||!['open','quarantined','closed'].includes(gate.state))throw unavailable();
        if(gate.state!=='open')result=response(gate.state==='closed'?410:404,'Job no longer available','<h1>This job is not available on the board.</h1>');
        else{
          const text=job.summary||job.description;
          const paragraphs=text.split(/\r?\n/).filter(Boolean).map(line=>'<p>'+esc(line)+'</p>').join('');
          result=response(200,job.role+' at '+job.co,'<article class="about-note"><p class="about-eyebrow">'+esc(job.co)+'</p><h1>'+esc(job.role)+'</h1><p>'+esc(job.pay)+'</p><p>'+esc([job.loc,job.style,job.exp].filter(Boolean).join(' · '))+'</p>'+paragraphs+'<p><a href="'+esc(job.link)+'" rel="noopener noreferrer">Read the employer’s full posting →</a></p><p>The employer has the complete requirements and current application details.</p></article>');
        }
      }
    }catch{result=response(503,'Job temporarily unavailable','<h1>We could not check this job right now.</h1><p>Please try again shortly, or return to the board.</p>');result.headers['Retry-After']='60';}
    if(event.httpMethod==='HEAD')result.body='';
    return result;
  };
}
module.exports={SOURCE_URL,LIMITS,EXPECTED,catalogFromCSV,fetchCatalog,createHandler};
