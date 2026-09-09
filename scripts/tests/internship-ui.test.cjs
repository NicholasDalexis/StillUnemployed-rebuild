const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const I = require('../../js/internships.js');
const Pay = require('../../js/pay-display.js');
const States = require('../../js/us-states.js');

// Reuse the real board renderer/event adapter, changing only its fixture URL.
// No shared test file or product implementation is rewritten on disk.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0);
const fixture = fixtureSource.slice(0, firstTest);
const inlineScripts = [...fs.readFileSync(path.join(__dirname, '../../internships.html'), 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const themeScripts = inlineScripts.map(match => match[1]).filter(script => script.includes('SLUG2LOOK'));
assert.equal(themeScripts.length, 1, 'the actual page owns one theme bootstrap');
const themeBootstrap = themeScripts[0];
const internshipFixture = fixture.replace('deriveState, suShareJob};', 'deriveState, suShareJob, internshipSurface};').replace("pathname:'/jobs.html'", "pathname:'/internships.html'")
  .replace("response,fetchError,", "response,fetchError,hostname='preview--stillunemployed.netlify.app',")
  .replace("hostname:'preview--stillunemployed.netlify.app'", "hostname")
  .replace('vm.runInNewContext(instrumented,context', "document.documentElement=document.createElement('html');vm.runInNewContext(themeBootstrap,context,{filename:'internships.html'});vm.runInNewContext(instrumented,context");
assert.notEqual(internshipFixture, fixture, 'the internship route is set before app.js initializes');
const fixtureModule = { exports:{} };
vm.runInNewContext(internshipFixture + '\nmodule.exports={board};', {
  require:createRequire(fixturePath), module:fixtureModule, __dirname,
  Buffer, URL, URLSearchParams, setImmediate, themeBootstrap
}, { filename:fixturePath });
const { board } = fixtureModule.exports;

test('hosted internships honor the live catalog and never fall back after a status failure', async () => {
  const b = board({fetchError:new Error('status service unavailable')});
  b.window.SUInternships=I;await b.boot();
  assert.equal(b.requests.length,1);
  assert.equal(b.requests[0].url,'/.netlify/functions/internships-catalog');
  assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);
  assert(b.grid.querySelector('[data-act="retryJobs"]'));
});

test('an explicitly empty reviewed feed has a current empty state, distinct from initial preparation', async () => {
  for(const [status,copy] of [['verified','No internships listed right now.'],['awaiting_verification','The internship notebook is getting ready.']]){
    const b=board({response:{ok:true,json:async()=>({schemaVersion:2,status,jobs:[]})}});
    b.window.SUInternships=I;await b.boot();
    assert.equal(b.app._loadError,false);assert(b.grid.textContent.includes(copy));
  }
});

test('localhost previews load the reviewed snapshot and local-only display copy', async () => {
  const b=board({hostname:'localhost',response:{ok:true,json:async()=>({schemaVersion:2,status:'verified',jobs:[]})}});
  b.window.SUInternships=I;await b.boot();
  assert.equal(b.requests.length,2);assert.equal(b.requests[0].url,'./internships-data.json');
  assert.equal(b.requests[1].url,'./netlify/functions/lib/internship-display.json');
  assert.equal(b.app.jobs.length,0);
});
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function listing(extra = {}) {
  const link = extra.link || 'https://example.com/program/design';
  return { co:'Example Studio', role:'Design Intern', link, loc:'Chicago, IL', state:'IL', style:'Hybrid', ind:'Video & Creative',
    desc:'An employer-reviewed student opportunity.', pay:'$22.50/hour', payStatus:'paid', payBasis:'hour',
    eligibility:'Current college students. Must remain enrolled through the complete program and meet the employer’s location requirements.',
    eligibilityFlags:['current_student'], collegeCredit:'available', benefits:['Transit allowance'], cycle:'Summer program',
    duties:['Assist with production files.', 'Help prepare visual concepts.', 'Present research to the design team.'],
    applicationStatus:'open', timingSourceUrl:link, verification:{ status:'open', checkedAt:new Date().toISOString(), sourceUrl:link, reviewerType:'source_check' },
    ...extra };
}
function upcoming(extra = {}) {
  const link = extra.link || 'https://example.com/program/upcoming';
  return listing({ link, applicationStatus:'upcoming', applicationsOpen:'Applications open in a future cycle', applicationsOpenISO:day(30), timingSourceUrl:link,
    verification:{ status:'upcoming', checkedAt:new Date().toISOString(), sourceUrl:link, reviewerType:'source_check', sourceAnnounced:true, upcomingApproved:true }, ...extra });
}
function ui(rows, options = {}) {
  const b = board(options), events = [];
  b.window.SUInternships = I;
  b.window.SUPayDisplay = Pay;
  b.window.SUStates = States;
  b.window.SUAnalytics.job = (name, link) => events.push({ name, link });
  const jobs = I.jobs({ schemaVersion:2, status:'verified', jobs:rows });
  assert.equal(jobs.length, rows.length, 'all fixture rows satisfy the public contract');
  b.init(jobs);assert.equal(b.app.internships, true);
  return { ...b, events,
    cards() { return b.grid.querySelectorAll('.note[data-act="openJob"]'); },
    card(link) { const card = this.cards().find(node => node.getAttribute('data-link') === link);assert(card, link);return card; },
    detail(link) { this.card(link).click();const dialog = b.overlay.querySelector('[role="dialog"]');assert(dialog);return dialog; }
  };
}

test('internship cards and details share compact pay while source amounts and units remain unchanged across all themes', () => {
  const values = [
    { pay:'$22.50/hour', payBasis:'hour', display:'$23/hour' }, { pay:'$1,100/week', payBasis:'week', display:'$1,100/week' },
    { pay:'$4,500 program stipend', payBasis:'program', display:'$4,500/program' },
    { pay:'$120,000/year (annualized)', payBasis:'annualized_year', display:'$120K/year' }
  ];
  for (const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']) {
    const rows = values.map((pay, index) => listing({ ...pay, link:'https://example.com/program/pay/' + index }));
    const b = ui(rows, { look }), surfaces = [];
    for (const [index, row] of rows.entries()) {
      const card = b.card(row.link), label = card.querySelector('.su-internship-pay');assert(label);
      assert.equal(label.textContent, values[index].display, look + ' compact ' + row.pay);
      surfaces.push(card.style.background);
      const detail = b.detail(row.link);assert(detail.textContent.includes(values[index].display));
      assert.equal(detail.querySelector('.su-pay-source'),null,'no extra pay disclosure on the TL;DR');
      assert(!detail.textContent.includes('Pay details'));
      assert.equal(b.app.jobs.find(job=>job.link===row.link).payBasis,row.payBasis);
      assert.equal(b.app.jobs.find(job=>job.link===row.link).pay, row.pay, 'rendering never edits source pay');
      b.app.setState({ detailOpen:false });
    }
    const before = new Map(rows.map((row,index)=>[row.link,surfaces[index]]));
    b.app.jobs.forEach(row=>{row.pay='$200,000/year (annualized)';row.payBasis='annualized_year';});b.app.render();
    for(const row of rows)assert.equal(b.card(row.link).style.background,before.get(row.link),look+' paper does not change with pay');
    assert(!b.grid.textContent.includes('$46,800'), 'no computed annual equivalent for hourly pay');
  }
});

test('USD amounts keep an explicit currency marker in both the card and detail', () => {
  const row = listing({ pay:'USD 23.75/hour' }), b = ui([row]);
  const label = b.card(row.link).querySelector('.su-internship-pay').textContent;
  assert.equal(label, '$24/hour');
  const detail=b.detail(row.link);assert(detail.textContent.includes(label));
  assert.equal(detail.querySelector('.su-pay-source'),null);
  assert.equal(b.app.jobs[0].pay,'USD 23.75/hour');assert.equal(b.app.jobs[0].payBasis,'hour');
});

test('internship open notes use the approved student deck, hide the stamp until closed, and stay stable during the visit', () => {
  const rows = Array.from({ length:12 }, (_, index) => listing({ link:'https://example.com/program/annualized/' + index,
    pay:'$120,000/year (annualized)', payBasis:'annualized_year' }));
  const b = ui(rows);assert.equal(b.cards().length, 12);
  const noteCards=b.cards().filter(card=>card.querySelector('[data-act="openNote"]'));
  assert(noteCards.length>=2,'an internship board includes several personal open notes');
  const copy=[];
  for(const card of noteCards){
    const link=card.getAttribute('data-link');b.card(link).querySelector('[data-act="openNote"]').click();
    const opened=b.card(link);assert.equal(opened.querySelector('.su-internship-stamp'),null,'the note occupies the stamp area until closed');
    const note=Array.from(b.app.INTERNSHIP_NOTES).find(text=>opened.textContent.includes(text));assert(note,'only the student-specific deck appears');copy.push(note);
    for(const fullTime of b.app.NOTES)assert(!opened.textContent.includes(fullTime),'full-time endorsement text is not reused');
    b.app.render();assert(b.card(link).textContent.includes(note),'ordinary renders do not reshuffle an open note');
  }
  assert.equal(new Set(copy).size,Math.min(copy.length,b.app.INTERNSHIP_NOTES.length),'the available notes rotate before repeating');
  const first=b.app.shuffledNotes()[0],next=board();next.window.SUInternships=I;next.localStorage.setItem('su_last_open_note_internships',first);
  next.init(I.jobs({schemaVersion:2,status:'verified',jobs:rows}));
  assert.notEqual(next.app.shuffledNotes()[0],first,'a new visit avoids repeating its prior first note');
});

test('compact fronts contain city and state but no attendance, timing or source-review commentary', () => {
  const row = listing({loc:'Chicago, IL, United States',style:'Hybrid; confirm attendance with employer',startDate:'January 2031',deadline:'September 2030'});
  const b=ui([row]),card=b.card(row.link);
  assert.equal(card.querySelector('.card-location').textContent,'Chicago, IL');
  assert.equal(card.querySelector('.su-internship-status'),null);assert.equal(card.querySelector('.su-internship-timing'),null);
  assert.doesNotMatch(card.textContent,/United States|confirm attendance|Hybrid|January|September|Accepting applications/);
  assert(card.textContent.includes(row.co));assert(card.textContent.includes(row.role));
});

test('normal-size internship TL;DR keeps duties and a final program bullet without source-record dumps', () => {
  const row = listing(), original=JSON.stringify(row),b = ui([row]), detail = b.detail(row.link);
  assert.equal(detail.style.width,'410px');assert(detail.textContent.includes('TL;DR'));
  assert.equal(detail.querySelector('.su-internship-details'),null);
  assert(!detail.textContent.includes(row.eligibility));assert(!detail.textContent.includes(row.benefits[0]));
  const bullets=Array.from(detail.querySelector('.su-internship-duties').querySelectorAll('li'),node=>node.textContent);
  assert.equal(bullets.length,4);assert.deepEqual(bullets.slice(0,3),row.duties);assert.match(bullets[3],/Summer program/);
  assert.equal(JSON.stringify(row),original,'rendering does not rewrite the source record');
  assert.equal(b.app.jobs[0].eligibility,row.eligibility);assert.deepEqual(Array.from(b.app.jobs[0].benefits),row.benefits);
});

test('missing duties do not invent work, and a fourth source duty never displaces the program bullet', () => {
  const row = upcoming({duties:[]}), b=ui([row]),detail=b.detail(row.link);
  const bullets=detail.querySelector('.su-internship-duties').querySelectorAll('li');
  assert.equal(bullets.length,1);assert.match(bullets[0].textContent,/Summer program/);
  b.app.jobs[0].duties=['One task.','Two tasks.','Three tasks.','Unexpected fourth task.'];b.app.renderOverlays();
  const updated=b.overlay.querySelector('[role="dialog"]');
  assert.equal(updated.querySelector('.su-internship-duties').querySelectorAll('li').length,4);
  assert(!updated.textContent.includes('Unexpected fourth task.'));assert(!updated.textContent.includes(row.eligibility));
});

test('compact cards preserve accepting versus program actions with an offscreen result announcement', () => {
  const rows=[listing(),upcoming(),upcoming({link:'https://example.com/program/stale',applicationsOpenISO:day(-1)})],b=ui(rows);
  assert.deepEqual(rows.map(row=>I.applicationState(row)),['accepting','upcoming','needs_recheck']);
  const labels=rows.map(row=>b.card(row.link).querySelector('.applylink2').textContent);
  assert.match(labels[0],/Apply Now/);assert.match(labels[1],/View program/);assert.match(labels[2],/View program/);
  for(const row of rows)assert.equal(b.card(row.link).querySelector('.su-internship-status'),null);
  const count=b.grid.querySelector('.su-results-count');assert(count);
  assert.equal(count.textContent,'3 internships');assert(count.classList.contains('su-sr-only'));assert.equal(count.getAttribute('aria-live'),'polite');
  assert.equal(b.grid.querySelector('.su-internship-counts'),null);
  assert.doesNotMatch(count.textContent,/status being checked/i);
});

test('focus returning from outside the document stays within the active detail and releases after close', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link);
  const outside = b.document.body.appendChild(b.document.createElement('button'));
  const apply = detail.querySelector('[data-act="detailApply"]');assert(apply);
  apply.focus();b.fire('focusin', apply);
  assert.equal(b.document.activeElement, apply, 'a valid dialog focus target is preserved');
  outside.focus();b.fire('focusin', outside);
  assert(detail.contains(b.document.activeElement), 'a focus move into the page returns inside the dialog');
  b.fire('keydown', b.document.activeElement, { key:'Escape' });
  assert.equal(b.overlay.querySelector('[role="dialog"]'), null);
  outside.focus();b.fire('focusin', outside);
  assert.equal(b.document.activeElement, outside, 'closed dialogs no longer redirect page focus');
});

