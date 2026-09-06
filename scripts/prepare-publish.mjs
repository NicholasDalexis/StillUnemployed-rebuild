/* Copy an explicit public surface. Private docs, functions, test fixtures and
 * server credentials never belong in Netlify's static publish directory. */
import {readdirSync,lstatSync,cpSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function prepare(root){const dest=join(root,'dist');rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
  for(const name of readdirSync(root)){
    const publicFile=['index.html','jobs.html','tracker.html','suggest.html','privacy.html','terms.html','versions.html','analytics.html','404.html'].includes(name)||['jobs-data.json','releases.json','robots.txt','sitemap.xml','favicon.ico','_redirects','_headers','site.webmanifest'].includes(name);
    const publicDirectory=['js','css','assets','__','j','jobs'].includes(name);
    if(!publicFile&&!publicDirectory)continue;
    const source=join(root,name);if(lstatSync(source).isSymbolicLink())throw Error('Public symlink rejected');
    cpSync(source,join(dest,name),{recursive:true,filter:p=>{const stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('Public symlink rejected');return !p.includes('/assets/og-src/')&&!/\/style-guide(?:[./-]|$)/.test(p);}});
  }
  return dest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))prepare(resolve(fileURLToPath(new URL('..',import.meta.url))));
