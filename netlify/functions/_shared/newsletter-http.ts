import Service from '../lib/analytics-service.cjs';
export async function respond(request: Request, action: Function, deployContext?: string, dependencyFactory = Service.dependencies) {
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  try {
    if(request.method!=='POST')return new Response('{"error":"Method not allowed"}',{status:405,headers});
    // Bound the stream before reading a provider payload that can contain PII.
    const reader=request.body?.getReader();let size=0;const chunks=[];
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return new Response('{"error":"Request too large"}',{status:413,headers});}chunks.push(Buffer.from(value));}
    const env=Object.fromEntries(['SU_ANALYTICS_ENABLED','SU_FIREBASE_SERVICE_ACCOUNT','SU_ANALYTICS_SECRET','SU_ANALYTICS_ADMIN_UIDS','SU_ALLOWED_ORIGINS','SU_NEWSLETTER_ATTRIBUTION_ENABLED','SU_BEEHIIV_WEBHOOK_SECRET','CONTEXT'].map(key=>[key,Netlify.env.get(key)]));
    if(deployContext)env.CONTEXT=deployContext;
    const input={httpMethod:request.method,headers:Object.fromEntries(request.headers),body:Buffer.concat(chunks).toString('utf8')};
    return new Response(JSON.stringify(await action(input,dependencyFactory(env))),{status:200,headers});
  }catch(error){return new Response(JSON.stringify({error:error.status?error.message:'Newsletter measurement unavailable'}),{status:error.status||503,headers});}
}
