import {getStore} from '@netlify/blobs';
import Core from './job-moderation-core.cjs';
import {verifyOwner} from './job-moderation-auth.mjs';
import Discovery from './job-discovery.cjs';
import JobSource from './job-source.cjs';
import InternshipStatus from './internship-status.cjs';
import Identity from '../../../js/job-identity.js';
import snapshot from '../../../internships-data.json' with {type:'json'};
const HEADERS=Object.freeze({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const storeFor=scope=>getStore({name:'su-job-moderation-v1-'+scope,consistency:'strong'});
export async function currentCatalog(link){
  const source=await Discovery.fetchCatalog(),keys=Identity.keys(link);
  // Main-board actions do not depend on the availability of a separate lane.
  if(source.jobs.some(job=>Identity.keys(job.link).some(key=>keys.includes(key))))return source;
  const now=Date.now(),approved=InternshipStatus.approvedSnapshot(snapshot,now);
  const live=InternshipStatus.suppress(approved,await InternshipStatus.fetchStatuses(fetch,now),now);
  const {shareEntries}=JobSource;
  return {jobs:live.jobs.map(job=>({...job,identity:Identity.keys(job.link)[0],aliases:shareEntries(job).map(entry=>entry.slug),co:job.co||job.company,role:job.role||job.title})),checkedAt:Date.now()};
}
export function createService({openStore=storeFor,authenticate=verifyOwner,getCatalog=currentCatalog,now=Date.now}={}){
  return async function handle(request,context,{admin=false}={}){
    try{
      const scope=Core.scopeFor(request,context);
      if(admin){
        if(request.method!=='GET')return response(405,{error:'Method not allowed'});
        Core.authorizeOrigin(request,{readOnly:true});if((await authenticate(request))?.role!=='owner')throw Core.fail(403,'Owner access required');
        const {state}=await Core.readState(openStore(scope));
        return response(200,{schemaVersion:1,scope,revision:state.revision,records:state.records,history:state.history,checkedAt:new Date(now()).toISOString()});
      }
      if(request.method==='GET')return response(200,Core.publicIndex((await Core.readState(openStore(scope))).state,now()));
      if(request.method!=='POST')return response(405,{error:'Method not allowed'});
      Core.authorizeOrigin(request);if((await authenticate(request))?.role!=='owner')throw Core.fail(403,'Owner access required');
      // Preview rollout only. A later explicit production review must remove this gate.
      if(scope==='production')return response(403,{error:'Owner changes are available on preview only.'});
      const input=await Core.requestBody(request);
      return response(200,await Core.mutate({store:openStore(scope),input,scope,getCatalog,now}));
    }catch(error){const safe=error.moderationSafe&&[400,401,403,409,413,415,503].includes(error.status);return response(safe?error.status:503,{error:safe?error.message:'Job moderation is temporarily unavailable. Please retry.'});}
  };
}
export const handle=createService();
export async function moderationIndex(context,request){return Core.publicIndex((await Core.readState(storeFor(Core.scopeFor(request,context)))).state);}