test('an open native welcome dialog retains ownership of focus over the board detail', () => {
  const row = listing(), b = ui([row]);b.detail(row.link);
  const welcome = b.document.body.appendChild(b.document.createElement('dialog'));
  welcome.id = 'su-launch';welcome.setAttribute('open', '');
  const button = welcome.appendChild(b.document.createElement('button'));
  button.focus();b.fire('focusin', button);
  assert.equal(b.document.activeElement, button, 'the board guard does not steal focus from the native dialog');
});

test('unpaid and undisclosed opportunities stay distinct and the quiet count follows filtered cards', () => {
  const rows = [listing(), listing({ link:'https://example.com/program/unpaid', payStatus:'unpaid', pay:'Unpaid', payBasis:'not_listed', collegeCredit:'not_listed' }),
    listing({ link:'https://example.com/program/unknown-pay', payStatus:'not_disclosed', pay:'Not disclosed', payBasis:'not_listed' })];
  const b = ui(rows);
  assert.equal(b.card(rows[1].link).querySelector('.su-internship-pay').textContent, 'Unpaid');
  assert.match(b.card(rows[2].link).querySelector('.su-internship-pay').textContent, /not disclosed/i);
  b.app.setState({ pr:'Paid' });assert.equal(b.cards().length, 1);
  assert.equal(b.cards()[0].getAttribute('data-link'), rows[0].link);
  assert.equal(b.grid.querySelector('.su-results-count').textContent, '1 internship');
  assert.equal(b.grid.querySelector('.su-internship-counts'),null);
});

