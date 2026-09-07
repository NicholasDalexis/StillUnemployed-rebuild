'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const I=require('../../js/internships.js');
const sourceFeed=require('../../internships-data.json');
const displayCopy=require('../../netlify/functions/lib/internship-display.json');
const feed={...sourceFeed,jobs:sourceFeed.jobs.map(job=>I.withPresentation(job,displayCopy[job.link]))};
const words=value=>value.trim().split(/\s+/).length;

test('all admitted internship records have four concise display bullets without changing full employer facts',()=>{
  const before=JSON.stringify(feed);
  for(const job of feed.jobs){
    const bullets=I.detailBullets(job),location=I.locationLabel(job);
    assert.equal(bullets.length,4,job.co+' / '+job.role);
    assert(bullets.slice(0,3).every(bullet=>words(bullet)<=10),job.co+' duties stay concise');
    assert(words(bullets[3])<=20,job.co+' program detail stays concise');
    assert(location.length>0&&location.length<70,job.co+' has a compact location');
    assert.doesNotMatch(location,/\b(?:USA|United States|US)\b|\b(?:body|header|confirm|review)\b/i);
    assert.doesNotMatch(bullets.join(' '),/\b(?:onsite|on-site|hybrid|Tue|Wed|Thu|three days? (?:per|a) week)\b/i);
    assert(!bullets.join(' ').includes(job.eligibility),'the full eligibility record is not a display paragraph');
  }
  assert.equal(JSON.stringify(feed),before,'all complete source records remain unchanged');
});

test('presentation summaries retain critical admitted program conditions and unknown locations without inventing them',()=>{
  const select=(company,role='')=>{const job=feed.jobs.find(job=>job.co.includes(company)&&job.role.includes(role));assert(job,company);return job;};
  assert.match(I.detailBullets(select('WEBTOON')).at(-1),/20–29 hours\/week.*graduates preferred, not required/i);
  assert.match(I.detailBullets(select('Too Lost')).at(-1),/college[- ]credit (?:eligibility )?required/i);
  assert.equal(I.locationLabel(select('Henkel')),'Location not listed');
  assert.equal(I.locationLabel(select('Adobe')),'Multiple locations');
  assert.match(I.detailBullets(select('Figma')).at(-1),/January 4|Jan(?:uary)?\.? 4/);
});

test('a fresh liveness timestamp alone retains the reviewed summary, while changed source facts invalidate it',()=>{
  const source=feed.jobs[0],before=JSON.stringify(source),short=I.detailBullets(source);
  const rechecked=structuredClone(source);rechecked.verification.checkedAt='2030-09-06T15:00:00Z';
  assert.deepEqual(I.detailBullets(rechecked),short);
  rechecked.eligibility='Changed requirements';
  assert.equal(I.locationLabel(rechecked),I.locationLabel(source),'unrelated source edits retain the reviewed location abbreviation');
  for(const field of ['role','loc','eligibility','cycle','startDate','deadline','applicationsOpen','applicationStatus','collegeCredit']){
    const changed=structuredClone(source);changed[field]='A changed source fact';
    assert.notDeepEqual(I.detailBullets(changed),short,field+' invalidates old display copy');
  }
  for(const field of ['duties','benefits']){
    const changed=structuredClone(source);changed[field]=['A changed employer fact.'];
    assert.notDeepEqual(I.detailBullets(changed),short,field+' invalidates old display copy');
  }
  assert.equal(JSON.stringify(source),before);
});

test('future-row fallbacks remove operational location annotations and do not invent dates or partial duty claims',()=>{
  assert.equal(I.locationLabel({loc:'El Segundo, CA; body says hybrid, header says onsite'}),'El Segundo, CA');
  assert.equal(I.locationLabel({loc:'Chicago, IL, United States'}),'Chicago, IL');
  assert.equal(I.locationLabel({loc:'New York, NY; Atlanta, GA'}),'Multiple locations');
  assert.equal(I.locationLabel({loc:'United States'}),'Location not listed');
  assert.equal(I.locationLabel({loc:'Cincinnati, OH, US; full time'}),'Cincinnati, OH');
  assert.equal(I.locationLabel({loc:'United States (remote)'}),'Remote');
  assert.equal(I.locationLabel({loc:'San Francisco, CA or New York, NY; hub based'}),'Multiple locations');
  const job={link:'https://example.org/new-internship',loc:'Remote, US',duties:['A very long source duty without a safe sentence boundary '.repeat(8)],startDate:'Not listed',cycle:'Unknown',applicationStatus:'open'};
  const bullets=I.detailBullets(job);
  assert.equal(bullets[0],'See the employer’s full role description.');
  assert.equal(bullets.at(-1),'See the employer for program dates and eligibility.');
  assert.doesNotMatch(bullets.join(' '),/Starts Not listed|Unknown/);
  job.applicationStatus='upcoming';job.applicationsOpen='Fall 2030';
  assert.match(I.detailBullets(job).at(-1),/Applications open Fall 2030/);
  job.collegeCredit='required';assert.match(I.detailBullets(job).at(-1),/college credit required/);
});

test('changing a returned bullet array cannot corrupt another visitor’s presentation or public records',()=>{
  const source=feed.jobs[0],original=I.detailBullets(source),changed=I.detailBullets(source);
  changed[0]='Corrupted display';changed.push('Unreviewed extra');
  assert.deepEqual(I.detailBullets(source),original);
  const publicRecord=I.publicJob(source);
  assert.equal(publicRecord.eligibility,source.eligibility);assert.deepEqual(publicRecord.duties,source.duties);
  assert.equal(publicRecord.sourceKey,undefined);assert.equal(publicRecord.detailBullets,undefined);
});

test('presentation is allowed through the public contract only when it matches the exact source facts',()=>{
  const source=sourceFeed.jobs[0],copy=displayCopy[source.link],decorated=I.withPresentation(source,copy);
  assert.deepEqual(I.publicJob(decorated).presentation,copy);
  const now=Date.parse(source.verification.checkedAt);
  assert.equal(I.jobs({schemaVersion:2,status:'verified',jobs:[decorated]},now)[0].presentation.locationLabel,copy.locationLabel);
  for(const invalid of [{...copy,sourceKey:'wrong-source'}, {...copy,locationLabel:''}, {...copy,detailBullets:['Only one bullet']}, {...copy,detailBullets:[...copy.detailBullets,'Fifth bullet']}]){
    assert.equal(I.withPresentation(source,invalid).presentation,undefined);
    assert.equal(I.publicJob({...source,presentation:invalid}).presentation,undefined);
  }
});
