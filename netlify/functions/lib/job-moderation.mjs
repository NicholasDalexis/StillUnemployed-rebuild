import {getStore} from '@netlify/blobs';
import Core from './job-moderation-core.cjs';
import {availabilityIndex} from './job-availability-index.mjs';
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
export function createService({openStore=storeFor,authenticate=verifyOwner,getCatalog=currentCatalog,getAvailability=(request,context)=>availabilityIndex(context,request),now=Date.now}={}){
  return async function handle(request,context,{admin=false}={}){
    try{
      const scope=Core.scopeFor(request,context);
      if(admin){
        if(request.method!=='GET')return response(405,{error:'Method not allowed'});
        Core.authorizeOrigin(request,{readOnly:true});if((await authenticate(request))?.role!=='owner')throw Core.fail(403,'Owner access required');
        const {state}=await Core.readState(openStore(scope));
        const availability=await getAvailability(request,context);
        return response(200,{schemaVersion:1,scope,revision:state.revision+availability.revision,ownerRevision:state.revision,records:state.records,history:state.history,checkedAt:new Date(now()).toISOString()});
      }
      if(request.method==='GET'){const [stored,availability]=await Promise.all([Core.readState(openStore(scope)),getAvailability(request,context)]);return response(200,combineIndex(Core.publicIndex(stored.state,now()),availability));}
      if(request.method!=='POST')return response(405,{error:'Method not allowed'});
      Core.authorizeOrigin(request);if((await authenticate(request))?.role!=='owner')throw Core.fail(403,'Owner access required');
      // Preview rollout only. A later explicit production review must remove this gate.
      if(scope==='production')return response(403,{error:'Owner changes are available on preview only.'});
      const input=await Core.requestBody(request),store=openStore(scope);
      if(input.expectedRevision!==undefined){const [stored,availability]=await Promise.all([Core.readState(store),getAvailability(request,context)]);const prior=Core.replay(stored.state,input,scope);if(prior)return response(200,{...prior,revision:prior.revision+availability.revision});if(input.expectedRevision!==stored.state.revision+availability.revision)throw Core.conflict();input.expectedRevision=stored.state.revision;}
      const receipt=await Core.mutate({store,input,scope,getCatalog,now}),availability=await getAvailability(request,context);
      return response(200,{...receipt,revision:receipt.revision+availability.revision});
    }catch(error){const safe=error.moderationSafe&&[400,401,403,409,413,415,503].includes(error.status);return response(safe?error.status:503,{error:safe?error.message:'Job moderation is temporarily unavailable. Please retry.'});}
  };
}
export const handle=createService();
export function combineIndex(owner,availability){if(!availability||availability.schemaVersion!==1||!Number.isSafeInteger(availability.revision)||availability.revision<0||!Array.isArray(availability.removed))throw Core.unavailable();const removed=owner.removed.concat(availability.removed);return {...owner,revision:owner.revision+availability.revision,removed};}
export async function moderationIndex(context,request){const [stored,availability]=await Promise.all([Core.readState(storeFor(Core.scopeFor(request,context))),availabilityIndex(context,request)]);return combineIndex(Core.publicIndex(stored.state),availability);}
