// Bounded, read-only verification of the exact deployed origin. No credentials.
import {writeFileSync} from 'node:fs';
const base=process.argv[2],out=process.argv[3];
if(!base||!/^https:\/\/(?:stillunemployed\.com|www\.stillunemployed\.com|preview--stillunemployed\.netlify\.app)$/.test(base))throw Error('Use an approved preview or production origin');
const production=!base.includes('preview--'),checks=[];
async function get(route){const r=await fetch(base+route,{signal:AbortSignal.timeout(20000)});return {status:r.status,url:r.url,headers:Object.fromEntries(r.headers),text:await r.text()};}
for(const route of ['/','/jobs','/internships','/tracker','/analytics','/about','/privacy','/terms','/job-search-guide','/pay-guide']){
 try{const r=await get(route);checks.push({route,status:r.status,pass:r.status===200,canonical:(r.text.match(/rel="canonical" href="([^"]+)"/)||[])[1],previewLeak:production&&/(?:content|href|src)=["']https:\/\/[^/"']+--stillunemployed\.netlify\.app/i.test(r.text),noindex:/name="robots" content="noindex/.test(r.text),signIn:!['/','/jobs','/internships','/tracker'].includes(route)||/js\/auth\.js/.test(r.text),csp:!!r.headers['content-security-policy']});}catch{checks.push({route,pass:false,error:'request failed'});}
}
for(const route of ['/__/auth/iframe','/__/firebase/init.json','/sitemap.xml','/robots.txt','/assets/og/home.png','/release-qa-missing-page-20260919']){try{const r=await get(route);checks.push({route,status:r.status,pass:route.includes('missing-page')?r.status===404&&r.text.includes('This page went missing'):r.status===200});}catch{checks.push({route,pass:false});}}
const r=await fetch(base+'/.netlify/functions/analytics-admin',{headers:{Origin:base},signal:AbortSignal.timeout(20000)});checks.push({route:'analytics-admin anonymous',status:r.status,pass:r.status===401});
const report={checkedAt:new Date().toISOString(),base,checks,passed:checks.every(x=>x.pass&&!x.previewLeak&&x.signIn!==false&&(!production||x.route!=='/'||!x.noindex)),manualRequired:['Fresh Google login on this origin, reload and signout','Owner dashboard authorized read','Physical iPhone typing']};
if(out)writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
