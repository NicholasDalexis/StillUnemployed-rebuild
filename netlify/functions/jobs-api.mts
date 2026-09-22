import {createJobsHandler} from './lib/jobs-api.mjs';
import {moderationIndex} from './lib/job-moderation.mjs';
import {availabilityIndex} from './lib/job-availability-index.mjs';
import {openapi} from './lib/jobs-openapi.mjs';

const handle=createJobsHandler({getModeration:moderationIndex,getAvailability:availabilityIndex});
export default async (request: Request,context: any) => {
  // Enable only in the environment whose release has been approved and tested.
  if (globalThis.Netlify?.env?.get('JOBS_API_ENABLED') !== 'true') return new Response(request.method==='HEAD'?null:JSON.stringify({error:{code:'api_not_enabled',message:'The jobs API is not enabled in this environment.'}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex','Retry-After':'60'}});
  if (new URL(request.url).pathname === '/api/jobs/openapi.json' && ['GET','HEAD'].includes(request.method)) return new Response(request.method==='HEAD'?null:JSON.stringify({...openapi,servers:[{url:new URL(request.url).origin}]}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return handle(request,context);
};

export const config={
  path:['/api/jobs/search','/api/jobs/openapi.json','/api/jobs/:id'],
  rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}
};
