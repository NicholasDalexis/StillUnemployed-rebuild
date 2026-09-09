/* Public internship contract. Admission evidence and reviewer identities stay private. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./job-identity.js'));
  else root.SUInternships=factory(root.SUJobIdentity);
})(typeof window!=='undefined'?window:this,function(Identity){
  'use strict';
  var PAY=['paid','unpaid','not_disclosed'];
  var BASIS=['hour','week','month','program','annualized_year','not_listed'];
  var CREDIT=['required','available','school_approval_required','not_offered','not_listed'];
  var TEXT={co:200,role:300,link:2000,loc:500,ind:100,desc:12000,pay:600,style:100,exp:500,state:500,eligibility:8000,cycle:500,deadline:500,applicationsOpen:500,startDate:500,timingSourceUrl:2000};
  var DATES=['deadlineISO','applicationsOpenISO','startDateISO'];
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function text(v,max,required){return typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&(!required||!!v.trim());}
  function list(v,max,length){return Array.isArray(v)&&v.length<=max&&v.every(function(s){return text(s,length,true);});}
  function nowValue(now){return now===undefined?Date.now():now instanceof Date?now.getTime():Number(now);}
  function dateValue(value,instant){
    if(typeof value!=='string')return NaN;
    var m=value.match(/^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/);
    if(!m||(instant&&!m[4]))return NaN;
    var calendar=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    if(calendar.getUTCFullYear()!==+m[1]||calendar.getUTCMonth()!==+m[2]-1||calendar.getUTCDate()!==+m[3])return NaN;
    if(m[4]&&(+value.slice(11,13)>23||+value.slice(14,16)>59||+value.slice(17,19)>59))return NaN;
    return Date.parse(value);
  }
  function safeUrl(value){
    if(!text(value,2000,true)||/\s/.test(value))return false;
    try{
      var u=new URL(value),host=u.hostname.toLowerCase();
      if(!/^https?:$/.test(u.protocol)||u.username||u.password||!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))return false;
      if(/^(?:127|10|0)\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)||host.charAt(0)==='[')return false;
      var bad=false;u.searchParams.forEach(function(_,k){if(/^(?:access_token|id_token|refresh_token|token|authorization|api_key|apikey|secret|password|signature)$/i.test(k))bad=true;});
      return !bad;
    }catch(e){return false;}
  }
  function knownDatePassed(value,now,opening){
    if(!value)return false;
    if(value.length===10){var today=new Date(now).toISOString().slice(0,10);return opening?value<=today:value<today;}
    return dateValue(value)<=now;
  }
  function stateOf(job){return job.applicationStatus||((job.verification||{}).status==='open'?'open':'unknown');}
  function applicationState(job,now){
    now=nowValue(now);if(!Number.isFinite(now)||!object(job)||!safeUrl(job.link))return 'needs_recheck';
    var status=stateOf(job),v=job.verification||{};
    if(!['open','upcoming'].includes(status)||v.status!==status||!Number.isFinite(dateValue(v.checkedAt))||dateValue(v.checkedAt)>now+300000)return 'needs_recheck';
    if(DATES.some(function(k){return job[k]&&!Number.isFinite(dateValue(job[k]));}))return 'needs_recheck';
    if(knownDatePassed(job.deadlineISO,now,false))return 'needs_recheck';
    if(status==='upcoming'){
      if(v.sourceAnnounced!==true||v.upcomingApproved!==true||!safeUrl(v.sourceUrl)||!safeUrl(job.timingSourceUrl))return 'needs_recheck';
      return knownDatePassed(job.applicationsOpenISO,now,true)?'needs_recheck':'upcoming';
    }
    if(job.applicationsOpenISO&&dateValue(job.applicationsOpenISO)>now)return 'needs_recheck';
    return 'accepting';
  }
  function canApply(job,now){return applicationState(job,now)==='accepting';}
  function textPayBases(value){
    var out=[];
    if(/(?:\/\s*|\bper\s+)(?:hour|hr|h)\b|\bhourly\b/i.test(value))out.push('hour');
    if(/(?:\/\s*|\bper\s+)(?:week|wk)\b|\bweekly\b/i.test(value))out.push('week');
    if(/(?:\/\s*|\bper\s+)(?:month|mo)\b|\bmonthly\b/i.test(value))out.push('month');
    if(/(?:\/\s*|\bper\s+)(?:year|yr)\b|\bannual(?:ized|ly)?\b/i.test(value))out.push('annualized_year');
    if(/\bfor\s+(?:the\s+)?(?:\d+(?:\.\d+)?(?:\s+|[-–])(?:days?|weeks?|months?)|(?:whole\s+)?program)\b|\bprogram (?:total|stipend)\b/i.test(value))out.push('program');
    return out;
  }
  function payLabel(job){
    if(job.payStatus==='unpaid')return 'Unpaid'+(['required','available','school_approval_required'].includes(job.collegeCredit)?' · College credit':'');
    if(job.payStatus!=='paid')return 'Pay not disclosed';
    var value=typeof job.pay==='string'?job.pay.trim():'';
    if(!/\d/.test(value))return 'Paid; amount not disclosed';
    value=value.replace(/\bUSD\s*\$?\s*(?=\d)/gi,'$').replace(/(\d[\d,.]*)\s+USD\b/gi,function(match,amount,offset,whole){return whole.slice(0,offset).endsWith('$')?amount:'$'+amount;}).replace(/\bUSD\b\s*/gi,'').replace(/(\$\s*\d[\d,.]*\s*(?:-|–|—|to)\s*)\$\s*(?=\d)/gi,'$1').replace(/ {2,}/g,' ').trim();
    if(!textPayBases(value).length){
      var suffix={hour:'/hour',week:'/week',month:'/month',program:' for the program',annualized_year:'/year (annualized)'}[job.payBasis]||' (time unit not listed)';
      var qualifier=value.match(/\s+\((?:estimated|approximate(?:ly)?)[^)]*\)$/i);
      value=qualifier?value.slice(0,-qualifier[0].length)+suffix+qualifier[0]:value+suffix;
    }
    return value;
  }
  // Compact copy is presentation only. Its content checksum prevents accidental
  // reuse after source facts change; official admission remains a separate gate.
  function displayKey(job){
    var source = JSON.stringify([job.co||'',job.role||'',job.loc||'',job.eligibility||'',job.duties||[],job.benefits||[],job.cycle||'',job.startDate||'',job.deadline||'',job.applicationsOpen||'',job.applicationStatus||'',job.collegeCredit||'']);
    var first=2166136261,second=0x9e3779b9;
    for(var index=0;index<source.length;index++){
      first=Math.imul(first^source.charCodeAt(index),16777619);
      second=Math.imul(second^source.charCodeAt(index),0x85ebca6b);
    }
    return (first>>>0).toString(16)+':'+(second>>>0).toString(16);
  }
  function validatedPresentation(job,copy){
    if(!object(copy)||copy.sourceKey!==displayKey(job)||!text(copy.locationLabel,120,true)||!list(copy.detailBullets,4,240)||copy.detailBullets.length!==4)return null;
    return {sourceKey:copy.sourceKey,locationLabel:copy.locationLabel,detailBullets:copy.detailBullets.slice()};
  }
  function withPresentation(job,copy){
    var out=publicJob(job),presentation=validatedPresentation(job,copy);
    if(presentation)out.presentation=presentation;
    return out;
  }
  function displayCopy(job){return validatedPresentation(job,job.presentation);}
  function locationLabel(job){
    var copy = displayCopy(job);
    if(copy)return copy.locationLabel;
    var place = String(job.loc || '').trim();
    var locations=place.split(';').map(function(part){return part.trim();});
    if(locations.slice(1).some(function(part){return /^(?:[A-Za-z .’\'-]+,\s*[A-Z]{2}|Remote)(?:\s*,\s*(?:US|USA|United States))?$/i.test(part);}))return 'Multiple locations';
    place=locations[0].replace(/\b(?:United States(?: of America)?|USA|US)\b/ig,'').replace(/\s*,\s*$/,'').trim();
    if(!place)return 'Location not listed';
    if((place.match(/,\s*[A-Z]{2}(?=\s*(?:,|$|\bor\b))/g)||[]).length>1)return 'Multiple locations';
    if(/^\(?remote\)?$/i.test(place))return 'Remote';
    return place.replace(/\s*\([^)]*(?:review|confirm|schedule|expectation)[^)]*\)\s*/ig,'').trim();
  }
  function detailBullets(job){
    var copy = displayCopy(job);
    if(copy)return copy.detailBullets.slice();
    var bullets = (Array.isArray(job.duties) ? job.duties : []).filter(function(duty){return typeof duty === 'string' && duty.trim();}).slice(0,3).map(function(duty){
      duty = duty.trim();
      if(duty.length <= 180)return duty;
      var sentence = duty.match(/^.+?[.!?](?:\s|$)/);
      return sentence && sentence[0].trim().length <= 180 ? sentence[0].trim() : 'See the employer’s full role description.';
    }).filter(function(duty,index,all){return all.indexOf(duty)===index;});
    function fact(value){return typeof value==='string'&&value.trim().length<=80&&!/^(?:not (?:listed|announced)|unknown)$/i.test(value.trim())?value.trim():'';}
    var opening = job.applicationStatus==='upcoming' ? fact(job.applicationsOpen) : '';
    var timing = [opening && (/^applications?/i.test(opening) ? opening : 'Applications open ' + opening),fact(job.cycle),fact(job.startDate) && 'Starts ' + fact(job.startDate)].filter(Boolean);
    var final = timing.filter(function(fact,index,all){return all.indexOf(fact)===index;}).join(' · ');
    if(job.collegeCredit === 'required')final += (final ? '; ' : '') + 'college credit required';
    if(!final)final = 'See the employer for program dates and eligibility.';
    bullets.push(final);
    return bullets;
  }
  function publicJob(job){
    var out={};Object.keys(TEXT).forEach(function(k){if(typeof job[k]==='string')out[k]=job[k];});
    DATES.concat(['payStatus','payBasis','collegeCredit','applicationStatus']).forEach(function(k){if(typeof job[k]==='string')out[k]=job[k];});
    ['duties','eligibilityFlags','benefits'].forEach(function(k){if(Array.isArray(job[k]))out[k]=job[k].filter(function(v){return typeof v==='string';});});
    if(object(job.verification)){
      out.verification={};['status','checkedAt','sourceUrl','reviewerType','humanVerifiedAt'].forEach(function(k){if(typeof job.verification[k]==='string')out.verification[k]=job.verification[k];});
      ['sourceAnnounced','upcomingApproved'].forEach(function(k){if(typeof job.verification[k]==='boolean')out.verification[k]=job.verification[k];});
    }
    var presentation=validatedPresentation(job,job.presentation);
    if(presentation)out.presentation=presentation;
    return out;
  }
  function validate(job,version,now){
    if(!object(job)||!['co','role','loc','eligibility'].every(function(k){return text(job[k],TEXT[k],true);})||!safeUrl(job.link))return false;
    if(Object.keys(TEXT).some(function(k){return job[k]!==undefined&&!text(job[k],TEXT[k],false);}))return false;
    if(!object(job.verification)||!Number.isFinite(dateValue(job.verification.checkedAt,version===2))||dateValue(job.verification.checkedAt)>now+300000)return false;
    if(job.verification.sourceUrl!==undefined&&!safeUrl(job.verification.sourceUrl))return false;
    if(job.verification.reviewerType!==undefined&&!['source_check','human'].includes(job.verification.reviewerType))return false;
    if(['sourceAnnounced','upcomingApproved'].some(function(k){return job.verification[k]!==undefined&&typeof job.verification[k]!=='boolean';}))return false;
    if(!PAY.includes(job.payStatus))return false;
    if(job.payStatus==='paid'&&(!text(job.pay,600,true)||(!/\d/.test(job.pay)&&!/^Paid; amount not disclosed$/i.test(job.pay))))return false;
    if(job.payStatus==='unpaid'&&job.pay!=='Unpaid')return false;
    if(job.payStatus==='not_disclosed'&&!['Not disclosed','Pay not disclosed'].includes(job.pay))return false;
    if(DATES.some(function(k){return job[k]!==undefined&&job[k]!==''&&!Number.isFinite(dateValue(job[k]));}))return false;
    if(job.payBasis!==undefined&&!BASIS.includes(job.payBasis))return false;
    var foundBases=textPayBases(job.pay||'');
    if(job.payStatus==='paid'&&job.payBasis&&job.payBasis!=='not_listed'&&foundBases.length&&!foundBases.includes(job.payBasis))return false;
    if(job.collegeCredit!==undefined&&!CREDIT.includes(job.collegeCredit))return false;
    if(job.duties!==undefined&&!list(job.duties,3,600))return false;
    if(job.eligibilityFlags!==undefined&&!list(job.eligibilityFlags,30,1000))return false;
    if(job.benefits!==undefined&&!list(job.benefits,30,1000))return false;
    if(version===2){
      if(!['open','upcoming'].includes(job.applicationStatus)||job.verification.status!==job.applicationStatus||!safeUrl(job.verification.sourceUrl)||!safeUrl(job.timingSourceUrl))return false;
      if(!BASIS.includes(job.payBasis)||!CREDIT.includes(job.collegeCredit)||!list(job.duties,3,600)||(job.applicationStatus==='open'&&!job.duties.length)||!list(job.eligibilityFlags,30,1000)||!list(job.benefits,30,1000))return false;
      if(job.applicationStatus==='upcoming'&&(job.verification.sourceAnnounced!==true||job.verification.upcomingApproved!==true))return false;
      if(job.applicationStatus==='open'&&job.applicationsOpenISO&&dateValue(job.applicationsOpenISO)>dateValue(job.verification.checkedAt))return false;
      if(job.verification.reviewerType==='human'&&(!Number.isFinite(dateValue(job.verification.humanVerifiedAt,true))||dateValue(job.verification.humanVerifiedAt)>now+300000))return false;
    }else if(job.verification.status!=='open'||knownDatePassed(job.deadlineISO,now,false))return false;
    if(job.applicationsOpenISO&&job.deadlineISO&&dateValue(job.applicationsOpenISO)>dateValue(job.deadlineISO))return false;
    if(job.applicationsOpenISO&&job.startDateISO&&dateValue(job.applicationsOpenISO)>dateValue(job.startDateISO))return false;
    return true;
  }
  function jobs(data,now){
    now=nowValue(now);
    if(!object(data)||![1,2].includes(data.schemaVersion)||!Array.isArray(data.jobs)||!Number.isFinite(now))throw Error('Invalid internship feed');
    if(data.status==='awaiting_verification')return [];
    if(data.status!=='verified')throw Error('Internship feed not verified');
    if(!Identity||typeof Identity.keys!=='function')throw Error('Internship identity unavailable');
    var seen=new Set(),out=[];
    data.jobs.forEach(function(job){
      if(!validate(job,data.schemaVersion,now))return;
      var keys=Identity.keys(job.link);if(!keys.length)return;
      if(keys.some(function(k){return seen.has(k);})){if(data.schemaVersion===2)throw Error('Duplicate internship identity');return;}
      keys.forEach(function(k){seen.add(k);});
      var row=publicJob(job);row.internship=true;row.pick=false;row.exp=row.exp||'See eligibility';row.state=row.state||row.loc;out.push(row);
    });return out;
  }
  function counts(rows,now){var out={accepting:0,upcoming:0,needs_recheck:0,total:rows.length};rows.forEach(function(job){out[applicationState(job,now)]++;});return out;}
  // Decorative papers, never salary tiers. Assign once to the full default
  // catalog; filtering and alternate sorts must not recolor a familiar card.
  var surfaces=new Map(),surfaceMembership='',paperCycle=['high','mid','low','high','high','high','mid','high','low','high','high','mid','high','high','mid','high','low','high','mid','high'];
  function surfaceKey(job){return Identity&&Identity.keys(job&&job.link)[0]||'';}
  function setSurfaceCatalog(rows){
    var keys=(Array.isArray(rows)?rows:[]).map(surfaceKey).filter(Boolean),unique=Array.from(new Set(keys));
    var membership=JSON.stringify(unique.slice().sort());if(membership===surfaceMembership)return;
    surfaceMembership=membership;surfaces=new Map();unique.forEach(function(key,index){surfaces.set(key,paperCycle[index%paperCycle.length]);});
  }
  function cardSurface(job){var key=surfaceKey(job);if(surfaces.has(key))return surfaces.get(key);var hash=2166136261;for(var i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);return paperCycle[(hash>>>0)%paperCycle.length];}
  return {jobs:jobs,payLabel:payLabel,locationLabel:locationLabel,detailBullets:detailBullets,withPresentation:withPresentation,applicationState:applicationState,canApply:canApply,counts:counts,publicJob:publicJob,safeUrl:safeUrl,dateValue:dateValue,setSurfaceCatalog:setSurfaceCatalog,cardSurface:cardSurface};
});
