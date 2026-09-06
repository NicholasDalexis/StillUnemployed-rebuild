const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const I=require('../../js/internships.js');
const P=require('../lib/internship-projection.cjs');
const NOW=Date.parse('2030-09-06T16:00:00Z');
function row(extra={}){return {co:'Example Studio',role:'Design Intern',link:'https://job-boards.greenhouse.io/example/jobs/12345',loc:'Remote, US',ind:'Video & Creative',style:'Remote',pay:'$22.50/hour',payStatus:'paid',payBasis:'hour',collegeCredit:'not_listed',eligibility:'Current students. Authorization and enrollment conditions apply.',eligibilityFlags:['Current students','Authorization conditions apply'],duties:['Draft campaign graphics','Revise designs with feedback','Prepare production files'],benefits:['Housing support subject to eligibility'],cycle:'Winter 2031',applicationStatus:'open',applicationsOpen:'Open now',startDate:'January 4, 2031',startDateISO:'2031-01-04',deadline:'Not listed',timingSourceUrl:'https://example.org/internships',verification:{status:'open',checkedAt:'2030-09-06T15:00:00Z',sourceUrl:'https://example.org/internships',reviewerType:'source_check'},...extra};}
function upcoming(extra={}){return row({applicationStatus:'upcoming',applicationsOpen:'Fall 2030',duties:[],verification:{status:'upcoming',checkedAt:'2030-09-06T15:00:00Z',sourceUrl:'https://example.org/internships',reviewerType:'source_check',sourceAnnounced:true,upcomingApproved:true},...extra});}
function feed(jobs,version=2){return {schemaVersion:version,status:'verified',jobs};}
function operational(extra={}){return {...Object.fromEntries(P.HEADERS.map(h=>[h,''])),Company:'Example Studio','Job Title':'Design Intern',Link:row().link,Location:'Remote, US',Type:'Remote',Salary:'$22.50/hour','Years of Experience':'See eligibility',Category:'Video & Creative',Description:'Public employer role summary',Pick:'FALSE','Active/Dead':'Active','TL;DR':'Draft campaign graphics\nRevise designs with feedback\nPrepare production files',Cycle:'Winter 2031','Eligibility Flags':'Current students\nAuthorization conditions apply','College Credit':'Not listed','Pay Basis':'hour','Pay Status':'Paid',Benefits:'Housing support subject to eligibility','Application Status':'Open','Applications Open':'Open now','Start Date':'January 4, 2031','Application Deadline':'Not listed','Timing Source':'https://example.org/internships',...extra};}
function admission(extra={}){return {publicationApproved:true,officialSourceChecked:true,sourceLink:row().link,sourceUrl:'https://example.org/internships',timingSourceUrl:'https://example.org/internships',checkedAt:'2030-09-06T15:00:00Z',applicationStatus:'open',...extra};}
function table(record,headers=P.HEADERS){return {schemaVersion:2,headers,rows:[headers.map(h=>record[h]===undefined?'':record[h])]};}

