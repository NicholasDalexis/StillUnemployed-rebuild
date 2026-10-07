import Identity from '../../../js/job-identity.js';
import Links from '../../../js/daily-links.js';

export function validate(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.selections)) throw Error('Invalid daily manifest');
  const dates = new Set();
  for (const s of manifest.selections) {
    if (!Links.validDate(s.date) || s.kind !== 'jobs' || !['published','scheduled','draft'].includes(s.state) || dates.has(s.date) || !Array.isArray(s.jobs) || s.jobs.length !== 4) throw Error('Invalid daily collection');
    dates.add(s.date);
    if (s.state === 'scheduled') {
      const at = new Date(s.publishAt);
      if (!Number.isFinite(at.getTime())) throw Error('Invalid daily publication time');
      const eastern = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      const parts = Object.fromEntries(eastern.formatToParts(at).map(p=>[p.type,p.value]));
      if (`${parts.year}-${parts.month}-${parts.day}` !== s.date || parts.hour !== '09' || parts.minute !== '00' || at.getUTCSeconds() !== 0 || at.getUTCMilliseconds() !== 0) throw Error('Daily publication must be 9 AM Eastern on its date');
    }
    const ids = new Set();
    for (const j of s.jobs) {
      if (!/^[a-z0-9]{8,64}$/.test(j.id) || ids.has(j.id) || !/^https:\/\//.test(j.link) || !Identity.keys(j.link).length || j.snapshot?.link !== j.link || !j.snapshot.co || !j.snapshot.role) throw Error('Invalid daily job');
      ids.add(j.id);
    }
  }
  return manifest;
}
export function publicCollections(manifest, now = new Date()) {
  validate(manifest);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return manifest.selections.filter(s=>s.date<=today && (s.state==='published' || s.state==='scheduled' && Date.parse(s.publishAt)<=now.getTime()))
    .map(s=>({date:s.date,kind:'jobs',state:'published',jobs:s.jobs.map(j=>({id:j.id,link:j.link,snapshot:j.snapshot}))}))
    .sort((a,b)=>b.date.localeCompare(a.date));
}
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function createHandler(manifest, clock=()=>new Date()) {
  return async request=>{
    if(request.method!=='GET') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...headers,Allow:'GET'}});
    try {
      const now=clock(),selections=publicCollections(manifest,now);
      const nextAt=manifest.selections.filter(s=>s.state==='scheduled'&&Date.parse(s.publishAt)>now.getTime()).map(s=>s.publishAt).sort()[0]||null;
      return new Response(JSON.stringify({schemaVersion:1,selections,serverTime:now.toISOString(),nextAt}),{headers});
    } catch { return new Response(JSON.stringify({error:'Daily collections temporarily unavailable'}),{status:503,headers}); }
  };
}
