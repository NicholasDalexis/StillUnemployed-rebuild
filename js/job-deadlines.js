/* Source deadline semantics shared by browser/build/server. No retirement writes.
 * Date-only closes after the complete calendar day; explicit offset/time wins.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SUJobDeadlines=api;})(typeof window==='undefined'?this:window,function(){
  'use strict';
  var DEFAULT_ZONE='America/New_York';
  function calendar(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    var d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function zone(value){try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(0);return value;}catch(_){return null;}}
  function day(now,tz){var p=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));return ['year','month','day'].map(function(k){return p.find(function(v){return v.type===k;}).value;}).join('-');}
  function wallInstant(date,hour,minute,tz){
    if(!zone(tz))return NaN;
    var wall=Date.parse(date+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00Z');
    var format=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    function local(value){var parts=format.formatToParts(new Date(value)),n=function(k){return +parts.find(function(p){return p.type===k;}).value;};return Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'));}
    var candidate=wall;
    for(var i=0;i<3;i++)candidate=wall-(local(candidate)-candidate);
    // A missing or repeated DST wall time needs an explicit employer offset.
    if(local(candidate)!==wall||local(candidate-3600000)===wall||local(candidate+3600000)===wall)return NaN;
    return candidate;
  }
  function writtenDeadline(text,tz){
    // Only one complete, literal deadline. Do not infer a year, cohort,
    // anticipated posting duration, or a deadline from an ongoing-application note.
    var m=text.match(/^(?:(?:apply\s+(?:by|before)|deadline:?)\s*)?(January|Jan\.?|February|Feb\.?|March|Mar\.?|April|Apr\.?|May|June|Jun\.?|July|Jul\.?|August|Aug\.?|September|Sept?\.?|October|Oct\.?|November|Nov\.?|December|Dec\.?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{4})(?:\s*(?:,|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(PT|PST|PDT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|UTC|GMT)?)?(?:\s*\(employer wording\))?(?:;\s*rolling review)?\.?$/i);
    if(!m)return null;
    var months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],date=m[3]+'-'+String(months.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')+'-'+m[2].padStart(2,'0');
    if(!calendar(date))return {invalid:true};
    if(!m[4])return {value:date};
    var h=+m[4],minute=+(m[5]||0);if(h<1||h>12||minute>59)return {invalid:true};
    h=h%12+(m[6].toUpperCase()==='PM'?12:0);
    var abbreviation=(m[7]||'').toUpperCase(),offsets={PST:-480,PDT:-420,EST:-300,EDT:-240,CST:-360,CDT:-300,MST:-420,MDT:-360,UTC:0,GMT:0};
    var zones={PT:'America/Los_Angeles',ET:'America/New_York',CT:'America/Chicago',MT:'America/Denver'},resolved=zones[abbreviation]||tz||DEFAULT_ZONE;
    var instant=Object.prototype.hasOwnProperty.call(offsets,abbreviation)?Date.parse(date+'T'+String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00Z')-offsets[abbreviation]*60000:wallInstant(date,h,minute,resolved);
    return Number.isFinite(instant)?{value:new Date(instant).toISOString(),zoneNote:abbreviation|| (tz?resolved:'Eastern (board default)')}:{invalid:true};
  }
  function facts(job,now){
    job=job||{};now=now===undefined?Date.now():Number(now);
    var raw=String(job.deadlineISO||'').trim(),text=String(job.deadline||'').trim(),tz=String(job.deadlineTimezone||'').trim();
    // A complete ISO date in the display cell is also unambiguous. Never guess
    // a year for partial prose or infer a time from the Sheet's locale/timezone.
    if(!raw&&calendar(text))raw=text;
    var written=!raw?writtenDeadline(text,tz):null;
    if(written&&written.invalid)return {state:'unknown',label:text};
    if(written)raw=written.value;
    if(!raw)return {state:'unspecified',label:/^(?:not listed|not stated|unknown|not announced)$/i.test(text)?'':text};
    if(!Number.isFinite(now))return {state:'unknown',label:text||raw};
    if(calendar(raw)){
      var resolved=tz?zone(tz):DEFAULT_ZONE;
      if(!resolved)return {state:'unknown',label:text||raw};
      return {state:day(now,resolved)>raw?'expired':'open',label:(text||raw)+' · through 11:59 PM '+(tz?resolved:'Eastern (board default)'),timezone:resolved,defaultTimezone:!tz};
    }
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)&&calendar(raw.slice(0,10))&&Number.isFinite(Date.parse(raw))&&+raw.slice(11,13)<24&&+raw.slice(14,16)<60){
      var suffix=written&&written.zoneNote|| (raw.endsWith('Z')?'UTC':'UTC'+raw.slice(-6));
      return {state:now>=Date.parse(raw)?'expired':'open',label:(text||raw)+' · '+suffix,instant:Date.parse(raw)};
    }
    return {state:'unknown',label:text||raw};
  }
  // Presentation only: the known Sony evidence note duplicates an explicit EST
  // cutoff. Remove it only when the written cutoff and machine offset agree.
  // Keep source fields, expiry semantics and every other condition unchanged.
  function displayLabel(job,label){
    label=String(label||'');
    var source=String(job&&job.deadline||'').trim(),marker=' (employer API explicit -05:00 offset)';
    if(!source.endsWith(marker))return label;
    var visible=source.slice(0,-marker.length),raw=String(job.deadlineISO||''),written=writtenDeadline(visible,job.deadlineTimezone);
    if(!/\bEST$/.test(visible)||!raw.endsWith('-05:00')||!written||written.invalid||!Number.isFinite(Date.parse(raw))||Date.parse(written.value)!==Date.parse(raw))return label;
    return label===source||label===source+' · UTC-05:00'?visible:label;
  }
  function accepting(job,now){return !/^(?:paused|on hold|hiring paused|closed|expired|dead|inactive|no)$/i.test(String(job&&job.applicationStatus||'').trim())&&['expired','unknown'].indexOf(facts(job,now).state)<0;}
  // Current discovery excludes elapsed deadlines. Raw snapshots and saved
  // history remain readable and never become proof of employer closure.
  function current(jobs,now){return jobs.filter(function(job){return facts(job,now).state!=='expired';});}
  return {facts:facts,displayLabel:displayLabel,accepting:accepting,current:current,calendar:calendar,day:day,defaultTimezone:DEFAULT_ZONE};
});
