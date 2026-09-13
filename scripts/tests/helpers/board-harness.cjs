// Reuse the established offline adapter without registering its test cases.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'../board-qa.test.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),start=source.indexOf('\ntest('),fixture={exports:{}};
if(start<0)throw Error('Board test adapter is missing');
vm.runInNewContext(source.slice(0,start)+'\nmodule.exports={board,job,row,csv,tick};',{
  require:createRequire(fixturePath),module:fixture,__dirname:path.dirname(fixturePath),Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
module.exports=fixture.exports;