test('View program for upcoming or recheck listings never opens application feedback or reports an application action', () => {
  for (const row of [upcoming(), upcoming({ applicationsOpenISO:day(-1) })]) {
    const b = ui([row]), card = b.card(row.link);
    assert.match(card.querySelector('.applylink2').textContent, /View program/);
    const detail = b.detail(row.link), view = detail.querySelector('[data-act="detailProgram"]');assert(view);
    assert.equal(detail.querySelector('[data-act="detailApply"]'), null);
    view.click();assert.equal(b.opened.length, 1);assert.equal(b.opened[0][0], row.link);assert.equal(b.opened[0][2], 'noopener');
    assert.equal(b.app.state.feedbackOpen, false);
    assert(!b.events.some(event => ['apply_click','application_reported'].includes(event.name)));
    assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);assert.equal(b.requests.length, 0);
  }
});

test('accepting Apply Now opens feedback, but only an explicit I applied confirmation creates a tracker record', async () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link);
  const apply = detail.querySelector('[data-act="detailApply"]');assert(apply);assert.match(apply.textContent, /Apply Now/);
  apply.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(b.opened[0][0], row.link);assert.equal(b.app.state.feedbackOpen, true);
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);
  assert.equal(b.events.filter(event => event.name === 'apply_click').length, 1);
  b.overlay.querySelector('[data-act="markApplied"]').click();
  assert.equal(JSON.parse(b.localStorage.getItem('su_tracker'))[0].link, row.link);
  assert.equal(b.events.filter(event => event.name === 'application_reported').length, 1);
});

