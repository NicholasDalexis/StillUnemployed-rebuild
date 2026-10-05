import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Links=require('../js/daily-links.js'),Identity=require('../js/job-identity.js');
export function published(manifest,today){
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.selections))throw Error('Invalid daily manifest');
  const seen=new Set();
  return manifest.selections.filter(s=>s.state==='published'&&s.date<=today).map(s=>{
    if(!Links.validDate(s.date)||s.kind!=='jobs'||!Array.isArray(s.jobs)||s.jobs.length!==4||seen.has(s.date))throw Error('Invalid published collection');seen.add(s.date);
    const ids=new Set();for(const j of s.jobs){if(!/^[a-z0-9]{8,64}$/.test(j.id)||ids.has(j.id)||!/^https:\/\//.test(j.link)||!Identity.keys(j.link).length||j.snapshot?.link!==j.link||!j.snapshot.co||!j.snapshot.role)throw Error('Invalid published job');ids.add(j.id);}
    return s;
  }).sort((a,b)=>b.date.localeCompare(a.date));
}
if(process.argv[1]?.endsWith('/gen-daily.mjs')){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const selections=published(JSON.parse(readFileSync(new URL('../data/daily-selections.json',import.meta.url))),today);
  writeFileSync(new URL('../js/daily-selection-data.js',import.meta.url),'/* Published selections only. Snapshots are historical fallbacks, never current availability. */\nwindow.SUDailySelections='+JSON.stringify(selections).replace(/</g,'\\u003c')+';\n');
  console.log('Published daily collections:',selections.length);
}
