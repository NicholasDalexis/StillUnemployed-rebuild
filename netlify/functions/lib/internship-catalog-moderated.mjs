import Status from './internship-status.cjs';
import Identity from '../../../js/job-identity.js';
import {moderationIndex} from './job-moderation.mjs';
import snapshot from '../../../internships-data.json' with {type:'json'};
import displayCopy from './internship-display.json' with {type:'json'};
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function createHandler({catalog=Status.createHandler({snapshot,displayCopy}),index=moderationIndex}={}){
  return async function(request,context){
    if(request.method!=='GET')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...headers,Allow:'GET'}});
    try{
      const [source,moderation]=await Promise.all([catalog({httpMethod:'GET'}),index(context,request)]);
      if(source.statusCode!==200||moderation?.schemaVersion!==1||!Array.isArray(moderation.removed))throw Error('unavailable');
      const body=JSON.parse(source.body),blocked=new Set();
      for(const record of moderation.removed){
        if(!Array.isArray(record.keys)||record.keys.some(key=>typeof key!=='string'))throw Error('unavailable');
        record.keys.forEach(key=>blocked.add(key));
      }
      if(!Array.isArray(body.jobs))throw Error('unavailable');
      body.jobs=body.jobs.filter(job=>!Identity.keys(job.link).some(key=>blocked.has(key)));
      body.moderationRevision=moderation.revision;
      return new Response(JSON.stringify(body),{status:200,headers});
    }catch{return new Response(JSON.stringify({error:'Internships temporarily unavailable'}),{status:503,headers});}
  };
}
export const handle=createHandler();
