import {handle} from './lib/tracker-reports.mjs';
export default async(request: Request, context: any)=>handle(request,context);
export const config={path:'/api/tracker-reports'};
