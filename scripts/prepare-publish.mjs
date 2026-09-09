/* Copy an explicit public surface. Private docs, functions, test fixtures and
 * server credentials never belong in Netlify's static publish directory. */
import {readdirSync,lstatSync,cpSync,mkdirSync,rmSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicReleaseData,renderHistory} from './version.mjs';
const PRIVATE_PARTS=new Set(['docs','private','internal','archive','archives','reviews','guide-before','tests','fixtures','_to_delete']);
function privatePath(path){const parts=path.split('/');return parts.some(part=>PRIVATE_PARTS.has(part.toLowerCase()))||parts.at(-1)==='releases.json'||/(?:^|\/)(?:releases?|style-guide)[.-].*(?:private|internal|archive|full)/i.test(path)||path==='js/advice-guide.js';}
export function prepare(root){
  const releasePath=join(root,'releases.json');
  // Parse/project before altering the output. Never copy the full build ledger,
  // and re-render history so a stale generated page cannot disclose old notes.
  if(existsSync(releasePath)&&lstatSync(releasePath).isSymbolicLink())throw Error('Public symlink rejected');
  const sourceRelease=existsSync(releasePath)?JSON.parse(readFileSync(releasePath,'utf8')):null;
  const release=sourceRelease?publicReleaseData(sourceRelease):null;
  const history=sourceRelease?renderHistory(sourceRelease):null;
  const dest=join(root,'dist');rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
  for(const name of readdirSync(root)){
    // The internship snapshot is bundled into its function, never exposed as a
    // static route that could bypass current Sheet removals.
    const publicFile=['index.html','jobs.html','internships.html','about.html','tracker.html','suggest.html','privacy.html','terms.html','versions.html','analytics.html','style-guide.html','404.html'].includes(name)||['robots.txt','sitemap.xml','favicon.ico','_redirects','_headers','site.webmanifest'].includes(name);
    const publicDirectory=['js','css','assets','__','j','jobs'].includes(name);
    if(!publicFile&&!publicDirectory)continue;
    if(name==='versions.html'&&sourceRelease)continue;
    const source=join(root,name);if(lstatSync(source).isSymbolicLink())throw Error('Public symlink rejected');
    cpSync(source,join(dest,name),{recursive:true,filter:p=>{const stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('Public symlink rejected');return !p.includes('/assets/og-src/')&&!privatePath(relative(root,p));}});
  }
  if(release){writeFileSync(join(dest,'releases.json'),JSON.stringify(release,null,2)+'\n');writeFileSync(join(dest,'versions.html'),history);}
  return dest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))prepare(resolve(fileURLToPath(new URL('..',import.meta.url))));
