const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'auth-feedback.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const fixtureModule={exports:{}};
vm.runInNewContext(fixtureSource.slice(0,fixtureSource.indexOf('\ntest('))+'\nmodule.exports={feedbackUI};',{
 require:createRequire(fixturePath),module:fixtureModule,__dirname,Buffer,URL,URLSearchParams,setImmediate,setTimeout,clearTimeout
},{filename:fixturePath});
const {feedbackUI}=fixtureModule.exports;

test('owner mutation requests force a fresh Firebase token while ordinary token callers retain the default',async()=>{
 const calls=[];const ui=await feedbackUI({initialUser:{uid:'qa-fixture',getIdToken:async force=>{calls.push(force);return 'synthetic-token';}}});
 assert.equal(await ui.auth.getToken(),'synthetic-token');assert.equal(await ui.auth.getToken(true),'synthetic-token');
 assert.deepEqual(calls,[false,true]);ui.signIn(null);await assert.rejects(ui.auth.getToken(true));assert.deepEqual(calls,[false,true]);
});
