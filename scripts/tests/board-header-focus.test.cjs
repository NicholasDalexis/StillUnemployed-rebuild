const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture(file, exports, edit=s=>s){const source=fs.readFileSync(file,'utf8'),prefix=edit(source.slice(0,source.indexOf('\ntest('))),module={exports:{}};vm.runInNewContext(prefix+'\nmodule.exports={'+exports+'};',{module,require:createRequire(file),__dirname:path.dirname(file),Buffer,Blob,URL,URLSearchParams,setImmediate,clearTimeout},{filename:file});return module.exports;}
const {board,job}=fixture(path.join(__dirname,'board-qa.test.cjs'),'board,job');
const {tracker,application}=fixture(path.join(__dirname,'tracker-sync.test.cjs'),'tracker,application',s=>s.replace('getAttribute(key){return this.attrs[key]??null;}','getAttribute(key){return this.attrs[key]??null;} removeAttribute(key){delete this.attrs[key];}'));

test('rendered board keeps result announcements offscreen and moves first artwork onto the second displayed job',()=>{
 for(const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']){
  const b=board({look});b.init(Array.from({length:8},(_,i)=>job({co:'Employer '+i,link:'https://example.com/job/'+i})));
  const count=b.grid.querySelector('.su-results-count');assert(count.classList.contains('su-sr-only'));assert.equal(count.getAttribute('aria-live'),'polite');assert.equal(count.textContent,'8 jobs');
  const cards=b.grid.querySelectorAll('.note[data-act="openJob"]');assert.equal(cards[0].querySelector('.doodle'),null);assert(cards[1].querySelector('.doodle'));assert(cards[1].classList.contains('note-lead-doodle'));assert.equal(cards[1].querySelector('.doodle').getAttribute('aria-hidden'),'true');
  b.app.setState({q:'Employer 7'});assert.equal(b.grid.querySelector('.su-results-count').textContent,'1 job');assert.equal(b.grid.querySelector('.note[data-act="openJob"]').querySelector('.doodle'),null,'one remaining job has no lead drawing');
 }
});

test('pointer delete keeps safe Cancel focus, while the first keyboard action restores normal visible-focus styling and trap',()=>{
 const t=tracker([application]),before=t.storage.getItem('su_tracker');
 t.emit('click',t.rowControl('BUTTON','existing','delRow'),{detail:1});
 const dialog=t.input('trk-remove-confirm'),no=t.rowControl('BUTTON','existing','cancelRemoval'),yes=t.rowControl('BUTTON','existing','confirmRemoval');
 assert.equal(dialog.getAttribute('data-pointer-opening'),'true');assert.equal(t.document.activeElement,no);assert.equal(t.storage.getItem('su_tracker'),before);
 t.emit('keydown',no,{key:'Tab'});assert.equal(dialog.getAttribute('data-pointer-opening'),null);assert.equal(t.document.activeElement,yes);assert.equal(t.app.pendingRemoval.pointer,false);
 t.emit('keydown',yes,{key:'Tab',shiftKey:true});assert.equal(t.document.activeElement,no);
 t.emit('keydown',no,{key:'Escape'});assert.equal(t.input('trk-remove-confirm'),null);assert.equal(t.storage.getItem('su_tracker'),before);assert.equal(t.document.activeElement,t.rowControl('BUTTON','existing','delRow'));
});

test('keyboard and assistive activation never suppress the initial Cancel focus, and a later pointer reopening is independent',()=>{
 const t=tracker([application]);
 for(const detail of [0,undefined]){
  t.emit('click',t.rowControl('BUTTON','existing','delRow'),{detail});assert.equal(t.input('trk-remove-confirm').getAttribute('data-pointer-opening'),'false');assert.equal(t.document.activeElement,t.rowControl('BUTTON','existing','cancelRemoval'));t.app.cancelRemoval('existing');
 }
 t.emit('click',t.rowControl('BUTTON','existing','delRow'),{detail:1});assert.equal(t.input('trk-remove-confirm').getAttribute('data-pointer-opening'),'true');
 t.emit('keydown',t.document.activeElement,{key:'Shift'});assert.equal(t.input('trk-remove-confirm').getAttribute('data-pointer-opening'),null,'even a non-Tab keyboard transition releases the pointer-only style');
});
