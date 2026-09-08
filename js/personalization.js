/* Shared, deterministic career-interest ranking. No browser/account data here. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SUPersonalization = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var WEIGHTS = { job_open:1, job_save:3, apply_click:4, application_reported:5 };
  var FIELDS = {
    'Social':'Marketing', 'Brand & Marketing':'Marketing', 'Content & Copy':'Marketing',
    'Growth & CRM':'Marketing', 'PR & Partnerships':'Marketing', 'Influencer':'Marketing',
    'Fashion Design':'Fashion Design', 'UX/UI Design':'Product Design',
    'Photography':'Photography', 'Videography':'Video', 'Video & Creative':'Creative',
    'Creative Tech':'Creative Technology', 'Web Development':'Web Development',
    'Artificial Intelligence':'Artificial Intelligence'
  };
  function classify(job) {
    var category = job.ind || job.category || '';
    var role = category === 'Social' ? 'Social Media' : category;
    if (category === 'UX/UI Design') {
      var title = String(job.role || '').toLowerCase();
      role = /\bux\b|user experience/.test(title) && !/\bui\b/.test(title) ? 'UX Design' : /\bui\b|user interface/.test(title) && !/\bux\b/.test(title) ? 'UI Design' : 'UX/UI Design';
    }
    return { field:FIELDS[category] || 'Other', role:role || 'Other' };
  }
  function salary(value) {
    var text = String(value || '').replace(/,/g, '');
    var basis = /\/\s*(h|hr|hour)\b|hourly|per hour/i.test(text) ? 'hourly' : /week|month|day|commission|total compensation|ote/i.test(text) ? 'other' : 'annual';
    var nums = (text.match(/\d+(?:\.\d+)?\s*k?/ig) || []).map(function (n) { var v=parseFloat(n); return /k/i.test(n) || (basis === 'annual' && v < 1000) ? v*1000 : v; });
    return { basis:nums.length ? basis : 'unknown', minimum:nums.length ? Math.min.apply(null, nums) : null };
  }
  function update(profile, event, meta, now) {
    var result = Object.assign({}, profile || {}), weight = WEIGHTS[event.name];
    if (!weight || !event.jobId) return result;
    var old = result[event.jobId];
    // Repeated weak actions do not refresh a stronger old action's decay clock.
    if (!old || weight > old.weight) result[event.jobId] = { field:meta.field, role:meta.role, weight:weight, at:now };
    Object.keys(result).forEach(function (id) { if (now-result[id].at > 90*86400000) delete result[id]; });
    var ids=Object.keys(result).sort(function(a,b){return result[b].at-result[a].at;});
    ids.slice(500).forEach(function(id){delete result[id];});
    return result;
  }
  function preferences(profile, now) {
    var fields = {}, roles = {};
    Object.keys(profile || {}).forEach(function(id){
      var item=profile[id], age=now-item.at;
      if (!item || age < 0 || age > 90*86400000 || !Number.isFinite(item.weight)) return;
      var value=item.weight*Math.pow(0.5, age/(30*86400000));
      fields[item.field]=(fields[item.field]||0)+value;
      roles[item.field+'|'+item.role]=(roles[item.field+'|'+item.role]||0)+value;
    });
    return {fields:fields,roles:roles};
  }
  // Deficit interleave preserves proportional interests, including ties, and
  // the varied within-role order. Pay does not determine relevance.
  function interleave(groups, weights) {
    var keys=Object.keys(groups), emitted={}, out=[];
    keys.forEach(function(k){emitted[k]=0;});
    while(keys.some(function(k){return groups[k].length;})) {
      var available=keys.filter(function(k){return groups[k].length;});
      available.sort(function(a,b){var wa=weights[a]||0.1,wb=weights[b]||0.1; return (emitted[a]+1)/wa-(emitted[b]+1)/wb || keys.indexOf(a)-keys.indexOf(b);});
      var key=available[0];out.push(groups[key].shift());emitted[key]++;
    }
    return out;
  }
  function rank(jobs, profile, options) {
    options=options||{};
    if(options.recent) return jobs.slice().sort(function(a,b){return (b._idx||0)-(a._idx||0);});
    var p=preferences(profile, options.now || Date.now());
    Object.keys(options.fieldBoost || {}).forEach(function(field){var boost=options.fieldBoost[field];if(Number.isFinite(boost)&&boost>0)p.fields[field]=(p.fields[field]||0)+Math.min(12,boost);});
    if(!Object.keys(p.fields).length) return jobs.slice();
    var fields={};
    jobs.forEach(function(job){var m=classify(job);if(!fields[m.field])fields[m.field]={};if(!fields[m.field][m.role])fields[m.field][m.role]=[];fields[m.field][m.role].push(job);});
    var fieldQueues={};
    Object.keys(fields).forEach(function(field){
      var roleWeights={};
      Object.keys(fields[field]).forEach(function(role){
        // Interest relevance affects fields and roles; preserve variety within each.
        // A higher salary is not a stronger match for an early-career visitor.
        roleWeights[role]=p.roles[field+'|'+role]||0.1;
      });
      fieldQueues[field]=interleave(fields[field],roleWeights);
    });
    return interleave(fieldQueues,p.fields);
  }
  function away(start, end) { var ms=Math.max(0,end-start);return {seconds:Math.min(900,Math.round(ms/1000)),capped:ms>900000,returned:true}; }
  return {WEIGHTS:WEIGHTS,FIELDS:FIELDS,classify:classify,salary:salary,update:update,preferences:preferences,rank:rank,away:away};
}));
