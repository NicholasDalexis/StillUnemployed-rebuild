// Community reports accept current Google or Apple accounts, never a client role.
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';
import {boundedJSON,PROJECT,JWKS_URL} from './job-moderation-auth.mjs';
import Core from './job-moderation-core.cjs';
import config from '../../../__/firebase/init.json' with {type:'json'};
import Account from './account-state.cjs';
const denied=()=>Core.fail(401,'Sign in again to send your report.');
const lower=value=>typeof value==='string'?value.toLowerCase():'';
export function validateClaims(p,now){
  const t=Math.floor(now/1000);
  if(!p||p.aud!==PROJECT||p.iss!=='https://securetoken.google.com/'+PROJECT||typeof p.sub!=='string'||!p.sub||p.sub.length>128||!Number.isSafeInteger(p.exp)||p.exp<=t||!Number.isSafeInteger(p.iat)||p.iat<0||p.iat>t||!Number.isSafeInteger(p.auth_time)||p.auth_time<0||p.auth_time>p.iat||!['google.com','apple.com'].includes(p.firebase?.sign_in_provider)||p.firebase?.tenant)throw denied();
  if(lower(p.email)){if(p.email_verified!==true)throw denied();}
  else if(!Array.isArray(p.firebase?.identities?.[p.firebase.sign_in_provider])||!p.firebase.identities[p.firebase.sign_in_provider].some(id=>typeof id==='string'&&id&&id.length<=256))throw denied();
}
export function validateAccount(p,result){
  const a=result?.users?.length===1?result.users[0]:null;
  const provider=a?.providerUserInfo?.find(x=>x.providerId===p.firebase?.sign_in_provider);
  if(!a||a.localId!==p.sub||a.disabled===true||!provider||!/^\d+$/.test(String(a.validSince))||!Number.isSafeInteger(Number(a.validSince))||p.auth_time<Number(a.validSince))throw denied();
  if(lower(p.email)){if(a.emailVerified!==true||lower(a.email)!==lower(p.email))throw denied();}
  else if(typeof provider.rawId!=='string'||!p.firebase.identities[p.firebase.sign_in_provider].includes(provider.rawId))throw denied();
  return {uid:p.sub};
}
let keys;
function remoteKeys(){return keys ||= createRemoteJWKSet(new URL(JWKS_URL),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:300000,[customFetch]:async url=>new Response(JSON.stringify(await boundedJSON(String(url),{method:'GET'},fetch,65536)),{headers:{'Content-Type':'application/json'}})});}
export async function verifyCommunity(request,{verify=jwtVerify,keySet,fetchImpl=fetch,now=Date.now}={}){
  const auth=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(auth))throw denied();const token=auth.slice(7);let p;
  try{const checked=await verify(token,keySet||remoteKeys(),{algorithms:['RS256'],audience:PROJECT,issuer:'https://securetoken.google.com/'+PROJECT,requiredClaims:['sub','iat','exp','auth_time'],currentDate:new Date(now())});if(checked.protectedHeader?.alg!=='RS256'||!checked.protectedHeader?.kid)throw denied();p=checked.payload;}catch(e){if(e.status===503)throw e;throw denied();}
  validateClaims(p,now());if(config.projectId!==PROJECT||typeof config.apiKey!=='string')throw Core.unavailable();
  const account=await boundedJSON('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},fetchImpl,65536);
  const result=validateAccount(p,account);
  if(Account.enabled(process.env))await Account.assertActive(result.uid,Account.dependencies());
  return result;
}
