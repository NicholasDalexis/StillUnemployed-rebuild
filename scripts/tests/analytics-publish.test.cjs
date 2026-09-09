const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
test('static deploy allowlist excludes server, private docs and fixtures while including the approved public guide',async()=>{const {prepare}=await import('../prepare-publish.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-publish-test-'));try{for(const file of ['index.html','analytics.html','style-guide.html','docs/private.md','netlify/functions/private.cjs','scripts/tests/secret.json','js/app.js','css/brand.css','css/style-guide.css','node_modules/secret.js']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),'fixture');}prepare(dir);for(const file of ['index.html','analytics.html','style-guide.html','js/app.js','css/brand.css','css/style-guide.css'])assert.ok(fs.existsSync(path.join(dir,'dist',file)));for(const file of ['docs','netlify','scripts','node_modules'])assert.equal(fs.existsSync(path.join(dir,'dist',file)),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

// Synthetic content only: real unpublished copy and private workspace paths
// must never be embedded in a repository test or its failure output.
test('hosted static output cannot bypass internship status suppression',async()=>{
 const {prepare}=await import('../prepare-publish.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-internship-publish-'));
 try{
  fs.writeFileSync(path.join(dir,'internships.html'),'<p>Internship board</p>');
  fs.writeFileSync(path.join(dir,'internships-data.json'),'SYNTHETIC_REVIEWED_SNAPSHOT');
  const dest=prepare(dir);
  assert.equal(fs.existsSync(path.join(dest,'internships.html')),true);
  assert.equal(fs.existsSync(path.join(dest,'internships-data.json')),false);
  assert.equal(fs.readFileSync(path.join(dir,'internships-data.json'),'utf8'),'SYNTHETIC_REVIEWED_SNAPSHOT','function bundling and localhost retain the source snapshot');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

function privateBoundaryFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-publish-boundary-'));
 const site=path.join(dir,'site'),privateDir=path.join(dir,'drafts');
 fs.mkdirSync(path.join(site,'assets'),{recursive:true});fs.mkdirSync(privateDir);
 fs.writeFileSync(path.join(site,'index.html'),'<p>Public fixture</p>');
 fs.writeFileSync(path.join(site,'assets','public.svg'),'<svg></svg>');
 fs.writeFileSync(path.join(privateDir,'index.html'),'SYNTHETIC_PRIVATE_PREVIEW_SENTINEL');
 return{site,privateDir,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('a sibling private preview is absent from the published artifact while public files remain available',async()=>{
 const {prepare}=await import('../prepare-publish.mjs');const fixture=privateBoundaryFixture();
 try{
  const dest=prepare(fixture.site);
  const files=[];function walk(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())walk(path.join(dir,entry.name),name+'/');else files.push(name);}}walk(dest);
  assert.deepEqual(files.sort(),['assets/public.svg','index.html']);
  assert.match(fs.readFileSync(path.join(dest,'index.html'),'utf8'),/Public fixture/);
  for(const name of files)assert.doesNotMatch(fs.readFileSync(path.join(dest,name),'utf8'),/SYNTHETIC_PRIVATE_PREVIEW_SENTINEL/);
  assert.equal(fs.readFileSync(path.join(fixture.privateDir,'index.html'),'utf8'),'SYNTHETIC_PRIVATE_PREVIEW_SENTINEL','publishing leaves the private source intact');
 }finally{fixture.clean();}
});

test('private sibling edits do not change the public release fingerprint, while a public edit does',async()=>{
 const {publicSourceFingerprint}=await import('../version.mjs');const fixture=privateBoundaryFixture();
 try{
  const before=publicSourceFingerprint(fixture.site);
  fs.writeFileSync(path.join(fixture.privateDir,'index.html'),'Changed synthetic draft');
  fs.writeFileSync(path.join(fixture.privateDir,'second.html'),'Another synthetic draft');
  assert.deepEqual(publicSourceFingerprint(fixture.site),before);
  fs.writeFileSync(path.join(fixture.site,'index.html'),'<p>Changed public fixture</p>');
  assert.notEqual(publicSourceFingerprint(fixture.site).digest,before.digest,'the fingerprint still detects public changes');
 }finally{fixture.clean();}
});

test('publishing rejects file and directory symlinks from public assets into a private sibling',async()=>{
 const {prepare}=await import('../prepare-publish.mjs');const fixture=privateBoundaryFixture();
 try{
  for(const [name,target] of [['linked-file.html',path.join(fixture.privateDir,'index.html')],['linked-directory',fixture.privateDir]]){
   const bridge=path.join(fixture.site,'assets',name);fs.symlinkSync(target,bridge);
   assert.throws(()=>prepare(fixture.site),/Public symlink rejected/,name+' must stop the publish step');
   assert.equal(fs.existsSync(path.join(fixture.site,'dist','assets',name)),false,'the private target is never copied');
   fs.unlinkSync(bridge);
  }
 }finally{fixture.clean();}
});

test('releaseprivacycheck rejects changedpolicyorproductsource after a reviewedreceipt',async()=>{
 const {check}=await import('../privacy-review.mjs'),{publicSourceFingerprint}=await import('../version.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-privacy-gate-'));try{
  fs.mkdirSync(path.join(dir,'docs'));fs.mkdirSync(path.join(dir,'js'));fs.writeFileSync(path.join(dir,'privacy.html'),'Reviewed privacy');fs.writeFileSync(path.join(dir,'terms.html'),'Reviewed terms');fs.writeFileSync(path.join(dir,'js','app.js'),'reviewed source');
  const receipt={status:'local-reviewed',reviewedAt:'2026-09-06T04:00:00Z',sourceDigest:publicSourceFingerprint(dir).digest};fs.writeFileSync(path.join(dir,'docs','privacy-review.json'),JSON.stringify(receipt));assert.equal(check(dir),true);
  fs.writeFileSync(path.join(dir,'privacy.html'),'Changed collection policy');assert.throws(()=>check(dir),/does not match/);
  fs.writeFileSync(path.join(dir,'privacy.html'),'Reviewed privacy');assert.equal(check(dir),true);fs.writeFileSync(path.join(dir,'js','app.js'),'new telemetry');assert.throws(()=>check(dir),/does not match/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('public JSON keeps two approved viewer updates while HTML regenerates the feature overview from stale output',async()=>{
 const {prepare}=await import('../prepare-publish.mjs');const f=privateBoundaryFixture();
 try {
  const full={schemaVersion:1,currentVersion:'2.3.4',releases:['2.3.4','2.3.3','2.3.2','2.3.1'].map((version,i)=>({version,date:'2026-09-07',title:'PRIVATE TITLE '+version,changes:['PRIVATE NOTE '+version],...(i!==1?{public:{title:'Public '+version,changes:['Visible '+version]}}:{})}))};
  const original=JSON.stringify(full);fs.writeFileSync(path.join(f.site,'releases.json'),original);
  fs.writeFileSync(path.join(f.site,'versions.html'),'<p>PRIVATE STALE HISTORY</p>');
  for(const name of ['Reviews/history.html','js/internal/guide.html','assets/archive/history.json','assets/releases-full.json','css/private/guide.css','js/advice-guide.js']){const dest=path.join(f.site,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'PRIVATE ARCHIVE SENTINEL');}
  const dest=prepare(f.site),data=JSON.parse(fs.readFileSync(path.join(dest,'releases.json'),'utf8')),history=fs.readFileSync(path.join(dest,'versions.html'),'utf8');
  assert.deepEqual(data.releases.map(r=>r.version),['2.3.4','2.3.2']);
  assert.equal((history.match(/<article /g)||[]).length,8);assert.match(history,/<h1>Version 2<\/h1>/);assert.match(history,/Current board version 2\.3\.4/);assert.doesNotMatch(history,/Public 2\.3|Visible 2\.3|2\.3\.1|PRIVATE/);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE|public/);
  assert.equal(fs.readFileSync(path.join(f.site,'releases.json'),'utf8'),original,'build source keeps every original note');
  for(const name of ['Reviews','js/internal','assets/archive','assets/releases-full.json','css/private','js/advice-guide.js'])assert.equal(fs.existsSync(path.join(dest,name)),false,name);
  full.releases[0].public={title:'Unfinished copy'};fs.writeFileSync(path.join(f.site,'releases.json'),JSON.stringify(full));
  assert.throws(()=>prepare(f.site),/Public notes/);
  assert.equal(fs.readFileSync(path.join(dest,'versions.html'),'utf8'),history,'invalid publication metadata does not replace the prior artifact');
 }finally{f.clean();}
});
