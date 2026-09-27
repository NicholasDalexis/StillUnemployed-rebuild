'use strict';
const crypto=require('node:crypto');
const COOKIE='__Host-su_measurement',DAY=86400000;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function mac(d,value){return crypto.createHmac('sha256',d.env.SU_ANALYTICS_SECRET).update('anonymous-v1:'+value).digest('base64url');}
function read(request,d){
  const match=String(request.headers.cookie||'').match(/(?:^|;\s*)__Host-su_measurement=([^;]+)/);
  if(!match)return null;
  const parts=match[1].split('.');
  if(parts.length!==3||!/^[a-f0-9]{32}$/.test(parts[0])||!/^\d{13}$/.test(parts[1])||!/^[A-Za-z0-9_-]{43}$/.test(parts[2]))return null;
  const exp=Number(parts[1]);if(exp<=d.now()||exp>d.now()+90*DAY)return null;
  const expected=mac(d,parts[0]+'.'+parts[1]);
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(parts[2]))?parts[0]:null;
}
function requireIdentity(request,d){const id=read(request,d);if(!id)throw fail(401,'Anonymous measurement identity required');return id;}
async function issue(request,d){
  if(read(request,d))return {ready:true};
  const ip=request.headers['x-nf-client-connection-ip'];
  if(!ip)throw fail(503,'Measurement identity unavailable');
  const key=crypto.createHmac('sha256',d.env.SU_ANALYTICS_SECRET).update('identity-rate:'+ip).digest('hex');
  const ref=d.db.doc('suAnalyticsRates/'+key),window=Math.floor(d.now()/DAY);
  await d.db.runTransaction(async tx=>{const old=await tx.get(ref),used=old.exists&&old.data().window===window?old.data().count:0;if(used>=300)throw fail(429,'Please retry later');tx.set(ref,{window,count:used+1,expiresAt:new Date(d.now()+DAY)});});
  const id=crypto.randomBytes(16).toString('hex'),payload=id+'.'+(d.now()+90*DAY);
  return {ready:true,cookie:COOKIE+'='+payload+'.'+mac(d,payload)+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000'};
}
module.exports={read,requireIdentity,issue,COOKIE};
