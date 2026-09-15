/* Calendar filters and private, device-local browsing history. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SUBoardExperience = api;
})(typeof window !== 'undefined' ? window : {}, function (root) {
  'use strict';
  var DAY = 86400000, LIMIT = 100, RETENTION = 30 * DAY;
  function senior(title) { return /\b(?:senior|sr)\b/i.test(String(title || '')); }
  function annualRange(pay) {
    var text = String(pay || '').replace(/,/g, '');
    // Do not silently annualize an hourly, monthly or project rate.
    if (/\b(?:hour|hourly|hr|week|weekly|month|monthly|day|daily|project|program|stipend)\b|\/\s*h\b/i.test(text)) return null;
    var tokens = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g));
    if (!tokens.length) return null;
    var hasK = tokens.some(function (m) { return !!m[2]; });
    var numbers = tokens.map(function (m) { var n = Number(m[1]); return n * (m[2] || hasK && n < 1000 ? 1000 : 1); }).filter(function (n) { return n >= 1000; });
    if (!numbers.length) return null;
    var min = Math.min.apply(null, numbers), max = Math.max.apply(null, numbers);
    if (numbers.length === 1 && /\+/.test(text)) max = Infinity;
    return { min:min, max:max };
  }
  function salaryMatches(pay, min, max) {
    if (!(min > 0) && !(max > 0)) return true;
    var range = annualRange(pay);
    return !!range && range.max >= (min || 0) && range.min <= (max || Infinity);
  }
  function dayKey(date) {
    var parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date || new Date());
    function part(type) { return parts.find(function (p) { return p.type === type; }).value; }
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function addedDay(value) {
    var text = String(value || '').trim(), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) { var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text); if (us) m = [text, us[3], us[1].padStart(2,'0'), us[2].padStart(2,'0')]; }
    if (m) { var iso = m[1]+'-'+m[2]+'-'+m[3], date = new Date(iso+'T12:00:00Z');return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso ? iso : ''; }
    // Timestamp sources are converted to the board's calendar timezone.
    if (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text))) return dayKey(new Date(text));
    return '';
  }
  function recentDay(jobs, now) {
    var today = dayKey(now), days = jobs.map(function(j){return addedDay(j.added);}).filter(function(d){return d && d <= today;});
    return days.indexOf(today) >= 0 ? today : days.sort().pop() || '';
  }
  function shuffled(items, seed) {
    var result = items.slice(), value = (Number(seed) >>> 0) || 1;
    function random() { value ^= value << 13;value ^= value >>> 17;value ^= value << 5;return (value >>> 0) / 4294967296; }
    for (var i=result.length-1;i>0;i--) { var k=Math.floor(random()*(i+1)), item=result[i];result[i]=result[k];result[k]=item; }
    return result;
  }
  function employer(job) { return String(job.co || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\b(?:incorporated|corporation|inc|corp|llc|ltd)\b/g,'').trim().replace(/\s+/g,' '); }
  function spaced(items, constrained) {
    var pending=items.slice(), result=[], last=new Map();
    while(pending.length) {
      var counts=new Map();pending.forEach(function(j){var key=employer(j);counts.set(key,(counts.get(key)||0)+1);});
      var index=-1,biggest=0;
      pending.forEach(function(j,i){
        var key=employer(j),at=last.get(key),count=counts.get(key);
        if(at!==undefined&&result.length-at<=4)return;
        if(constrained){if(count>biggest){index=i;biggest=count;}return;}
        if(index>=0)return;
        var left=pending.length-1,peak=0,tied=0,possible=true;
        counts.forEach(function(n,company){
          n-=company===key?1:0;if(!n)return;
          if(n>peak){peak=n;tied=1;}else if(n===peak)tied++;
          var previous=company===key?result.length:last.get(company);
          var wait=previous===undefined?0:Math.max(0,previous+5-(result.length+1));
          if(wait+(n-1)*5+1>left)possible=false;
        });
        if(peak&&(peak-1)*5+tied>left)possible=false;
        if(possible)index=i;
      });
      if(index<0)index=pending.findIndex(function(j){var at=last.get(employer(j));return at===undefined||result.length-at>4;});
      if(index<0){var oldest=Infinity;pending.forEach(function(j,i){var at=last.get(employer(j));if(at<oldest){oldest=at;index=i;}});}
      var next=pending.splice(Math.max(0,index),1)[0];last.set(employer(next),result.length);result.push(next);
    }
    // Preserve the incoming shuffle/rank whenever feasible. If the greedy
    // look-ahead stranded a repeat, retry the standard frequency scheduler.
    if(!constrained&&result.some(function(j,i){return result.slice(Math.max(0,i-4),i).some(function(before){return employer(before)===employer(j);});})){
      var alternative=spaced(items,true);
      function repeats(list){return list.reduce(function(n,j,i){return n+Number(list.slice(Math.max(0,i-4),i).some(function(before){return employer(before)===employer(j);}));},0);}
      if(repeats(alternative)<repeats(result))return alternative;
    }
    return result;
  }

  function owner() {
    try {
      var store=root.SUStore;
      if(store && ((store.current&&!store.current())||(store.ownershipCurrent&&!store.ownershipCurrent())))return null;
      return store ? store.owner() || 'guest' : root.localStorage.getItem('su_sync_owner') || 'guest';
    } catch (_) { return null; }
  }
  function identity(link) { try { var api=root.SUJobIdentity;return api && api.keys ? api.keys(link)[0] : new URL(link).href; } catch (_) { return ''; } }
  function storageKey(kind) { var who=owner();return who ? 'su_browse_'+kind+'_'+who : null; }
  function read(kind, storage) { try { var key=storageKey(kind), data=key&&JSON.parse(storage.getItem(key)||'[]');return Array.isArray(data)?data:[]; } catch (_) { return []; } }
  function history() { return read('history',root.localStorage).filter(function(item){return item && item.at > Date.now()-RETENTION && item.at<=Date.now()+60000 && identity(item.link);}).slice(0,LIMIT); }
  function record(job, action) {
    if(!job || !identity(job.link) || ['viewed','applied','dismissed','unavailable','saved','not_fit'].indexOf(action)<0)return false;
    var key=storageKey('history');if(!key)return false;
    var id=identity(job.link), items=history(), old=items.find(function(i){return identity(i.link)===id;});
    var entry={link:job.link,co:String(job.co||'').slice(0,200),role:String(job.role||'').slice(0,300),internship:!!job.internship,at:Date.now(),action:action==='viewed'&&old&&old.action!=='viewed'?old.action:action};
    items=items.filter(function(i){return identity(i.link)!==id;});items.unshift(entry);
    try { root.localStorage.setItem(key,JSON.stringify(items.slice(0,LIMIT)));return true; } catch(_){return false;}
  }
  function demotions() { return read('visit',root.sessionStorage).filter(function(v){return typeof v==='string';}); }
  function dismiss(job) {
    record(job,'dismissed');var id=identity(job.link), key=storageKey('visit');if(!id||!key)return;
    var ids=demotions().filter(function(v){return v!==id;});ids.push(id);
    try{root.sessionStorage.setItem(key,JSON.stringify(ids.slice(-LIMIT)));}catch(_){}
  }
  function clearHistory() { try {var key=storageKey('history');if(key)root.localStorage.removeItem(key);}catch(_){} }
  return {senior:senior,annualRange:annualRange,salaryMatches:salaryMatches,dayKey:dayKey,addedDay:addedDay,recentDay:recentDay,shuffled:shuffled,employer:employer,spaced:spaced,history:history,record:record,dismiss:dismiss,demotions:demotions,clearHistory:clearHistory,identity:identity};
});
