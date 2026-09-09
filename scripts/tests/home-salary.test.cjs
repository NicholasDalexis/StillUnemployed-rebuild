const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

// Execute the board's real classifier using its existing offline adapter.
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const firstTest=fixtureSource.indexOf('\ntest(');
assert(firstTest>0);
const fixtureModule={exports:{}};
vm.runInNewContext(fixtureSource.slice(0,firstTest)+'\nmodule.exports={board};',{
  require:createRequire(fixturePath),module:fixtureModule,__dirname,
  Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});

function homepage() {
  const total={textContent:''};
  const featured={children:[],appendChild(card){this.children.push(card);},
    set innerHTML(value){assert.equal(value,'');this.children=[];}};
  const sandbox={btoa:s=>Buffer.from(s,'binary').toString('base64'),window:{addEventListener(){}},setInterval(){},
    document:{readyState:'loading',addEventListener(){},
      querySelector(selector){return selector==='#nh-total'?total:selector==='#nh-featured'?featured:null;},
      createElement(tag){
        const slots=Array.from({length:7},()=>({textContent:''}));
        return{tagName:tag.toUpperCase(),style:{},attributes:{},slots,
          setAttribute(key,value){this.attributes[key]=value;},
          querySelectorAll(selector){assert.equal(selector,'div');return slots;}};
      }
    }};
  const source=fs.readFileSync(path.join(__dirname,'../../js/home.js'),'utf8');
  const instrumented=source.replace(/\}\)\(\);\s*$/,
    'globalThis.homeSalary={payTier:nhPayTier,render:nhRenderJobs};\n})();');
  assert.notEqual(instrumented,source);
  vm.runInNewContext(instrumented,sandbox,{filename:'js/home.js'});
  return{...sandbox.homeSalary,total,featured};
}

test('homepage salary bands match the board for boundaries, ranges, hourly and missing amounts',()=>{
  const home=homepage(),app=fixtureModule.exports.board().app;
  const cases=[
    ['$79,999','low'],['$80,000','mid'],['$99,999','mid'],['$100,000','high'],
    ['$79.999K','low'],['$80K','mid'],['$99.999K','mid'],['$100K+','high'],
    ['$63K–$87K','mid'],['$70–90K','mid'],['$70,500–$79,500','low'],
    ['$85,000–$110,000','high'],['$80000','mid'],['$100000','high'],
    ...['$25/h','$25/hr','$25/hour','$25 per hour','$25 hourly','$50–$100/hr'].map(pay=>[pay,'low']),
    ['Competitive','low'],['','low'],[null,'low'],[undefined,'low']
  ];
  for(const [pay,expected] of cases){
    assert.equal(app.payTier(pay),expected,'board policy for '+pay);
    assert.equal(home.payTier(pay),app.payTier(pay),'homepage parity for '+pay);
  }
});

test('featured homepage cards use salary paper even when every listing is marked featured',()=>{
  const home=homepage();
  const jobs=[
    {co:'Example low',pay:'$63K–$79K'},
    {co:'Carvana',pay:'$63K–$87K'},
    {co:'Example high',pay:'$100K–$120K'}
  ].map((job,i)=>({...job,role:'Designer',loc:'Remote',style:'Full-time',pick:true,link:'https://example.com/jobs/'+i}));
  home.render(jobs);
  assert.equal(home.total.textContent,'3');
  assert.equal(home.featured.children.length,3);
  const papers=['--su-salary-low-paper','--su-salary-mid-paper','--su-yellow-paper'];
  home.featured.children.forEach((card,i)=>{
    assert(card.style.cssText.includes('background:var('+papers[i]+');'),jobs[i].co+' salary surface');
    assert.equal(card.slots[1].textContent,jobs[i].co);
    assert.equal(card.slots[3].textContent,jobs[i].pay);
    const target=new URL(card.href,'https://preview--stillunemployed.netlify.app');assert.equal(target.pathname,'/jobs.html');assert.equal(Buffer.from(target.searchParams.get('job'),'base64').toString('utf8'),jobs[i].link);
    assert.equal(card.tagName,'A');
    assert.equal(card.rel,'noopener noreferrer');
  });
});
