import {createHandler,catalogFromCSV} from './lib/public-counts.mjs';
import Discovery from './lib/job-discovery.cjs';
import Status from './lib/internship-status.cjs';
import {moderationIndex} from './lib/job-moderation.mjs';
import snapshot from '../../internships-data.json' with {type:'json'};

const catalog=Status.createHandler({snapshot});
const handle=createHandler({getJobs:()=>Discovery.fetchCatalog({parseCatalog:catalogFromCSV}),getInternships:()=>catalog({httpMethod:'GET'}),getIndex:moderationIndex});
export default async(request: Request,context: any)=>handle(request,context);
export const config={path:'/api/public-counts',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
