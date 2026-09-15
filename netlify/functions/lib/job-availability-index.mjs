import {getStore} from '@netlify/blobs';
import Core from './job-moderation-core.cjs';
import Queue from './report-queue-core.cjs';
import Availability from './job-availability-core.cjs';
export async function availabilityIndex(context,request){return Availability.publicIndex((await Queue.read(getStore({name:'su-job-availability-v1-'+Core.scopeFor(request,context),consistency:'strong'}))).state,Date.now());}
