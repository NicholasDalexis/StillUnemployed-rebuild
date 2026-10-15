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
  function facts(job,now){
    job=job||{};now=now===undefined?Date.now():Number(now);
    var raw=String(job.deadlineISO||'').trim(),text=String(job.deadline||'').trim(),tz=String(job.deadlineTimezone||'').trim();
    // A complete ISO date in the display cell is also unambiguous. Never guess
    // a year for partial prose or infer a time from the Sheet's locale/timezone.
    if(!raw&&calendar(text))raw=text;
    if(!raw)return {state:'unspecified',label:/^(?:not listed|not stated|unknown|not announced)$/i.test(text)?'':text};
    if(!Number.isFinite(now))return {state:'unknown',label:text||raw};
    if(calendar(raw)){
      var resolved=tz?zone(tz):DEFAULT_ZONE;
      if(!resolved)return {state:'unknown',label:text||raw};
      return {state:day(now,resolved)>raw?'expired':'open',label:(text||raw)+' · through 11:59 PM '+(tz?resolved:'Eastern (board default)'),timezone:resolved,defaultTimezone:!tz};
    }
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)&&calendar(raw.slice(0,10))&&Number.isFinite(Date.parse(raw))&&+raw.slice(11,13)<24&&+raw.slice(14,16)<60){
      var suffix=raw.endsWith('Z')?'UTC':'UTC'+raw.slice(-6);
      return {state:now>=Date.parse(raw)?'expired':'open',label:(text||raw)+' · '+suffix,instant:Date.parse(raw)};
    }
    return {state:'unknown',label:text||raw};
  }
  function accepting(job,now){return !/^(?:paused|on hold|hiring paused|closed|expired|dead|inactive|no)$/i.test(String(job&&job.applicationStatus||'').trim())&&['expired','unknown'].indexOf(facts(job,now).state)<0;}
  return {facts:facts,accepting:accepting,calendar:calendar,day:day,defaultTimezone:DEFAULT_ZONE};
});
