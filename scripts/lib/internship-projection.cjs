'use strict';
// Pure offline projection. Caller verifies native headers and real source receipts.
// No Sheet fetch, source research, file write, scheduling or publication occurs here.
const I=require('../../js/internships.js');
const HEADERS=['Company','Job Title','Link','Location','Type','Salary','Years of Experience','Category','Description','Pick','Active/Dead','Date Added','Dead Date','TL;DR','Date Posted','Cycle','Eligibility Flags','College Credit','Pay Basis','Pay Status','Benefits','Application Status','Applications Open','Start Date','Application Deadline','Timing Source','Upcoming Brand Basis'];
const credits={'Required':'required','Available':'available','School approval required':'school_approval_required','Not offered':'not_offered','Not listed':'not_listed'};
const bases={'hour':'hour','week':'week','month':'month','program':'program','annualized year':'annualized_year','not listed':'not_listed'};
const payStates={'Paid':'paid','Unpaid':'unpaid','Not disclosed':'not_disclosed'};
const applicationStates={'Open':'open','Upcoming':'upcoming','Closed':'closed','Unknown':'unknown'};
function nonempty(v){return typeof v==='string'&&!!v.trim();}
function lines(value){return String(value||'').split(/\r?\n/).map(v=>v.trim().replace(/^[•*-]\s*/, '')).filter(Boolean);}
function timingMatches(value,url){
  if(!nonempty(value)||!I.safeUrl(url))return false;
  const trimmed=value.trim(),urls=I.safeUrl(trimmed)?[trimmed]:(trimmed.match(/https?:\/\/[^\s<>"']+/g)||[]).map(v=>v.replace(/[),.;]+$/,''));
  return urls.some(v=>I.safeUrl(v)&&new URL(v).href===new URL(url).href);
}
function projectRow(row,admission,options={}){
  const now=options.now===undefined?Date.now():Number(options.now);
  if(!row||!admission||admission.publicationApproved!==true||admission.officialSourceChecked!==true)throw Error('Publication admission required');
  if(!I.safeUrl(admission.sourceUrl)||!Number.isFinite(I.dateValue(admission.checkedAt,true)))throw Error('Verified source receipt required');
  if(admission.sourceLink!==row.Link)throw Error('Admission must match the source posting');
  if(!timingMatches(row['Timing Source'],admission.timingSourceUrl))throw Error('Timing source receipt mismatch');
  if(['Required','Available','School approval required'].includes(row['College Credit'])&&!nonempty(admission.creditEvidence))throw Error('Employer credit evidence required');
  const status=applicationStates[row['Application Status']];
  if(!['open','upcoming'].includes(status)||admission.applicationStatus!==status)throw Error('Application status is not admitted');
  if(row['Active/Dead']==='Dead')throw Error('Closed operational record');
  const verification={status,checkedAt:admission.checkedAt,sourceUrl:admission.sourceUrl,reviewerType:'source_check'};
  if(status==='upcoming'){
    if(admission.sourceAnnounced!==true||!nonempty(admission.cohortEvidence)||!nonempty(admission.announcementEvidence)||!admission.brandApproval||!nonempty(admission.brandApproval.basis)||!nonempty(admission.brandApproval.reference)||!nonempty(row['Upcoming Brand Basis']))throw Error('Upcoming needs current cohort evidence and explicit brand admission');
    verification.sourceAnnounced=true;verification.upcomingApproved=true;
  }
  if(admission.humanReview){
    const h=admission.humanReview;
    if(h.decision!=='approved'||!nonempty(h.reviewer)||!nonempty(h.reference)||!Number.isFinite(I.dateValue(h.checkedAt,true)))throw Error('Human provenance incomplete');
    verification.reviewerType='human';verification.humanVerifiedAt=h.checkedAt;
  }
  const rowOut={co:row.Company,role:row['Job Title'],link:row.Link,loc:row.Location,style:row.Type,ind:row.Category,desc:row.Description||'',exp:row['Years of Experience']||'See eligibility',pay:row.Salary,payStatus:payStates[row['Pay Status']],payBasis:bases[row['Pay Basis']],collegeCredit:credits[row['College Credit']],eligibility:row['Eligibility Flags'],eligibilityFlags:lines(row['Eligibility Flags']),duties:lines(row['TL;DR']),benefits:lines(row.Benefits),cycle:row.Cycle||'Not listed',applicationStatus:status,applicationsOpen:row['Applications Open']||'Not announced',startDate:row['Start Date']||'Not listed',deadline:row['Application Deadline']||'Not listed',timingSourceUrl:admission.timingSourceUrl,verification};
  // Partial dates remain display text. Only separately verified exact dates are machine-readable.
  ['applicationsOpenISO','startDateISO','deadlineISO'].forEach(k=>{if(admission[k]!==undefined)rowOut[k]=admission[k];});
  if(rowOut.payStatus==='not_disclosed'){
    if(rowOut.pay&&!['Not disclosed','Pay not disclosed'].includes(rowOut.pay))throw Error('Contradictory pay status');
    rowOut.pay='Pay not disclosed';
  }
  if(rowOut.payStatus==='unpaid'){
    if(rowOut.pay&&rowOut.pay!=='Unpaid')throw Error('Contradictory pay status');
    rowOut.pay='Unpaid';
  }
  const validated=I.jobs({schemaVersion:2,status:'verified',jobs:[rowOut]},now);
  if(validated.length!==1)throw Error('Public internship validation failed');
  return I.publicJob(validated[0]);
}
function projectFeed(source,admissions,options={}){
  if(!source||source.schemaVersion!==2||!Array.isArray(source.headers)||!Array.isArray(source.rows))throw Error('Versioned source table required');
  const headers=source.headers.map(h=>String(h).trim());
  const normalized=headers.map(h=>h.toLowerCase());
  if(new Set(normalized).size!==normalized.length||HEADERS.some(h=>!normalized.includes(h.toLowerCase())))throw Error('Operational header contract mismatch');
  if(!Array.isArray(admissions)||admissions.length!==source.rows.length)throw Error('One explicit admission per row required');
  const rows=source.rows.map((values,index)=>{
    if(!Array.isArray(values)||values.length!==headers.length)throw Error('Operational row width mismatch');
    const row={};HEADERS.forEach(name=>{row[name]=values[normalized.indexOf(name.toLowerCase())];});
    return projectRow(row,admissions[index],options);
  });
  const feed={schemaVersion:2,status:rows.length?'verified':'awaiting_verification',jobs:rows};
  if(I.jobs(feed,options.now).length!==rows.length)throw Error('Public feed validation failed');
  return feed;
}
module.exports={HEADERS,projectRow,projectFeed};
