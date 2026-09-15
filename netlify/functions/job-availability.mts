import {handle} from './lib/job-availability.mjs';
export default async(request: Request, context: any)=>handle(request,context);
export const config={path:'/api/job-availability'};
