const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../js/onboarding.js'),'utf8');
function welcome(version){
 const routes=[];const fail=()=>{throw Error('Arrival must not access storage, create UI, schedule work or acquire locks');};
 const window={SURelease:{version},location:{assign:path=>routes.push(path)},setTimeout:fail,
  document:new Proxy({},{get:fail}),navigator:new Proxy({},{get:fail}),localStorage:new Proxy({},{get:fail}),sessionStorage:new Proxy({},{get:fail})};
 vm.runInNewContext(source,{window});return{api:window.SUWelcome,routes};
}
test('arrivals remain quiet on repeated visits without creating UI or reading/writing receipts',()=>{
 const h=welcome('2.5.3');for(let i=0;i<10;i++)assert.equal(h.api.maybeShow(),false);
 assert.equal(h.api.open(true),false);assert.deepEqual(h.routes,[]);
});
test('legacy manual release triggers go to the current version history with safe fallback',()=>{
 for(const [version,expected] of [['2.5.3','/versions.html#version-2-5-3'],[undefined,'/versions.html'],['<script>','/versions.html']]){
  const h=welcome(version);assert.equal(h.api.open(),true);assert.deepEqual(h.routes,[expected]);
 }
});
