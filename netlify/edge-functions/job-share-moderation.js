// Run before generated share files. A rewrite fallback alone cannot suppress
// an existing static /j/<theme>/<slug>.html page.
const SITE_ID='13d48d6e-e0ac-4d52-8a65-4fcbb9fdbc16';
const MAX_BYTES=4194304;
// The legacy share hash is identical to JobSource.slugOf and the board's suSlug.
// Kept runtime-independent here; parity tests pin it to the canonical generator.
export function shareSlug(str){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(36)+(h1>>>0).toString(36);
}
function page(status,title,message){
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' | StillUnemployed</title><style>body{margin:0;background:#efe6d2;color:#292116;font:18px/1.6 system-ui,sans-serif}main{max-width:36rem;margin:12vh auto;padding:2rem;background:#fbf9f0}a{color:#9c3820}</style><main><h1>'+title+'</h1><p>'+message+'</p><a href="/jobs.html">Back to the job board</a></main></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}
async function evaluateShare(request,context,fetchImpl=fetch){
  const url=new URL(request.url);
  let path;try{path=decodeURIComponent(url.pathname);}catch{return page(404,'This link is unavailable','Browse the board for current roles.');}
  const internshipImage=path.startsWith('/j/og/internships/');
  if(path.startsWith('/j/og/')&&!internshipImage)return context.next();
  const internship=path.startsWith('/j/internships/')||internshipImage;
  const match=path.match(internshipImage ? /^\/j\/og\/internships\/(?:original|poker|girly|mermaid|bratt|noir|beauty|chess)\/([a-zA-Z0-9_-]{1,300})\.png$/ : internship ? /^\/j\/internships\/(?:original|poker|girly|mermaid|bratt|noir|beauty|chess)\/([a-zA-Z0-9_-]{1,300})(?:\.html)?\/?$/ : /^\/j\/[^/]+\/([a-zA-Z0-9_-]{1,300})(?:\.html)?\/?$/);
  if(!match)return page(404,'This link is unavailable','Browse the board for current roles.');
  let timer;
  const controller=new AbortController();
  try{
    if(context?.site?.id!==SITE_ID||url.protocol!=='https:'||url.port||!(/^[a-z0-9-]+--stillunemployed\.netlify\.app$/.test(url.hostname)||['stillunemployed.com','www.stillunemployed.com','stillunemployed.netlify.app'].includes(url.hostname)))throw Error('unavailable');
    const work=(async()=>{
      // The existing internship endpoint applies approved-snapshot validation,
      // live Sheet suppression and owner moderation. Static share pages cannot
      // become a second, stale catalog when a source is removed or unavailable.
      const target=url.origin+(internship?'/.netlify/functions/internships-catalog':'/api/job-moderation');
      const response=await fetchImpl(target,{redirect:'manual',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if(response.status!==200||response.redirected||(response.url&&response.url!==target)||!(response.headers.get('content-type')||'').startsWith('application/json'))throw Error('unavailable');
      const reader=response.body?.getReader();if(!reader)throw Error('unavailable');
      const chunks=[];let bytes=0;
      try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('unavailable');}chunks.push(part.value);}}finally{reader.releaseLock();}
      const raw=new Uint8Array(bytes);let offset=0;for(const part of chunks){raw.set(part,offset);offset+=part.byteLength;}
      const index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(internship){
        if(![1,2].includes(index?.schemaVersion)||!['verified','awaiting_verification'].includes(index.status)||!Array.isArray(index.jobs)||index.jobs.length>2000||!Number.isSafeInteger(index.moderationRevision)||index.moderationRevision<0)throw Error('unavailable');
        if(index.jobs.length&&(!Number.isFinite(Date.parse(index.statusCheckedAt))||Math.abs(Date.now()-Date.parse(index.statusCheckedAt))>30000))throw Error('unavailable');
        const slugs=new Set();
        for(const job of index.jobs){
          if(typeof job.link!=='string'||job.link.length>2000||!['open','upcoming'].includes(job.applicationStatus||job.verification?.status))throw Error('unavailable');
          const link=new URL(job.link);if(!['http:','https:'].includes(link.protocol)||link.username||link.password)throw Error('unavailable');
          const slug=shareSlug(job.link);if(slugs.has(slug))throw Error('unavailable');slugs.add(slug);
        }
        return !slugs.has(match[1]);
      }
      if(index?.schemaVersion!==1||!Number.isSafeInteger(index.revision)||index.revision<0||!Array.isArray(index.removed)||index.removed.length>1000||!Number.isFinite(Date.parse(index.checkedAt))||Math.abs(Date.now()-Date.parse(index.checkedAt))>30000)throw Error('unavailable');
      for(const record of index.removed)if(!Array.isArray(record.slugs)||record.slugs.length>64||record.slugs.some(slug=>typeof slug!=='string'||!/^[a-zA-Z0-9_-]{1,300}$/.test(slug)))throw Error('unavailable');
      return index.removed.some(record=>record.slugs.includes(match[1]));
    })();
    const removed=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('unavailable'));},8000);})]);
    if(removed)return page(410,'This role is no longer on the board','Your saved jobs and application tracker stay with you. Browse the board for another role.');
    const response=await context.next();
    for(const name of ['Cache-Control','CDN-Cache-Control','Netlify-CDN-Cache-Control'])response.headers.set(name,'no-store');
    return response;
  }catch{return page(503,'We could not check this role','Please try again in a moment.');}
  finally{clearTimeout(timer);controller.abort();}
}
// Netlify's Edge method enum does not accept HEAD. Match all methods and
// enforce GET/HEAD here so HEAD still receives the same availability gate.
export async function shareGate(request,context,fetchImpl=fetch){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  const response=await evaluateShare(request,context,fetchImpl);
  return request.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;
}
export default shareGate;
export const config={path:'/j/*',onError:'fail'};
