'use strict';
const Service=require('./lib/analytics-service.cjs');
const Core=require('./lib/analytics-core.cjs');
const Identity=require('./lib/analytics-identity.cjs');
exports.handler=async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin, Cookie'};
  try{
    if(request.httpMethod!=='POST')return {statusCode:405,headers,body:JSON.stringify({error:'Method not allowed'})};
    const d=Service.dependencies();Core.authorizeOrigin(request,d.env);
    if(d.env.CONTEXT!=='production'||!/^https:\/\/(www\.)?stillunemployed\.com$/.test(request.headers.origin||''))return {statusCode:200,headers,body:JSON.stringify({excluded:true})};
    if(Buffer.byteLength(request.body||'')>256)throw Object.assign(new Error('Request too large'),{status:413});
    let input;try{input=JSON.parse(request.body||'{}');}catch(_){throw Object.assign(new Error('Invalid request'),{status:400});}
    if(input.analytics!==true)throw Object.assign(new Error('Analytics consent required'),{status:403});
    const result=await Identity.issue(request,d);if(result.cookie)headers['Set-Cookie']=result.cookie;
    return {statusCode:200,headers,body:JSON.stringify({ready:result.ready})};
  }catch(e){return {statusCode:e.status||503,headers,body:JSON.stringify({error:e.status?e.message:'Measurement identity unavailable'})};}
};
