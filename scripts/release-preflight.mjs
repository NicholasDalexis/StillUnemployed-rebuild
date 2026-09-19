/* Validate the final artifact, after environment-specific generation. Never log
 * credential values. A passing build is separate from hosted functional QA. */
import {readFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyArtifact(dist,env=process.env){
  const failures=[],production=env.CONTEXT==='production';let checked=0;
  const secrets=['SU_FIREBASE_SERVICE_ACCOUNT','SU_ANALYTICS_SECRET'].map(k=>env[k]).filter(v=>v&&v.length>16);
  function walk(dir){for(const name of readdirSync(dir)){const p=join(dir,name),s=lstatSync(p);if(s.isSymbolicLink()){failures.push('Symlink in public artifact');continue;}if(s.isDirectory()){walk(p);continue;}
    if(!/\.(html|js|json|css|txt|xml|map)$/i.test(name))continue;
    checked++;const text=readFileSync(p,'utf8'),relative=p.slice(dist.length+1);
    if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|"private_key"\s*:\s*"|"type"\s*:\s*"service_account"/.test(text)||secrets.some(v=>text.includes(v)||text.includes(JSON.stringify(v).slice(1,-1))))failures.push('Private credential found in '+relative);
    if(production&&name.endsWith('.html')){
      // Inspect navigable/resource attributes, not intentional preview host allowlists in JS.
      if(/(?:href|src|content|action)\s*=\s*["']https:\/\/[a-z0-9-]+--stillunemployed\.netlify\.app/i.test(text))failures.push('Preview destination in '+relative);
    }
  }}walk(dist);
  for(const name of ['index.html','jobs.html','internships.html','tracker.html']){
    const path=join(dist,name);if(!existsSync(path)){failures.push('Missing '+name);continue;}
    const text=readFileSync(path,'utf8');
    const renderer=name==='tracker.html'?'js/tracker.js':'js/app.js';
    const hasSlot=/su-account-slot/.test(text)||(existsSync(join(dist,renderer))&&text.includes(renderer)&&/su-account-slot/.test(readFileSync(join(dist,renderer),'utf8')));
    if(!hasSlot||!/js\/auth\.js/.test(text))failures.push('Missing sign-in integration: '+name);
  }
  if(!existsSync(join(dist,'404.html')))failures.push('Missing branded 404');
  for(const name of ['tracker.html','analytics.html','404.html'])if(existsSync(join(dist,name))&&!/name="robots" content="noindex/.test(readFileSync(join(dist,name),'utf8')))failures.push('Private/recovery route is indexable: '+name);
  if(!production&&!/X-Robots-Tag: noindex/.test(readFileSync(join(dist,'_headers'),'utf8')))failures.push('Preview must be noindex');
  if(production){
    for(const key of ['SU_ANALYTICS_ENABLED','SU_FIREBASE_SERVICE_ACCOUNT','SU_ANALYTICS_SECRET','SU_ANALYTICS_ADMIN_UIDS','SU_ALLOWED_ORIGINS'])if(!env[key])failures.push('Missing production setting: '+key);
    if(env.SU_ANALYTICS_ENABLED!=='true')failures.push('Production analytics activation not configured');
    const origins=(env.SU_ALLOWED_ORIGINS||'').split(',');
    for(const host of ['https://stillunemployed.com','https://www.stillunemployed.com'])if(!origins.includes(host))failures.push('Missing production analytics origin: '+host);
  }
  if(failures.length)throw Error(failures.join('\n'));
  return {passed:true,checked,context:production?'production':'preview',hostedLogin:'requires actual-domain QA'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log('Release preflight:',verifyArtifact(resolve(process.argv[2]||'dist')));}catch(e){console.error(e.message);process.exitCode=1;}}
