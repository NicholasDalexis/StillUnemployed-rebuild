const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const Source=require('../../netlify/functions/lib/job-source.cjs');
const NOW=Date.parse('2030-09-06T16:00:00Z');
const themes=['original','poker','girly','mermaid','bratt','noir','beauty','chess'];
const site={id:'13d48d6e-e0ac-4d52-8a65-4fcbb9fdbc16'};
const origin='https://preview--stillunemployed.netlify.app';
const generator=import('../gen-share.mjs'),loader=import('../lib/internship-share.mjs');
const edge=()=>import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../../netlify/edge-functions/job-share-moderation.js')).toString('base64'));
const link='https://job-boards.greenhouse.io/example/jobs/12345';
function row(extra={}){return {co:'Example Studio',role:'Design Intern',link,loc:'Chicago, IL',ind:'Video & Creative',pay:'$22.50/hour',payStatus:'paid',payBasis:'hour',collegeCredit:'not_listed',eligibility:'Current students.',eligibilityFlags:['Current students'],duties:['Prepare design work.'],benefits:[],applicationStatus:'open',timingSourceUrl:'https://example.org/internships',verification:{status:'open',checkedAt:'2030-09-06T15:00:00Z',sourceUrl:link,reviewerType:'source_check'},...extra};}
const snapshot=(jobs=[row()])=>({schemaVersion:2,status:'verified',jobs,privateSource:'DO_NOT_PUBLISH'});
const csv=rows=>[['Link','Active/Dead','Application Status'],...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
const sourceResponse=rows=>new Response(csv(rows),{headers:{'Content-Type':'text/csv'}});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const catalog=(jobs=[row()],extra={})=>({schemaVersion:2,status:'verified',jobs,moderationRevision:3,statusCheckedAt:new Date().toISOString(),...extra});
const sharePath=(theme='original',image=false)=>image?'/j/og/internships/'+theme+'/'+Source.slugOf(link)+'.png':'/j/internships/'+theme+'/'+Source.slugOf(link)+'.html';

test('approved internship shares preserve pay periods, explicit internship state and minimal public copy',async()=>{
 const {loadInternshipShares}=await loader;
 for(const [pay,payBasis,expected] of [['$22.50/hour','hour','$23/hour'],['$8,000 for the program','program','$8,000/program'],['$75,600/year','annualized_year','$76K/year'],['Paid; amount not disclosed','not_listed','$ Paid'],['Unpaid','not_listed','Unpaid']]){
  const job=row({pay,payBasis,payStatus:pay==='Unpaid'?'unpaid':'paid',secretNotes:'DO_NOT_PUBLISH'});
  const rows=await loadInternshipShares({snapshot:snapshot([job]),now:()=>NOW,fetchImpl:async()=>sourceResponse([[link,'Active','Open']])});
  assert.equal(rows.length,1);assert.equal(rows[0].pay,expected);assert.equal(rows[0].internship,true);assert.equal(rows[0].applicationStatus,'open');assert.equal(rows[0].loc,'Chicago, IL');
  assert.doesNotMatch(JSON.stringify(rows),/DO_NOT_PUBLISH|verification|eligibility|sourceUrl/);
 }
 const upcoming=row({applicationStatus:'upcoming',duties:[],verification:{...row().verification,status:'upcoming',sourceAnnounced:true,upcomingApproved:true}});
 const rows=await loadInternshipShares({snapshot:snapshot([upcoming]),now:()=>NOW,fetchImpl:async()=>sourceResponse([[link,'Active','Upcoming']])});assert.equal(rows[0].applicationStatus,'upcoming');
});

test('live source retirement, alias resolution and admission errors match the existing approved catalog',async()=>{
 const {loadInternshipShares}=await loader;
 const run=rows=>loadInternshipShares({snapshot:snapshot(),now:()=>NOW,fetchImpl:async()=>sourceResponse(rows)});
 for(const rows of [[],[[link,'Dead','Open']],[[link,'Active','Closed']],[[link,'Active','Unknown']],[[link,'Active','Upcoming']]])assert.deepEqual(await run(rows),[]);
 const alias=link.replace('job-boards.greenhouse.io','boards.greenhouse.io')+'?utm_source=test';
 assert.equal((await run([[alias,'Active','Open']]))[0].link,link,'current alias retains the approved share identity');
 await assert.rejects(run([[link,'Active','Open'],[alias,'Dead','Closed']]),/unavailable/);
 await assert.rejects(loadInternshipShares({snapshot:snapshot([row(),row()]),now:()=>NOW,fetchImpl:async()=>{throw Error('must not fetch');}}),/unavailable/);
});

test('an unavailable internship check fails before replacing a previous share artifact',async()=>{
 const {buildShares}=await generator,dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-intern-share-failure-'));
 try{
  const file=path.join(dir,'jobs.csv'),out=path.join(dir,'j');fs.writeFileSync(file,'Company,Job Title,Link,Salary,Active/Dead\n');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'previous.html'),'KEEP');
  await assert.rejects(buildShares({csvPath:file,snapshot:snapshot(),now:()=>NOW,out,fetchImpl:async()=>new Response('',{status:503})}),/unavailable/);
  assert.equal(fs.readFileSync(path.join(out,'previous.html'),'utf8'),'KEEP');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('all eight internship images use flagship paper, keep measured pay units and visibly identify the section',async()=>{
 const {createCardRenderer}=await generator,{createCanvas,loadImage}=await import('@napi-rs/canvas'),render=await createCardRenderer();
 const probe=createCanvas(1200,630).getContext('2d'),proto=Object.getPrototypeOf(probe),original=proto.fillText;let drawn=[];
 proto.fillText=function(text,x,y,...rest){drawn.push({text:String(text),width:this.measureText(String(text)).width,x,y});return original.call(this,text,x,y,...rest);};
 try{for(const theme of themes){
  const job={co:'Example',role:'Design Intern',pay:'$23/hour',loc:'Chicago, IL',internship:true,applicationStatus:'upcoming'};
  drawn=[];const png=render(job,theme);assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  assert(drawn.some(r=>r.text==='INTERNSHIP · UPCOMING'));assert(drawn.some(r=>r.text==='$23/hour'));assert(drawn.every(r=>r.width<=1004));
  probe.drawImage(await loadImage(png),0,0);const color=Array.from(probe.getImageData(1100,250,1,1).data);
  probe.drawImage(await loadImage(render({...job,internship:false,pay:'$150K'},theme)),0,0);assert.deepEqual(Array.from(probe.getImageData(1100,250,1,1).data),color,theme+' retains flagship paper');
 }}finally{proto.fillText=original;}
});

test('served generated internship HTML/PNG pairs retain section, theme, exact encoded identity and SEO policy',async()=>{
 const {writeShares}=await generator,{finalizeSEO}=await import('../gen-seo.mjs'),{shareGate}=await edge();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-intern-shares-')),out=path.join(dir,'j');
 const server=http.createServer(async(req,res)=>{
  try{
   const response=await shareGate(new Request(origin+req.url),{site,next:async()=>{
    const file=path.join(dir,new URL(req.url,origin).pathname);return new Response(fs.readFileSync(file),{headers:{'Content-Type':file.endsWith('.png')?'image/png':'text/html'}});
   }},async url=>{assert.equal(url,origin+'/.netlify/functions/internships-catalog');return json(catalog());});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end(String(e));}
 });
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const served='http://127.0.0.1:'+server.address().port;
  const intern={co:'Example <Studio>',role:'Design & editorial Intern',link,pay:'$23/hour',loc:'Chicago, IL',internship:true};
  const alias=link+'?utm_source=old';
  const result=await writeShares([{...intern,internship:false,_aliases:[link,alias]}],[intern],{out,site:served});assert.equal(result.pages,24);finalizeSEO(dir,{CONTEXT:'production'});
  for(const theme of themes){
   const response=await fetch(served+sharePath(theme));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const html=await response.text();
   assert.match(html,/Example &lt;Studio&gt;/);assert.match(html,/Design &amp; editorial Intern/);assert.match(html,/canonical" href="https:\/\/stillunemployed.com\/internships"/);assert.match(html,/robots" content="noindex, nofollow"/);assert.doesNotMatch(html,/JobPosting|DO_NOT_PUBLISH/);
   const target=new URL(JSON.parse(html.match(/location\.replace\(("[^"]+")\)/)[1]),served);assert.equal(target.pathname,'/internships.html');assert.equal(target.searchParams.get('theme'),theme);assert.equal(Buffer.from(target.searchParams.get('job'),'base64').toString(),link);
   const imageURL=html.match(/property="og:image" content="([^"]+)"/)[1];assert.equal(imageURL,served+sharePath(theme,true));const image=await fetch(imageURL);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await image.arrayBuffer()).readUInt32BE(16),1200);
   for(const entry of Source.shareEntries({_aliases:[link,alias]})){const legacy=fs.readFileSync(path.join(out,theme,entry.slug+'.html'),'utf8');assert.match(legacy,/\/jobs\.html\?job=/);assert.doesNotMatch(legacy,/\/internships\.html\?job=/);}
  }
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8'),/\/j\//);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});

test('internship HTML and images fail closed for unavailable, retired or owner-removed catalog rows, including HEAD',async()=>{
 const {shareGate,shareSlug}=await edge();let next=0;
 for(const value of [link,link+'?utm_source=alias','https://example.org/🧪?a=1&b=2'])assert.equal(shareSlug(value),Source.slugOf(value));
 const context={site,next:()=>{next++;return new Response('POSTING CONTENT');}};
 for(const theme of themes)for(const image of [false,true]){
  const request=new Request(origin+sharePath(theme,image));const fetchRemoved=async()=>json(catalog([]));
  const removed=await shareGate(request,context,fetchRemoved);assert.equal(removed.status,410);assert.doesNotMatch(await removed.text(),/POSTING CONTENT|closed by the employer/);
  const head=await shareGate(new Request(request.url,{method:'HEAD'}),context,fetchRemoved);assert.equal(head.status,410);assert.equal(await head.text(),'');
  for(const response of [()=>json({error:'Unavailable'},503),()=>json(catalog([row()],{statusCheckedAt:'2000-01-01T00:00:00Z'})),()=>json(catalog([row()],{moderationRevision:null})),()=>new Response('',{status:302,headers:{Location:'https://evil.example'}}),()=>json(catalog([row({link:'javascript:alert(1)'})]))])assert.equal((await shareGate(request,context,async()=>response())).status,503);
 }
 assert.equal(next,0);
 const upcoming=await shareGate(new Request(origin+sharePath()),context,async()=>json(catalog([row({applicationStatus:'upcoming'})])));assert.equal(upcoming.status,200);
 const legacyImage=await shareGate(new Request(origin+'/j/og/original/abc.png'),context,async()=>{throw Error('Existing Jobs PNG contract must not change');});assert.equal(legacyImage.status,200);
 const invalid=await shareGate(new Request(origin+'/j/internships/og/abc.png'),context,async()=>{throw Error('must not fetch');});assert.equal(invalid.status,404);
});

test('internship share fallback precedes Jobs and SEO excludes both share lanes',async()=>{
 const config=fs.readFileSync(path.join(__dirname,'../../netlify.toml'),'utf8');
 assert(config.indexOf('from = "/j/internships/*"')<config.indexOf('from = "/j/*"'));assert.match(config,/from = "\/j\/internships\/\*"\s+to = "\/internships.html"/);
 const {pagePolicy}=await import('../gen-seo.mjs');
 for(const production of [true,false]){const policy=pagePolicy('j/internships/chess/abc123.html',production);assert.equal(policy.canonical,'https://stillunemployed.com/internships');assert.equal(policy.robots,'noindex, nofollow');}
});
