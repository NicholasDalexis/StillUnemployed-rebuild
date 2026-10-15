import service from './lib/analytics-service.cjs';
import Account from './lib/account-state.cjs';
export default async function(){try{if(process.env.SU_ANALYTICS_ENABLED==='true')await service.cleanup(service.dependencies());else await Account.cleanupExpired(Account.dependencies());return new Response(null,{status:200});}catch{return new Response(null,{status:503});}}
export const config={schedule:'0 4 * * *'};
