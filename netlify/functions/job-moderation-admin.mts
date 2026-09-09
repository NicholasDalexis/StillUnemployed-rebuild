import {handle} from './lib/job-moderation.mjs';
export default async (request: Request, context: any) => handle(request,context,{admin:true});
export const config = {path:'/api/job-moderation/admin'};