test('a previously rendered Apply control cannot submit application feedback after the listing stops accepting', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link), apply = detail.querySelector('[data-act="detailApply"]');
  b.app.jobs[0].applicationStatus = 'unknown';apply.click();
  assert.equal(b.app.state.feedbackOpen, false);
  assert(!b.events.some(event => ['apply_click','application_reported'].includes(event.name)));
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);
});

test('internship Saved and Tracker retain existing raw URL identities across canonical employer aliases', async () => {
  const primary = 'https://boards.greenhouse.io/example/jobs/12345';
  const alias = 'https://job-boards.greenhouse.io/example/jobs/12345';
  const oldTracker = { id:'existing-internship', company:'Example Studio', role:'Design Intern', link:alias, status:'Interview', notes:'Existing private note' };
  const b = ui([listing({ link:primary })], { saved:{ [alias]:true }, tracker:[oldTracker] });
  assert.equal(b.cards().length, 1);assert.equal(b.app.isSaved(primary), true);
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), { [alias]:true }, 'rendering does not migrate the existing key');
  b.card(primary).querySelector('[data-act="toggleSave"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), {}, 'unsaving removes the equivalent stored alias');
  b.card(primary).querySelector('[data-act="toggleSave"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), { [primary]:true });
  b.detail(primary).querySelector('[data-act="detailApply"]').click();await new Promise(resolve=>setImmediate(resolve));
  b.overlay.querySelector('[data-act="markApplied"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), [oldTracker], 'confirmation does not duplicate or overwrite an existing equivalent tracker record');
});

test('sharing an internship returns to the internship feed with the same URL identity and selected theme', () => {
  const row = listing(), b = ui([row], { look:'poker' });
  b.detail(row.link).querySelector('[data-act="detailShare"]').click();
  assert.equal(b.shared.length, 1);const shared = new URL(b.shared[0].url);
  assert.match(shared.pathname, /^\/j\/internships\/poker\/[a-z0-9]+\.html$/);assert.equal(shared.searchParams.get('theme'), 'poker');
  assert.equal(Buffer.from(shared.searchParams.get('job'), 'base64').toString('utf8'), row.link);
  const next = ui([row], { search:shared.search });
  assert.equal(next.app.state.look, 'poker');next.runTimers(900);
  assert.equal(next.card(row.link).scrolled, true, 'the incoming share highlights its matching internship');
  assert.equal(next.card(row.link).style.outline, '3px solid #D8502E');
  next.detail(row.link);assert.equal(next.app.state.detailLink, row.link);
});

test('employer text renders as text, without introducing executable markup or account/reviewer fields', () => {
  const sentinel = 'PRIVATE_REVIEW_NOTE_SHOULD_NOT_RENDER';
  const row = listing({ eligibility:'Students who can discuss <script>alert(1)</script> safely.',
    eligibilityFlags:['Students <img src=x onerror=alert(1)>'], duties:['Discuss <svg onload=alert(1)> examples.'],
    benefits:['Meals & transit'], privateReviewNote:sentinel });
  const b = ui([row]), detail = b.detail(row.link);
  assert(!detail.textContent.includes(row.eligibility));assert(detail.textContent.includes(row.duties[0]));
  assert.equal(detail.querySelector('script,img,svg[onload],[onerror]'), null);
  assert(!b.grid.textContent.includes(sentinel));assert(!detail.textContent.includes(sentinel));
});


test('internship papers are stable across aliases, filtering, ordering and pay, with a weighted decorative mix', () => {
  const b=ui([listing()]),surface=b.helpers.internshipSurface,counts={high:0,mid:0,low:0};
  for(let index=0;index<2000;index++)counts[surface({link:'https://job-boards.greenhouse.io/example/jobs/'+(10000+index)})]++;
  assert(counts.high>1100&&counts.high<1300,JSON.stringify(counts));
  assert(counts.mid>420&&counts.mid<580,JSON.stringify(counts));
  assert(counts.low>230&&counts.low<370,JSON.stringify(counts));
  assert.equal(surface({link:'https://boards.greenhouse.io/example/jobs/12345?utm_source=friend'}),surface({link:'https://job-boards.greenhouse.io/example/jobs/12345',pay:'Unpaid'}));
  const rows=Array.from({length:24},(_,index)=>listing({link:'https://example.com/program/decorative/'+index})),view=ui(rows);
  const before=new Map(rows.map(row=>[row.link,view.card(row.link).style.background]));
  view.app.jobs.reverse();view.app.render();
  for(const row of rows)assert.equal(view.card(row.link).style.background,before.get(row.link));
  view.app.setState({q:'Design Intern'});
  for(const row of rows)assert.equal(view.card(row.link).style.background,before.get(row.link));
  assert(!view.grid.textContent.includes('pay key'));
  assert.equal(view.grid.querySelector('.su-internship-summary').textContent,'Dates and details inside.');
  assert.equal(view.grid.querySelector('.su-results-count').textContent,'24 internships');
});

test('every internship paper variant uses matching theme ink and visible saved controls across all eight looks', () => {
  const brand=fs.readFileSync(path.join(__dirname,'../../css/brand.css'),'utf8');
  const resolve=value=>value.replace(/var\((--[\w-]+)\)/g,(_,key)=>brand.match(new RegExp(key+': ([^;]+)'))[1]);
  const luminance=color=>{const rgb=color.match(/[0-9a-f]{2}/ig).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const contrast=(first,second)=>{const pair=[luminance(first),luminance(second)].sort((a,b)=>a-b);return (pair[1]+.05)/(pair[0]+.05);};
  const rows=Array.from({length:6},(_,index)=>listing({link:'https://example.com/program/color/'+index}));
  for(const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']){
    const b=ui(rows,{look}),P=b.app.THEMES[look],examples={};
    for(const row of rows)examples[b.helpers.internshipSurface(row)] ||= row;
    const surfaces=[];
    for(const [variant,row] of Object.entries(examples)){
      let card=b.card(row.link);const envelope=card.querySelector('[data-act="openNote"]');if(envelope){assert.equal(card.querySelector('.su-internship-stamp'),null);envelope.click();b.card(row.link).querySelector('[data-act="closeNote"]').click();b.runTimers(290);card=b.card(row.link);}surfaces.push(card.style.background);
      const ink=variant==='high'?P.hiInk:variant==='mid'&&P.midInk?P.midInk:(P.baseInk||'#3A2A1B');
      assert.equal(card.style.color,ink,look+'/'+variant+' matches the paper ink');
      const action=(look==='mermaid'||(look==='bratt'&&variant==='mid')||(look==='beauty'&&variant!=='high'))?ink:variant==='high'?P.hiApply:variant==='mid'&&P.midApply?P.midApply:(P.baseApply||'var(--su-orange-on-card)');
      assert.equal(card.querySelector('.applylink2').style.color,action,look+'/'+variant+' matches the action ink');
      const stamp=card.querySelector('.su-internship-stamp');assert(stamp,look+'/'+variant+' retains the internship label');
      assert.equal(stamp.style.color,ink,look+'/'+variant+' stamp uses its readable card ink');
      assert(stamp.textContent.includes('Internship'));assert(!stamp.textContent.includes('Human'));
      for(const stop of resolve(card.style.background).match(/#[0-9a-f]{6}/ig)){
        assert(contrast(resolve(ink),stop)>=4.5,look+'/'+variant+' body text contrast');
        assert(contrast(resolve(action),stop)>=4.5,look+'/'+variant+' small action label contrast');
      }
      card.querySelector('[data-act="toggleSave"]').click();
      const bookmark=b.card(row.link).querySelector('.bmbtn').querySelector('svg');
      assert.equal(bookmark.getAttribute('stroke'),b.card(row.link).style.color);
      assert.equal(bookmark.getAttribute('fill'),b.card(row.link).style.color);
    }
    assert.equal(new Set(surfaces).size,3,look+' has three actual theme papers');
  }
});

test('compact internship dialogs retain keyboard containment and outside-click dismissal',()=>{
  const row=listing(),b=ui([row]),detail=b.detail(row.link);
  const focusable=detail.querySelectorAll('button,[role="button"],a,iframe').filter(node=>node.getAttribute('tabindex')!=='-1');
  assert(focusable.length>2);
  const first=focusable[0],last=focusable.at(-1);
  last.focus();b.fire('keydown',last,{key:'Tab'});
  assert.equal(b.document.activeElement,first,'Tab wraps to the start of the compact note');
  first.focus();b.fire('keydown',first,{key:'Tab',shiftKey:true});
  assert.equal(b.document.activeElement,last,'Shift+Tab wraps to the end of the compact note');
  const backdrop=detail.parentElement;assert.equal(backdrop.getAttribute('data-act'),'closeDetail');
  backdrop.click();assert.equal(b.overlay.querySelector('[role="dialog"]'),null);
  assert.equal(b.app.state.detailOpen,false);
});

test('changing any internship theme preserves the section and shared listing through reload', () => {
  for (const pathname of ['/internships', '/internships.html']) {
    for (const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']) {
      const jobToken = 'abc+/==';
      const b = ui([listing()], { search:'?job='+encodeURIComponent(jobToken)+'&theme=beauty&theme=chess&ref=board' });
      b.location.pathname = pathname;b.location.hash = '#saved';
      b.app.setLook(look);
      const query = new URLSearchParams(b.location.search);
      assert.equal(b.location.pathname,pathname);
      assert.equal(b.location.hash,'#saved');
      assert.equal(query.get('job'),jobToken);
      assert.equal(query.get('ref'),'board');
      assert.deepEqual(query.getAll('theme'),[look]);
      const reloaded = ui([listing()], { search:b.location.search, look:look==='beauty'?'poker':'beauty' });
      assert.equal(reloaded.app.state.look,look);
      assert.equal(reloaded.app.internships,true);
    }
  }
});

test('an unavailable history API does not prevent internship theme changes', () => {
  const b=ui([listing()]);
  b.history.replaceState=()=>{throw new Error('history unavailable');};
  assert.doesNotThrow(()=>b.app.setLook('poker'));
  assert.equal(b.app.state.look,'poker');
  assert.equal(b.localStorage.getItem('su_look'),'poker');
});


test('internships retain the first theme drawing and the same visible share hint as Jobs', () => {
  for (const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']) {
    const row=listing(), b=ui([row], {look});
    assert(b.cards()[0].classList.contains('note-lead-doodle'));
    assert(b.cards()[0].querySelector('.doodle'));
    const dialog=b.detail(row.link);
    assert(dialog.classList.contains('su-detail-dialog'));
    assert.equal(dialog.querySelector('.su-detail-share-hint').textContent,'Share');
    assert(dialog.querySelector('.su-detail-company'));
    dialog.querySelector('.su-detail-share-hint').click();
    const url=new URL(b.shared[0].url);assert(url.pathname.startsWith('/j/internships/'+look+'/'));
    assert.equal(Buffer.from(url.searchParams.get('job'),'base64').toString(),row.link);
    assert.equal(b.shared[0].files,undefined,'share only the clickable card link');
  }
});