test('v1 remains readable and the shipped feed validates every admitted record',()=>{
 const old={co:'Example',role:'Intern',link:'https://example.org/job',loc:'US',eligibility:'See employer eligibility',payStatus:'paid',pay:'$22.50/hour',verification:{status:'open',checkedAt:'2030-09-06T15:00:00Z'}};
 assert.equal(I.jobs(feed([old],1),NOW)[0].pay,old.pay);
 assert.deepEqual(I.jobs({...feed([row()]),status:'awaiting_verification'},NOW),[]);
 assert.throws(()=>I.jobs({...feed([]),schemaVersion:99},NOW),/Invalid internship feed/);
 const shipped=JSON.parse(fs.readFileSync(require.resolve('../../internships-data.json'),'utf8'));
 assert.ok(['awaiting_verification','verified'].includes(shipped.status));
 if(shipped.status==='awaiting_verification')assert.deepEqual(shipped.jobs,[]);
 else assert.equal(shipped.schemaVersion,2);
 assert.equal(I.jobs(shipped,Date.now()).length,shipped.jobs.length);
});
test('accepting-now roles may start months later without a major-brand exception',()=>{
 const accepted=I.jobs(feed([row()]),NOW);assert.equal(accepted.length,1);
 assert.equal(I.applicationState(accepted[0],NOW),'accepting');assert.equal(I.canApply(accepted[0],NOW),true);
 assert.equal(accepted[0].startDate,'January 4, 2031');assert.deepEqual(accepted[0].duties,row().duties);
});
test('a stated nine-week program amount does not repeat the program label',()=>{
 const pay='$9,000 for the 9-week summer program';
 const accepted=I.jobs(feed([row({pay,payBasis:'program'})]),NOW);
 assert.equal(I.payLabel(accepted[0]),pay);
 assert.equal(I.payLabel(row({pay:'$9,000',payBasis:'program'})),'$9,000 for the program');
});
test('upcoming permits source-announced partial or unannounced dates and unknown duties',()=>{
 for(const applicationsOpen of ['Fall 2030','Not announced']){
  const job=upcoming({applicationsOpen});const result=I.jobs(feed([job]),NOW);
  assert.equal(result.length,1);assert.equal(result[0].applicationsOpen,applicationsOpen);assert.equal(result[0].applicationsOpenISO,undefined);
  assert.equal(I.applicationState(result[0],NOW),'upcoming');assert.equal(I.canApply(result[0],NOW),false);
 }
});
test('announced opening arrival needs a source recheck and never becomes accepting by the calendar',()=>{
 const job=upcoming({applicationsOpenISO:'2030-09-07T09:00:00-04:00'}),before=JSON.stringify(job);
 assert.equal(I.applicationState(job,NOW),'upcoming');
 assert.equal(I.applicationState(job,Date.parse('2030-09-07T13:00:00Z')),'needs_recheck');
 assert.equal(I.applicationState(job,Date.parse('2030-10-01T00:00:00Z')),'needs_recheck');
 assert.equal(I.jobs(feed([job]),Date.parse('2030-10-01T00:00:00Z')).length,1);
 assert.equal(I.canApply(job,Date.parse('2030-10-01T00:00:00Z')),false);assert.equal(JSON.stringify(job),before);
});
test('counts separate accepting, upcoming and recheck cards without retirement on check age',()=>{
 const rows=[row(),upcoming(),upcoming({applicationsOpenISO:'2030-09-05'})];
 assert.deepEqual(I.counts(rows,NOW),{accepting:1,upcoming:1,needs_recheck:1,total:3});
 assert.equal(I.applicationState(row({verification:{...row().verification,checkedAt:'2029-01-01T00:00:00Z'}}),NOW),'accepting');
});
test('deadline precision is preserved; elapsed exact deadlines disable Apply without inventing closure',()=>{
 const job=row({deadline:'September 6, 2030 at 1 PM EDT',deadlineISO:'2030-09-06T13:00:00-04:00'});
 assert.equal(I.canApply(job,NOW),true);assert.equal(I.canApply(job,NOW+3600000),false);
 assert.equal(I.jobs(feed([job]),NOW+3600000).length,1);
 assert.equal(I.canApply(row({deadline:'Rolling; no fixed deadline'}),NOW),true);
 assert.equal(I.canApply(row({deadlineISO:'2030-09-05'}),NOW),false);
});
test('malformed, contradictory, closed and unknown timing is rejected',()=>{
 const cases=[row({applicationStatus:'closed'}),row({applicationStatus:'unknown'}),row({applicationStatus:'upcoming'}),row({deadlineISO:'2030-02-30'}),row({applicationsOpenISO:'next month'}),row({startDateISO:'2031-01-04T12:00:00'}),row({startDateISO:'2031-01-04T24:00:00Z'}),row({verification:{...row().verification,checkedAt:'2035-01-01T00:00:00Z'}}),row({applicationsOpenISO:'2030-09-07'}),upcoming({applicationsOpenISO:'2031-02-01',startDateISO:'2031-01-01'}),upcoming({applicationsOpenISO:'2030-12-01',deadlineISO:'2030-11-30'})];
 for(const job of cases)assert.deepEqual(I.jobs(feed([job]),NOW),[],JSON.stringify(job));
 assert.equal(I.applicationState(row({link:'javascript:alert(1)'}),NOW),'needs_recheck');
});
test('upcoming admission cannot be inferred from a recognizable employer or absent Apply form',()=>{
 for(const missing of ['sourceAnnounced','upcomingApproved','sourceUrl']){
  const job=upcoming({co:'Google'});delete job.verification[missing];assert.deepEqual(I.jobs(feed([job]),NOW),[]);
 }
 assert.deepEqual(I.jobs(feed([row({duties:[]})]),NOW),[]);
 assert.deepEqual(I.jobs(feed([row({duties:['one','two','three','four']})]),NOW),[]);
});
test('pay display preserves cents, periods, ranges, currency and employer qualifiers',()=>{
 const examples=[['USD 22.50/hour','hour','$22.50/hour'],['22.50 USD/hour','hour','$22.50/hour'],['$22.50 USD/hour','hour','$22.50/hour'],['$29.25-$50.75 USD/hour','hour','$29.25-50.75/hour'],['USD $29.25 to USD $50.75 per hour','hour','$29.25 to 50.75 per hour'],['$8,500/month (estimated)','month','$8,500/month (estimated)'],['$8,500 (estimated)','month','$8,500/month (estimated)'],['$9,000 for 9 weeks','program','$9,000 for 9 weeks'],['$22.50','hour','$22.50/hour'],['$95,000','annualized_year','$95,000/year (annualized)'],['$500','not_listed','$500 (time unit not listed)'],['$25/hour undergraduate; $35/hour graduate','hour','$25/hour undergraduate; $35/hour graduate']];
 for(const [pay,payBasis,expected] of examples)assert.equal(I.payLabel(row({pay,payBasis})),expected);
 assert.equal(I.payLabel(row({pay:'$4,500 program stipend',payBasis:'program'})),'$4,500 program stipend');
 assert.equal(I.payLabel(row({pay:'Paid; amount not disclosed',payBasis:'not_listed'})),'Paid; amount not disclosed');
 assert.equal(I.jobs(feed([row({pay:'Paid; amount not disclosed',payBasis:'not_listed'})]),NOW).length,1);
});
test('contradictory pay units and states are held rather than annualized or rewritten',()=>{
 assert.deepEqual(I.jobs(feed([row({pay:'$60/month',payBasis:'hour'})]),NOW),[]);
 assert.deepEqual(I.jobs(feed([row({pay:'$9,000 for 9 weeks',payBasis:'week'})]),NOW),[]);
 assert.throws(()=>P.projectRow(operational({'Pay Status':'Unpaid'}),admission(),{now:NOW}),/Contradictory pay status/);
 assert.throws(()=>P.projectRow(operational({'Pay Status':'Not disclosed'}),admission(),{now:NOW}),/Contradictory pay status/);
});
test('unpaid never implies credit; credit display retains conditional evidence',()=>{
 for(const collegeCredit of ['not_listed','not_offered'])assert.equal(I.payLabel(row({pay:'Unpaid',payStatus:'unpaid',collegeCredit})),'Unpaid');
 for(const collegeCredit of ['required','available','school_approval_required'])assert.equal(I.payLabel(row({pay:'Unpaid',payStatus:'unpaid',collegeCredit})),'Unpaid · College credit');
 const r=operational({Salary:'Unpaid','Pay Status':'Unpaid','Pay Basis':'not listed','College Credit':'School approval required'});
 assert.throws(()=>P.projectRow(r,admission(),{now:NOW}),/credit evidence/);
 const result=P.projectRow(r,admission({creditEvidence:'Employer requires school approval for credit.'}),{now:NOW});
 assert.equal(result.collegeCredit,'school_approval_required');assert.equal(result.payStatus,'unpaid');
});
test('unsafe links, unbounded fields and wrong primitive types do not enter the public projection',()=>{
 for(const link of ['javascript:alert(1)','https://user:password@example.org','https://127.0.0.1/job','https://example.org/job?access_token=private','https://example.org/job?api_key=private','https://[::1]/job','https://example.org/job\nprivate-note'])assert.deepEqual(I.jobs(feed([row({link})]),NOW),[]);
 for(const changes of [{co:'x'.repeat(201)},{co:{}},{duties:[{}]},{eligibilityFlags:[12]},{verification:{...row().verification,reviewerType:{private:'note'}}}])assert.deepEqual(I.jobs(feed([row(changes)]),NOW),[]);
});
test('canonical duplicate aliases fail the v2 batch while distinct requisitions remain distinct',()=>{
 assert.throws(()=>I.jobs(feed([row(),row({link:row().link+'?utm_source=fixture'})]),NOW),/Duplicate internship identity/);
 assert.equal(I.jobs(feed([row(),row({link:row().link.replace('12345','54321')})]),NOW).length,2);
 assert.equal(I.jobs(feed([row(),row({link:row().link.replace('/example/','/another/')})]),NOW).length,2);
});
test('projection requires explicit source-bound publication approval and holds legacy blanks',()=>{
 for(const a of [null,admission({publicationApproved:false}),admission({officialSourceChecked:false}),admission({sourceLink:'https://other.example/job'})])assert.throws(()=>P.projectRow(operational(),a,{now:NOW}));
 assert.throws(()=>P.projectRow(operational({'Application Status':''}),admission(),{now:NOW}),/not admitted/);
 assert.throws(()=>P.projectRow(operational({'Active/Dead':'Dead'}),admission(),{now:NOW}),/Closed operational/);
 const result=P.projectRow(operational({Salary:'Paid; amount not disclosed','Pay Basis':'not listed'}),admission(),{now:NOW});
 assert.equal(result.payStatus,'paid');assert.equal(result.pay,'Paid; amount not disclosed');
});
test('private golden notes, reviewer IDs, timing quotes and brand rationales never appear in output',()=>{
 const r=operational({'Application Status':'Upcoming','Applications Open':'Fall 2030','TL;DR':'','Timing Source':'https://example.org/internships\nPRIVATE_TIMING_QUOTE','Upcoming Brand Basis':'PRIVATE_BRAND_BASIS','Human Notes':'PRIVATE_GOLDEN_NOTE','Astra Review Rationale':'PRIVATE_RATIONALE',caseId:'PRIVATE_CASE_ID'});
 const a=admission({applicationStatus:'upcoming',sourceAnnounced:true,cohortEvidence:'PRIVATE_COHORT_EVIDENCE',announcementEvidence:'PRIVATE_ANNOUNCEMENT',brandApproval:{basis:'PRIVATE_BRAND_BASIS',reference:'PRIVATE_APPROVAL_REF'},humanReview:{decision:'approved',reviewer:'PRIVATE_REVIEWER',reference:'PRIVATE_REVIEW_REF',checkedAt:'2030-09-06T14:00:00Z'}});
 const out=P.projectRow(r,a,{now:NOW});assert.equal(out.applicationStatus,'upcoming');assert.deepEqual(out.duties,[]);
 assert.equal(out.verification.reviewerType,'human');assert.equal(out.verification.humanVerifiedAt,a.humanReview.checkedAt);
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE_|Human Notes|Astra|caseId|reviewer"|reference"/);
 const consumer=I.jobs(feed([{...row(),privateNotes:'PRIVATE',verification:{...row().verification,reviewerId:'PRIVATE'}}]),NOW);
 assert.doesNotMatch(JSON.stringify(consumer),/PRIVATE|privateNotes|reviewerId/);
});
test('upcoming projection demands a specific announced cohort and recorded brand exception',()=>{
 const r=operational({Company:'Google','Application Status':'Upcoming','Upcoming Brand Basis':'source-backed recognition','Applications Open':'Not announced'});
 const a=admission({applicationStatus:'upcoming',sourceAnnounced:true,cohortEvidence:'Official future cohort',announcementEvidence:'Applications will open for this cohort',brandApproval:{basis:'source-backed recognition',reference:'owner-approval'}});
 assert.equal(P.projectRow(r,a,{now:NOW}).applicationsOpen,'Not announced');
 for(const k of ['sourceAnnounced','cohortEvidence','announcementEvidence','brandApproval']){const missing={...a};delete missing[k];assert.throws(()=>P.projectRow(r,missing,{now:NOW}),/Upcoming needs/);}
});
test('timing source must match the exact official URL rather than a prefix or ignored Z field',()=>{
 assert.throws(()=>P.projectRow(operational({'Timing Source':'https://example.org/internships-other'}),admission(),{now:NOW}),/Timing source receipt mismatch/);
 assert.throws(()=>P.projectRow(operational({'Timing Source':''}),admission(),{now:NOW}),/Timing source receipt mismatch/);
 assert.equal(P.projectRow(operational(),admission(),{now:NOW}).timingSourceUrl,'https://example.org/internships');
});
test('header-name mapping supports reordered columns and rejects case-insensitive duplicate headers',()=>{
 const r=operational(),normal=P.projectFeed(table(r),[admission()],{now:NOW});
 const reversed=P.HEADERS.slice().reverse();assert.deepEqual(P.projectFeed(table(r,reversed),[admission()],{now:NOW}),normal);
 const headers=P.HEADERS.concat(' company ');assert.throws(()=>P.projectFeed(table(r,headers),[admission()],{now:NOW}),/header contract mismatch/);
 const missing=P.HEADERS.filter(h=>h!=='Pay Basis');assert.throws(()=>P.projectFeed(table(r,missing),[admission()],{now:NOW}),/header contract mismatch/);
 const extras=P.HEADERS.concat('Private Notes'),extraRecord={...r,'Private Notes':'PRIVATE_EXTRA'};
 assert.doesNotMatch(JSON.stringify(P.projectFeed(table(extraRecord,extras),[admission()],{now:NOW})),/PRIVATE_EXTRA|Private Notes/);
});
test('partial source dates are retained without invented machine dates and projection is side-effect free',()=>{
 const r=operational({'Start Date':'Winter 2031','Application Deadline':'Rolling'}),a=admission(),before=JSON.stringify([r,a]);
 const out=P.projectRow(r,a,{now:NOW});assert.equal(out.startDate,'Winter 2031');assert.equal(out.startDateISO,undefined);assert.equal(out.deadlineISO,undefined);
 assert.equal(JSON.stringify([r,a]),before);
 const empty=P.projectFeed({schemaVersion:2,headers:P.HEADERS,rows:[]},[],{now:NOW});assert.equal(empty.status,'awaiting_verification');assert.deepEqual(empty.jobs,[]);
});
