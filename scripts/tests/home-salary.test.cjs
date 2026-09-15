const {test}=require('node:test'),assert=require('node:assert/strict');
const {board,job}=require('./helpers/board-harness.cjs');
function homepage(){const b=board();b.document.body.className='su-home-board';b.location.pathname='/';return b;}
test('root uses the actual board salary bands for annual, hourly and missing amounts',()=>{
 const home=homepage(),dedicated=board();
 for(const pay of ['$79,999','$80,000','$99,999','$100,000','$70–90K','$85,000–$110,000','$25/hour','Competitive','',null]){
  assert.equal(home.app.payTier(pay),dedicated.app.payTier(pay),String(pay));
 }
});
test('homepage renders the full catalog with board salary papers and normal details, saves and filters',()=>{
 const h=homepage(),jobs=Array.from({length:12},(_,i)=>job({co:'Employer '+i,link:'https://example.com/jobs/'+i,pay:['$65K–$75K','$80K–$90K','$100K–$120K'][i%3]}));
 h.init(jobs);assert.equal(h.grid.querySelectorAll('.note[data-act="openJob"]').length,12);
 assert.match(h.document.body.className,/su-home-board/);
 const card=h.grid.querySelector('.note[data-act="openJob"]');card.click();assert(h.overlay.querySelector('[role="dialog"]'));
 h.app.setState({q:'Employer 11'});assert.equal(h.grid.querySelectorAll('.note[data-act="openJob"]').length,1);
 h.app.setLook('beauty');assert.equal(h.location.pathname,'/');assert.equal(h.location.search,'?theme=beauty');assert.match(h.document.body.className,/su-home-board theme-beauty/);
});
