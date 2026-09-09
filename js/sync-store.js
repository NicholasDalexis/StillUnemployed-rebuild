/* Saved jobs and applications: local first, per-item versions, recoverable removals.
 * The legacy keys remain the view consumed by the board/tracker. Account caches are isolated.
 */
(function (root) {
  'use strict';
  var KEYS = { saved: 'su_saved_jobs', tracker: 'su_tracker' };
  var KINDS = ['saved', 'tracker', 'discovery'];
  var Identity = typeof module !== 'undefined' && module.exports ? require('./job-identity.js') : null;
  function identity() { return Identity || root.SUJobIdentity; }
  function keys(link) { var i=identity(); return i ? i.keys(link) : []; }
  function same(key, link) { var i=identity(); return key===link || keys(link).indexOf(key)>=0 || !!(i&&i.equivalent(key,link)); }
  function savedSnapshot(job) {
    if (!job || !keys(job.link).length || typeof job.co!=='string' || typeof job.role!=='string') return null;
    var out={};
    ['co','role','link','loc','state','ind','pay','style','exp','desc','tldr','added','posted','payStatus','payBasis','collegeCredit','applicationStatus','cycle','startDate','startDateISO','applicationsOpen','applicationsOpenISO','deadline','deadlineISO','eligibility','timingSourceUrl'].forEach(function(k){if(typeof job[k]==='string')out[k]=job[k].slice(0,k==='desc'||k==='eligibility'?12000:2000);});
    ['internship','pick'].forEach(function(k){if(typeof job[k]==='boolean')out[k]=job[k];});
    ['duties','eligibilityFlags','benefits'].forEach(function(k){if(Array.isArray(job[k]))out[k]=job[k].filter(function(v){return typeof v==='string';}).slice(0,k==='duties'?3:30).map(function(v){return v.slice(0,1000);});});
    if(job.verification&&typeof job.verification==='object'){out.verification={};['status','checkedAt','sourceUrl','reviewerType','humanVerifiedAt'].forEach(function(k){if(typeof job.verification[k]==='string')out.verification[k]=job.verification[k].slice(0,k==='sourceUrl'?2000:100);});['sourceAnnounced','upcomingApproved'].forEach(function(k){if(typeof job.verification[k]==='boolean')out.verification[k]=job.verification[k];});}
    // This is already a source-bound public presentation. The internship helper
    // validates it again when rendering; no private review/source-map data enters.
    var internships=root.SUInternships;
    if(!internships&&typeof module!=='undefined'&&module.exports)internships=require('./internships.js');
    if(job.internship&&internships){var publicRow=internships.publicJob(job);if(publicRow.presentation)out.presentation=publicRow.presentation;}
    return out;
  }
  function empty() { return { saved: {}, tracker: {}, discovery: {} }; }
  function id(row) { return row && (row.link || row.id); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  // Firestore may return map keys in a different order. Order has meaning in an
  // array, but never in a saved-job map or the fields of a tracker record.
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && a.length !== b.length) return false;
    var keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(function (k) {
      return Object.prototype.hasOwnProperty.call(b, k) && equal(a[k], b[k]);
    });
  }
  function legacy(data) {
    var out = empty();
    Object.keys(data.saved || {}).forEach(function (k) {
      if (data.saved[k]) out.saved[k] = { value: true, at: 0, tag: '' };
    });
    (Array.isArray(data.tracker) ? data.tracker : []).forEach(function (r) {
      if (id(r)) out.tracker[id(r)] = { value: r, at: Date.parse(r.updated || r.ts || '') || 0, tag: '' };
    });
    return out;
  }
  function decode(data) {
    return data && data.syncVersion === 2 && data.records ? data.records : legacy(data || {});
  }
  function merge(a, b) {
    var out = empty();
    KINDS.forEach(function (kind) {
      [a || empty(), b || empty()].forEach(function (src) {
        Object.keys(src[kind] || {}).forEach(function (k) {
          var v = src[kind][k], old = out[kind][k];
          if (!old || v.at > old.at || (v.at === old.at && v.tag > old.tag)) out[kind][k] = v;
        });
      });
    });
    return clone(out);
  }
  function view(records) {
    var out = { saved: {}, savedJobs: {}, tracker: [] };
    Object.keys(records.saved).forEach(function (k) { var value=records.saved[k].value;if(value){out.saved[k]=true;var job=value&&savedSnapshot(value.job);if(job&&same(k,job.link))out.savedJobs[k]=job;} });
    Object.keys(records.tracker).forEach(function (k) { if (records.tracker[k].value) out.tracker.push(records.tracker[k].value); });
    out.tracker.sort(function (a, b) { return String(b.dateApplied || '').localeCompare(String(a.dateApplied || '')) || String(id(a)).localeCompare(String(id(b))); });
    return out;
  }
  function payload(records) { return Object.assign(view(records), { syncVersion: 2, records: records }); }
  function create(storage, notify) {
    function read(k, fallback) { try { return JSON.parse(storage.getItem(k)) || fallback; } catch (e) { return fallback; } }
    var owner = read('su_sync_owner', null), device = read('su_sync_device', null);
    if (!device) { device = Math.random().toString(36).slice(2); storage.setItem('su_sync_device', JSON.stringify(device)); }
    function key() { return 'su_sync_v2:' + (owner || 'guest'); }
    var records = merge(empty(), read(key(), null) || legacy({ saved: read(KEYS.saved, {}), tracker: read(KEYS.tracker, []) }));
    var lastTime = 0, suspended = false;
    function ownershipCurrent() { return read('su_sync_owner', null) === owner; }
    function current() { return !suspended && ownershipCurrent(); }
    function assertCurrent() { if (!current()) { var error = Error('Account changed in another tab. Please wait for sign-in to finish.'); error.code = 'sync/account-changed'; throw error; } }
    function refresh() { records = merge(records, read(key(), empty())); }
    function persist(changed) {
      if (!equal(read(key(), null), records)) storage.setItem(key(), JSON.stringify(records));
      var v = view(records);
      var savedChanged = !equal(read(KEYS.saved, null), v.saved);
      var trackerChanged = !equal(read(KEYS.tracker, null), v.tracker);
      // The account record above is authoritative. A full legacy mirror must
      // not turn a durable save into a false failure or block its cloud retry.
      try { if (savedChanged) storage.setItem(KEYS.saved, JSON.stringify(v.saved)); } catch (e) {}
      try { if (trackerChanged) storage.setItem(KEYS.tracker, JSON.stringify(v.tracker)); } catch (e) {}
      if (notify && (changed || savedChanged || trackerChanged)) notify(changed);
    }
    function stamp(value) {
      KINDS.forEach(function (kind) { Object.values(records[kind] || {}).forEach(function (op) { lastTime = Math.max(lastTime, op.at); }); });
      lastTime = Math.max(Date.now(), lastTime + 1);
      return { value: clone(value), at: lastTime, tag: device };
    }
    function save(kind, values, job) {
      assertCurrent();
      var next = kind === 'saved' ? values : {};
      if (kind === 'tracker') values.forEach(function (r) { if (id(r)) next[id(r)] = r; });
      var keys = new Set(Object.keys(records[kind]).concat(Object.keys(next)));
      var edits = [];
      keys.forEach(function (k) {
        var previous = records[kind][k];
        var v = kind === 'saved' ? (next[k] ? previous&&previous.value || true : false) : (next[k] || null);
        if(kind==='saved'&&next[k]&&job&&same(k,job.link)){var snapshot=savedSnapshot(job);if(snapshot)v={job:snapshot};}
        if (!equal(previous ? previous.value : (kind === 'saved' ? false : null), v)) edits.push([k, v]);
      });
      // Apply only this view's edits. Another tab may have saved a new item since it rendered.
      refresh();
      var before = clone(records);
      edits.forEach(function (edit) { records[kind][edit[0]] = stamp(edit[1]); });
      try { persist(edits.length > 0); } catch (e) { records = before; throw e; }
    }
    persist(false);
    return {
      saveSaved: function (v, job) { save('saved', v, job); },
      captureSaved: function (jobs) {
        assertCurrent();refresh();var before=clone(records),changed=false;
        Object.keys(records.saved).forEach(function(k){if(!records.saved[k].value)return;var job=(jobs||[]).find(function(j){return same(k,j.link);}),snapshot=savedSnapshot(job);if(snapshot&&!equal(records.saved[k].value,{job:snapshot})){records.saved[k]=stamp({job:snapshot});changed=true;}});
        try{if(changed)persist(true);}catch(e){records=before;throw e;}
        return changed;
      },
      archivedSaved: function (jobs, closedLinks) {
        if(!current())return [];refresh();var saved=view(records).savedJobs,seen=new Set(),closed=Object.prototype.toString.call(closedLinks)==='[object Set]'?Array.from(closedLinks):Array.isArray(closedLinks)?closedLinks:[];
        return Object.keys(saved).map(function(k){return saved[k];}).filter(function(job){var canonical=keys(job.link)[0];if(seen.has(canonical)||(jobs||[]).some(function(j){return same(j.link,job.link);}))return false;seen.add(canonical);return true;}).map(function(job){return Object.assign({},job,{savedUnavailable:true,confirmedClosed:closed.some(function(link){return typeof link==='string'&&same(link,job.link);})});});
      },
      saveTracker: function (v) { save('tracker', v); },
      // Operational preferences stay account-owned. Never import these from a guest.
      view: function () { if (!current()) return view(empty()); refresh(); return clone(view(records)); },
      current: current,
      ownershipCurrent: ownershipCurrent,
      suspend: function () { suspended = true; },
      discovery: function () { if (!current()) return {}; refresh(); var out={}; Object.keys(records.discovery || {}).forEach(function(k){if(records.discovery[k].value !== null) out[k]=clone(records.discovery[k].value);}); return out; },
      setDiscovery: function (k, value) { if(!owner) return false; assertCurrent(); if(!/^[a-zA-Z0-9:%_.~-]{1,2000}$/.test(k) || k === '__proto__') throw Error('Invalid preference key'); refresh(); var before=clone(records); records.discovery[k]=stamp(value); try { persist(true); } catch(e) { records=before; throw e; } return true; },
      snapshot: function () { assertCurrent(); refresh(); return clone(records); },
      receive: function (v) { assertCurrent(); refresh(); var before=clone(records); records = merge(records, v); try { persist(false); } catch(e) { records=before; throw e; } },
      activate: function (uid) {
        // Guest data is imported once. Never import a previous account into a different account.
        refresh(); storage.setItem(key(), JSON.stringify(records));
        var guest = owner === null && read('su_sync_owner', null) === owner ? merge(empty(), records) : empty();
        guest.discovery = {};
        var nextOwner = uid || null, nextKey = 'su_sync_v2:' + (nextOwner || 'guest');
        var nextRecords = merge(read(nextKey, empty()), guest);
        // Commit the destination before consuming anonymous work or switching
        // ownership. Quota failures must not erase jobs during sign-in.
        storage.setItem(nextKey, JSON.stringify(nextRecords));
        if (uid && owner === null && read('su_sync_owner', null) === owner) storage.setItem('su_sync_v2:guest', JSON.stringify(empty()));
        storage.setItem('su_sync_owner', JSON.stringify(nextOwner));
        owner = nextOwner; records = nextRecords; suspended = false;
        persist(false);
      },
      owner: function () { return owner; }
    };
  }
  // Adapter.transaction must atomically merge with the latest remote document.
  function connect(store, adapter, status) {
    var stopped = false, busy = false, dirty = false, timer, retry = 0;
    var owner = store.owner();
    function active() { return !stopped && store.owner() === owner && (!store.current || store.current()); }
    function queue() {
      if (!active()) return;
      dirty = true; status('saving'); clearTimeout(timer);
      timer = setTimeout(flush, 200);
    }
    async function flush() {
      if (!active() || busy || !dirty) return;
      busy = true; dirty = false;
      try {
        var sent = store.snapshot();
        var result = await adapter.transaction(sent);
        if (!active()) return;
        store.receive(result); retry = 0;
        status(dirty ? 'saving' : 'synced');
      } catch (e) {
        if (!active()) return;
        dirty = true; status('error', e);
        clearTimeout(timer); timer = setTimeout(flush, Math.min(30000, 1000 * Math.pow(2, retry++)));
      } finally {
        busy = false;
        if (active() && dirty && retry === 0) flush();
      }
    }
    var unsubscribe = adapter.listen(function (remote) {
      if (!active()) return;
      try {
      var merged = merge(store.snapshot(), decode(remote));
      store.receive(merged);
      if (!equal(merged, decode(remote))) queue();
      else if (!busy && !dirty) status('synced');
      } catch (e) { if (active()) status('error', e); }
    }, function (e) { if (active()) status('error', e); });
    queue();
    return { queue: queue, flush: flush, stop: function () { stopped = true; clearTimeout(timer); unsubscribe(); } };
  }
  var api = { empty: empty, merge: merge, decode: decode, view: view, payload: payload, create: create, connect: connect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.SUSync = api;
    try {
      root.SUStore = create(root.localStorage, function (localEdit) {
        root.dispatchEvent(new CustomEvent(localEdit ? 'su:local-change' : 'su:data-sync'));
      });
    } catch (e) { console.warn('[su-sync] Local storage unavailable', e.name); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
