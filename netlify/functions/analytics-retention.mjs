import service from './lib/analytics-service.cjs';
export default async function(){try{await service.cleanup(service.dependencies());return new Response(null,{status:200});}catch{return new Response(null,{status:503});}}
export const config={schedule:'0 4 * * *'};
