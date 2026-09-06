const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
test('static deploy allowlist excludes server, private docs and fixtures while including the approved public guide',async()=>{const {prepare}=await import('../prepare-publish.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-publish-test-'));try{for(const file of ['index.html','analytics.html','style-guide.html','docs/private.md','netlify/functions/private.cjs','scripts/tests/secret.json','js/app.js','css/brand.css','css/style-guide.css','node_modules/secret.js']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),'fixture');}prepare(dir);for(const file of ['index.html','analytics.html','style-guide.html','js/app.js','css/brand.css','css/style-guide.css'])assert.ok(fs.existsSync(path.join(dir,'dist',file)));for(const file of ['docs','netlify','scripts','node_modules'])assert.equal(fs.existsSync(path.join(dir,'dist',file)),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('releaseprivacycheck rejects changedpolicyorproductsource after a reviewedreceipt',async()=>{
 const {check}=await import('../privacy-review.mjs'),{publicSourceFingerprint}=await import('../version.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-privacy-gate-'));try{
  fs.mkdirSync(path.join(dir,'docs'));fs.mkdirSync(path.join(dir,'js'));fs.writeFileSync(path.join(dir,'privacy.html'),'Reviewed privacy');fs.writeFileSync(path.join(dir,'terms.html'),'Reviewed terms');fs.writeFileSync(path.join(dir,'js','app.js'),'reviewed source');
  const receipt={status:'local-reviewed',reviewedAt:'2026-09-06T04:00:00Z',sourceDigest:publicSourceFingerprint(dir).digest};fs.writeFileSync(path.join(dir,'docs','privacy-review.json'),JSON.stringify(receipt));assert.equal(check(dir),true);
  fs.writeFileSync(path.join(dir,'privacy.html'),'Changed collection policy');assert.throws(()=>check(dir),/does not match/);
  fs.writeFileSync(path.join(dir,'privacy.html'),'Reviewed privacy');assert.equal(check(dir),true);fs.writeFileSync(path.join(dir,'js','app.js'),'new telemetry');assert.throws(()=>check(dir),/does not match/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
