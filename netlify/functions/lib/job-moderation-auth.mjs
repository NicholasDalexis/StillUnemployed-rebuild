import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';
import Core from './job-moderation-core.cjs';
import config from '../../../__/firebase/init.json' with {type:'json'};
export const PROJECT='stillunemployed-17de9';
export const OWNER='nicholasdalexis@gmail.com';
export const JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const LOOKUP_URL='https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const denied=()=>Core.fail(401,'Sign in again to verify owner access.');
const lower=value=>typeof value==='string'?value.toLowerCase():'';

// Upstream bodies and tokens are used only in memory, never logged or returned.
export async function boundedJSON(url,options={},fetchImpl=fetch,bytes=65536){
  const controller=new AbortController();
  try{return await Core.within(async()=>{
    const response=await fetchImpl(url,{...options,redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal});
    if(response.redirected||response.status!==200){if(response.body)await response.body.cancel();throw response.status===400||response.status===401?denied():Core.unavailable();}
    if(response.url&&response.url!==url)throw Core.unavailable();
    if(!(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Core.unavailable();
    const length=response.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>bytes))throw Core.unavailable();
    const raw=await Core.readLimited(response.body,bytes);try{return JSON.parse(raw);}catch{throw Core.unavailable();}
  },5000);}catch(error){if(error.status===401)throw error;throw Core.unavailable();}finally{controller.abort();}
}
export function validateClaims(payload,now){
  const seconds=Math.floor(now/1000);
  if(!payload||payload.aud!==PROJECT||payload.iss!=='https://securetoken.google.com/'+PROJECT||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||!Number.isSafeInteger(payload.exp)||payload.exp<=seconds||!Number.isSafeInteger(payload.iat)||payload.iat>seconds||payload.iat<0||!Number.isSafeInteger(payload.auth_time)||payload.auth_time>seconds||payload.auth_time>payload.iat||payload.auth_time<0)throw denied();
  if(payload.email_verified!==true||lower(payload.email)!==OWNER||payload.firebase?.sign_in_provider!=='google.com'||payload.firebase?.tenant)throw Core.fail(403,'Owner access required');
}
export function validateAccount(payload,result){
  if(!result||!Array.isArray(result.users)||result.users.length!==1)throw denied();
  const account=result.users[0];
  if(!account||account.localId!==payload.sub||account.disabled===true||account.emailVerified!==true||lower(account.email)!==OWNER||!Array.isArray(account.providerUserInfo)||!account.providerUserInfo.some(provider=>provider.providerId==='google.com'))throw denied();
  // Google's live account validSince is the minimum token-authentication epoch.
  // Signature and exp checks alone do not establish revocation status.
  if(!/^\d+$/.test(String(account.validSince))||!Number.isSafeInteger(Number(account.validSince))||payload.auth_time<Number(account.validSince))throw denied();
  return {role:'owner'};
}
let keySet;
function remoteKeys(){
  return keySet ||= createRemoteJWKSet(new URL(JWKS_URL),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:300000,[customFetch]:async(url)=>new Response(JSON.stringify(await boundedJSON(String(url),{method:'GET'},fetch,65536)),{status:200,headers:{'Content-Type':'application/json'}})});
}
export async function verifyOwner(request,{verify=jwtVerify,keys,fetchImpl=fetch,now=Date.now}={}){
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization))throw denied();
  const token=authorization.slice(7);
  let payload;
  try{const checked=await verify(token,keys||remoteKeys(),{algorithms:['RS256'],audience:PROJECT,issuer:'https://securetoken.google.com/'+PROJECT,requiredClaims:['sub','iat','exp','auth_time'],currentDate:new Date(now())});if(checked.protectedHeader?.alg!=='RS256'||typeof checked.protectedHeader?.kid!=='string'||!checked.protectedHeader.kid)throw denied();payload=checked.payload;}
  catch(error){if(error.status===503)throw error;throw denied();}
  validateClaims(payload,now());
  if(config.projectId!==PROJECT||typeof config.apiKey!=='string')throw Core.unavailable();
  const result=await boundedJSON(LOOKUP_URL+'?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},fetchImpl,65536);
  return validateAccount(payload,result);
}
