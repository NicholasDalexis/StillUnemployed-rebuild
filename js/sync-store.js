/* Saved jobs and applications: local first, per-item versions, recoverable removals.
 * The legacy keys remain the view consumed by the board/tracker. Account caches are isolated.
 */
(function (root) {
  'use strict';
  var KEYS = { saved: 'su_saved_jobs', tracker: 'su_tracker' };
  var KINDS = ['saved', 'tracker', 'discovery'];
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
    var out = { saved: {}, tracker: [] };
    Object.keys(records.saved).forEach(function (k) { if (records.saved[k].value) out.saved[k] = true; });
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
    var lastTime = 0;
    function refresh() { records = merge(records, read(key(), empty())); }
    function persist(changed) {
      if (!equal(read(key(), null), records)) storage.setItem(key(), JSON.stringify(records));
      var v = view(records);
      var savedChanged = !equal(read(KEYS.saved, null), v.saved);
      var trackerChanged = !equal(read(KEYS.tracker, null), v.tracker);
      if (savedChanged) storage.setItem(KEYS.saved, JSON.stringify(v.saved));
      if (trackerChanged) storage.setItem(KEYS.tracker, JSON.stringify(v.tracker));
      if (notify && (changed || savedChanged || trackerChanged)) notify(changed);
    }
    function stamp(value) {
      KINDS.forEach(function (kind) { Object.values(records[kind] || {}).forEach(function (op) { lastTime = Math.max(lastTime, op.at); }); });
      lastTime = Math.max(Date.now(), lastTime + 1);
      return { value: clone(value), at: lastTime, tag: device };
    }
    function save(kind, values) {
      var next = kind === 'saved' ? values : {};
      if (kind === 'tracker') values.forEach(function (r) { if (id(r)) next[id(r)] = r; });
      var keys = new Set(Object.keys(records[kind]).concat(Object.keys(next)));
      var edits = [];
      keys.forEach(function (k) {
        var v = kind === 'saved' ? !!next[k] : (next[k] || null);
        var previous = records[kind][k];
        if (!equal(previous ? previous.value : (kind === 'saved' ? false : null), v)) edits.push([k, v]);
      });
      // Apply only this view's edits. Another tab may have saved a new item since it rendered.
      refresh();
      edits.forEach(function (edit) { records[kind][edit[0]] = stamp(edit[1]); });
      persist(edits.length > 0);
    }
    persist(false);
    return {
      saveSaved: function (v) { save('saved', v); },
      saveTracker: function (v) { save('tracker', v); },
      // Operational preferences stay account-owned. Never import these from a guest.
      discovery: function () { refresh(); var out={}; Object.keys(records.discovery || {}).forEach(function(k){if(records.discovery[k].value !== null) out[k]=clone(records.discovery[k].value);}); return out; },
      setDiscovery: function (k, value) { if(!owner) return false; if(!/^[a-zA-Z0-9:%_.~-]{1,2000}$/.test(k) || k === '__proto__') throw Error('Invalid preference key'); refresh(); records.discovery[k]=stamp(value); persist(true); return true; },
      snapshot: function () { refresh(); return clone(records); },
      receive: function (v) { refresh(); records = merge(records, v); persist(false); },
      activate: function (uid) {
        // Guest data is imported once. Never import a previous account into a different account.
        refresh(); storage.setItem(key(), JSON.stringify(records));
        var guest = owner === null ? merge(empty(), records) : empty();
        guest.discovery = {};
        if (uid && owner === null) storage.setItem('su_sync_v2:guest', JSON.stringify(empty()));
        owner = uid || null;
        records = merge(read(key(), empty()), guest);
        storage.setItem('su_sync_owner', JSON.stringify(owner));
        persist(false);
      },
      owner: function () { return owner; }
    };
  }
  // Adapter.transaction must atomically merge with the latest remote document.
  function connect(store, adapter, status) {
    var stopped = false, busy = false, dirty = false, timer, retry = 0;
    function queue() {
      dirty = true; status('saving'); clearTimeout(timer);
      timer = setTimeout(flush, 200);
    }
    async function flush() {
      if (stopped || busy || !dirty) return;
      busy = true; dirty = false;
      var sent = store.snapshot();
      try {
        var result = await adapter.transaction(sent);
        if (stopped) return;
        store.receive(result); retry = 0;
        status(dirty ? 'saving' : 'synced');
      } catch (e) {
        if (stopped) return;
        dirty = true; status('error', e);
        clearTimeout(timer); timer = setTimeout(flush, Math.min(30000, 1000 * Math.pow(2, retry++)));
      } finally {
        busy = false;
        if (!stopped && dirty && retry === 0) flush();
      }
    }
    var unsubscribe = adapter.listen(function (remote) {
      if (stopped) return;
      var merged = merge(store.snapshot(), decode(remote));
      store.receive(merged);
      if (!equal(merged, decode(remote))) queue();
      else if (!busy && !dirty) status('synced');
    }, function (e) { status('error', e); });
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
