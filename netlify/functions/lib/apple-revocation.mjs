import {createRemoteJWKSet,jwtVerify,SignJWT,importPKCS8} from 'jose';
import {randomBytes,createCipheriv,createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';
import Core from './job-moderation-core.cjs';
const keys=createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'),{timeoutDuration:5000});
const unavailable=()=>Core.fail(503,'Apple authorization could not be revoked. Please retry deletion.');
export function seal(value,env){
  const key=Buffer.from(env.SU_ACCOUNT_ERASURE_KEY||'','base64');if(key.length!==32)throw unavailable();
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');
}
export function unseal(value,env){
  try{const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64')),key=Buffer.from(env.SU_ACCOUNT_ERASURE_KEY||'','base64'),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));}catch{throw unavailable();}
}
async function clientSecret(clientId,env,now){
  if(!env.SU_APPLE_TEAM_ID||!env.SU_APPLE_KEY_ID||!env.SU_APPLE_PRIVATE_KEY)throw unavailable();
  try{return await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:env.SU_APPLE_KEY_ID}).setIssuer(env.SU_APPLE_TEAM_ID).setAudience('https://appleid.apple.com').setSubject(clientId).setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+300).sign(await importPKCS8(env.SU_APPLE_PRIVATE_KEY.replace(/\\n/g,'\n'),'ES256'));}catch{throw unavailable();}
}
async function post(path,values,fetchImpl){
  let response;try{response=await fetchImpl('https://appleid.apple.com/auth/'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(5000)});}catch{throw unavailable();}
  if(!response.ok)throw unavailable();return response;
}
export function createAppleRevoker({verify=jwtVerify,keySet=keys,fetchImpl=fetch,now=Date.now}={}){
  return {
    async prepare(apple,account,env){
      if(!apple||typeof apple.idToken!=='string'||apple.idToken.length>8192)throw Core.fail(400,'Sign in with Apple again to delete this account.');
      const native=typeof apple.authorizationCode==='string',clientId=native?env.SU_APPLE_IOS_CLIENT_ID:env.SU_APPLE_WEB_CLIENT_ID;
      if(!clientId)throw unavailable();
      const provider=account.providerData.find(p=>p.providerId==='apple.com');
      let claims;try{claims=(await verify(apple.idToken,keySet,{algorithms:['RS256'],issuer:'https://appleid.apple.com',audience:clientId,currentDate:new Date(now()),requiredClaims:['sub','exp','iat']})).payload;}catch{throw Core.fail(401,'Sign in with Apple again to delete this account.');}
      if(!provider||claims.sub!==provider.uid||now()/1000-claims.iat>300||claims.iat>now()/1000+30)throw Core.fail(401,'The Apple account does not match this account.');
      const secret=await clientSecret(clientId,env,now());
      let token,type;
      if(native){
        if(!apple.authorizationCode||apple.authorizationCode.length>2048)throw Core.fail(400,'Sign in with Apple again.');
        const response=await post('token',{client_id:clientId,client_secret:secret,code:apple.authorizationCode,grant_type:'authorization_code'},fetchImpl);
        let payload;try{payload=JSON.parse(await Core.within(()=>Core.readLimited(response.body,16384)));}catch{throw unavailable();}
        try{const exchanged=(await verify(payload.id_token,keySet,{algorithms:['RS256'],issuer:'https://appleid.apple.com',audience:clientId,currentDate:new Date(now())})).payload;if(exchanged.sub!==provider.uid)throw unavailable();}catch{throw unavailable();}
        token=payload.refresh_token;type='refresh_token';
      }else{
        token=apple.accessToken;type='access_token';
        if(typeof token!=='string'||!token||token.length>8192)throw Core.fail(400,'Sign in with Apple again.');
        // Apple's signed ID token binds the access token returned by that
        // authorization. Never revoke an unrelated token supplied by a client.
        const expected=createHash('sha256').update(token).digest().subarray(0,16).toString('base64url');
        if(typeof claims.at_hash!=='string'||claims.at_hash.length!==expected.length||!timingSafeEqual(Buffer.from(claims.at_hash),Buffer.from(expected)))throw Core.fail(401,'Apple authorization does not match this account.');
      }
      if(typeof token!=='string'||!token||token.length>8192)throw unavailable();
      // Persist only encrypted revocation material so a one-use code is not
      // exchanged a second time after an interrupted deletion.
      return seal({clientId,token,type},env);
    },
    async revoke(sealed,env){const value=unseal(sealed,env),secret=await clientSecret(value.clientId,env,now());await post('revoke',{client_id:value.clientId,client_secret:secret,token:value.token,token_type_hint:value.type},fetchImpl);}
  };
}
