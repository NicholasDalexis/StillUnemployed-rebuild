// Run before generated share files. A rewrite fallback alone cannot suppress
// an existing static /j/<theme>/<slug>.html page.
const SITE_ID='13d48d6e-e0ac-4d52-8a65-4fcbb9fdbc16';
const MAX_BYTES=4194304;
function page(status,title,message){
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' | StillUnemployed</title><style>body{margin:0;background:#efe6d2;color:#292116;font:18px/1.6 system-ui,sans-serif}main{max-width:36rem;margin:12vh auto;padding:2rem;background:#fbf9f0}a{color:#9c3820}</style><main><h1>'+title+'</h1><p>'+message+'</p><a href="/jobs.html">Back to the job board</a></main></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}
export async function shareGate(request,context,fetchImpl=fetch){
  const url=new URL(request.url);
  let path;try{path=decodeURIComponent(url.pathname);}catch{return page(404,'This link is unavailable','Browse the board for current roles.');}
  if(path.startsWith('/j/og/'))return context.next();
  const match=path.match(/^\/j\/[^/]+\/([a-zA-Z0-9_-]{1,300})(?:\.html)?\/?$/);
  if(!match)return page(404,'This link is unavailable','Browse the board for current roles.');
  let timer;
  const controller=new AbortController();
  try{
    if(context?.site?.id!==SITE_ID||url.protocol!=='https:'||url.port||!(/^[a-z0-9-]+--stillunemployed\.netlify\.app$/.test(url.hostname)||['stillunemployed.com','www.stillunemployed.com','stillunemployed.netlify.app'].includes(url.hostname)))throw Error('unavailable');
    const work=(async()=>{
      const target=url.origin+'/api/job-moderation';
      const response=await fetchImpl(target,{redirect:'manual',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if(response.status!==200||response.redirected||(response.url&&response.url!==target)||!(response.headers.get('content-type')||'').startsWith('application/json'))throw Error('unavailable');
      const reader=response.body?.getReader();if(!reader)throw Error('unavailable');
      const chunks=[];let bytes=0;
      try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('unavailable');}chunks.push(part.value);}}finally{reader.releaseLock();}
      const raw=new Uint8Array(bytes);let offset=0;for(const part of chunks){raw.set(part,offset);offset+=part.byteLength;}
      const index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
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
export default shareGate;
export const config={path:'/j/*',method:['GET','HEAD'],onError:'fail'};
