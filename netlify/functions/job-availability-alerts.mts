import {run} from './lib/availability-alert-delivery.mjs';
export default async (_request: Request, context: any)=>{try{const result=await run(context);return new Response(null,{status:['disabled','uncertain','retry'].includes(result.state)?503:200});}catch{return new Response(null,{status:503});}};
export const config={schedule:'*/5 * * * *'};
