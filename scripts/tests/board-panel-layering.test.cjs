'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

// Render the actual board, rather than constructing a substitute filter/menu.
// This checks the CSS stacking contract, not pixel geometry or browser hit testing.
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixture=fs.readFileSync(fixturePath,'utf8')
  .replace("look='original',response", "look='original',internships=false,response")
  .replace("pathname:'/jobs.html'", "pathname:internships?'/internships.html':'/jobs.html'");
const firstTest=fixture.indexOf('\ntest(');
assert(firstTest>0);
const fixtureModule={exports:{}};
vm.runInNewContext(fixture.slice(0,firstTest)+'\nmodule.exports={board};',{
  require:createRequire(fixturePath),module:fixtureModule,__dirname,Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board}=fixtureModule.exports;

const css=fs.readFileSync(path.join(__dirname,'../../css/board-runtime.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const menuRules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap(match=>match[1].trim().split(',').map(selector=>({selector:selector.trim(),body:match[2]})))
  .filter(rule=>/^\.su-board-menu(?:\[open\])?$/.test(rule.selector));
function menuLayer(menu){
  let position='static',zIndex='auto';
  for(const rule of menuRules){
    if(!menu.matches(rule.selector))continue;
    for(const declaration of rule.body.split(';')){
      const colon=declaration.indexOf(':');if(colon<0)continue;
      const key=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();
      if(key==='position')position=value;if(key==='z-index')zIndex=value;
    }
  }
  assert.notEqual(position,'static','the menu anchors its own disclosure sheet');
  return zIndex==='auto'?0:Number(zIndex);
}
function outerPositionedLayer(node){
  let layer=null;
  for(let current=node;current;current=current.parentElement){
    if(current.style.position&&current.style.zIndex!==undefined&&current.style.zIndex!=='auto')
      layer=Number(current.style.zIndex);
  }
  assert(Number.isFinite(layer),'the rendered panel has a real outer stacking layer');
  return layer;
}
for(const internships of [false,true])for(const panelName of ['cat','filters']){
  test(`${internships?'Internships':'Jobs'}: closed Board menu stays below the ${panelName} panel and its controls`,()=>{
    const b=board({internships});b.init();
    const action=panelName==='cat'?'toggleCat':'toggleFilters';
    b.fire('click',b.grid.querySelector(`[data-act="${action}"]`));
    assert.equal(b.app.internships,internships);
    assert.equal(b.app.state.openPanel,panelName,'the real toggle opens the requested panel');
    const panel=b.grid.querySelector(`[data-su-panel="${panelName}"]`);
    const menu=b.grid.querySelector('#su-board-menu');
    const summary=menu.querySelector('#su-board-menu-trigger');
    assert(panel&&summary&&summary.isConnected);
    assert.equal(menu.getAttribute('open'),null,'the summary is still visible with its menu closed');
    const panelLayer=outerPositionedLayer(panel);
    assert(menuLayer(menu)<panelLayer,
      `closed summary layer ${menuLayer(menu)} must stay below panel layer ${panelLayer}, even where they overlap`);
    if(panelName==='filters'){
      const close=panel.querySelector('[data-act="toggleFilters"]');assert(close);
      assert.equal(outerPositionedLayer(close),panelLayer,'the actual X stays inside the panel stacking context');
      b.fire('click',close);
    }else b.fire('click',panel.querySelector('[data-act="cat"]'));
    assert.equal(b.app.state.openPanel,null,'panel close/selection stays usable');
    assert.equal(b.grid.querySelector('[data-su-panel]'),null);
    const resting=b.grid.querySelector('#su-board-menu');
    const restingLayer=menuLayer(resting);
    resting.setAttribute('open','');
    assert(menuLayer(resting)>panelLayer,'only an open disclosure receives the higher menu layer');
    resting.removeAttribute('open');
    assert.equal(menuLayer(resting),restingLayer,'closing restores the lower summary layer');
  });
}
