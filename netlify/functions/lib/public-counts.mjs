import Identity from '../../../js/job-identity.js';
import Internships from '../../../js/internships.js';
import Source from './job-source.cjs';
import Discovery from './job-discovery.cjs';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const unavailable=()=>({status:'unavailable',count:null});
function indexKeys(index,checked){
  const age=checked-Date.parse(index?.checkedAt);
  if(index?.schemaVersion!==1||!Number.isSafeInteger(index.revision)||index.revision<0||!Number.isFinite(age)||age< -1000||age>5000||!Array.isArray(index.removed)||index.removed.length>10000)throw Error('Unavailable');
  const keys=new Set();
  for(const row of index.removed){
    if(!Array.isArray(row?.keys)||!row.keys.length||row.keys.length>64||row.keys.some(key=>typeof key!=='string'||key.length>8200||!/^(url:|ats:)/.test(key)))throw Error('Unavailable');
    row.keys.forEach(key=>keys.add(key));
  }
  return {keys};
}
// Count what the board publishes, including its chosen representative for
// duplicate Active rows whose text differs. The separate API remains stricter.
export function catalogFromCSV(csv,limits=Discovery.LIMITS){
  if(typeof csv!=='string'||Buffer.byteLength(csv)>limits.bytes)throw Error('Unavailable');
  const rows=Source.parseCSV(csv),head=rows[0];
  if(!head||rows.length>limits.rows+1||head.length!==Discovery.EXPECTED.length||head.some((v,i)=>v.trim().toLowerCase()!==Discovery.EXPECTED[i]))throw Error('Unavailable');
  if(rows.slice(1).some(row=>row.some(value=>value.length>limits.field)||row.some(value=>value.trim())&&row.length!==head.length))throw Error('Unavailable');
  return Source.rowsToJobs([head,...rows.slice(1).filter(row=>row[10]?.trim().toLowerCase()==='active')]);
}
function count(rows,index){
  if(!Array.isArray(rows)||rows.length>10000)throw Error('Unavailable');
  if(rows.some(row=>!row||!Identity.inspect(row.link).valid||Identity.inspect(row.link).ambiguous))throw Error('Unavailable');
  const groups=Identity.groupJobs(rows);
  return groups.filter(group=>{
    const keys=group.aliases.flatMap(link=>Identity.keys(link));
    if(!keys.length)throw Error('Unavailable');
    return !keys.some(key=>index.keys.has(key));
  }).map(group=>group.job);
}
export function createHandler({getJobs,getInternships,getIndex,now=Date.now,timeoutMs=7000}={}){
  return async(request,context)=>{
    const reply=(status,data,extra={})=>new Response(request.method==='HEAD'?null:JSON.stringify(data),{status,headers:{...headers,...extra}});
    if(!['GET','HEAD'].includes(request.method))return reply(405,{error:'Use GET or HEAD'},{Allow:'GET, HEAD'});
    if(new URL(request.url).search)return reply(400,{error:'Counts do not accept filters'});
    let timer;
    const body={schemaVersion:1,checkedAt:null,jobs:unavailable(),internships:unavailable()};
    try{
      const result=await Promise.race([
        Promise.allSettled([Promise.resolve().then(()=>getJobs()),Promise.resolve().then(()=>getInternships()),Promise.resolve().then(()=>getIndex(context,request))]),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Unavailable')),timeoutMs);})
      ]);
      const checked=now(),index=indexKeys(result[2].status==='fulfilled'?result[2].value:null,checked);
      body.checkedAt=new Date(checked).toISOString();
      if(result[0].status==='fulfilled'){
        try{
          const source=result[0].value,age=checked-source.checkedAt;
          if(!Number.isFinite(age)||age< -1000||age>15000)throw Error('Unavailable');
          body.jobs={status:'ready',count:count(source.jobs,index).length};
        }catch{}
      }
      if(result[1].status==='fulfilled'){
        try{
          const source=result[1].value;
          if(source.statusCode!==200)throw Error('Unavailable');
          const data=JSON.parse(source.body);
          if(data.status!=='verified')throw Error('Unavailable');
          const rows=Internships.jobs(data,checked);
          if(rows.length!==data.jobs.length)throw Error('Unavailable');
          const published=count(rows,index);
          body.internships={status:'ready',count:published.length,upcoming:Internships.counts(published,checked).upcoming};
        }catch{}
      }
    }catch{}finally{clearTimeout(timer);}
    const ready=body.jobs.status==='ready'&&body.internships.status==='ready';
    return reply(ready?200:503,body,ready?{}:{'Retry-After':'30'});
  };
}
