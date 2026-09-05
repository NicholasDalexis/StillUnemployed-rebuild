/* Saved jobs and applications: local first, per-item versions, recoverable removals.
 * The legacy keys remain the view consumed by the board/tracker. Account caches are isolated.
 */
(function (root) {
  'use strict';
  var KEYS = { saved: 'su_saved_jobs', tracker: 'su_tracker' };
  function empty() { return { saved: {}, tracker: {} }; }
  function id(row) { return row && (row.link || row.id); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
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
    ['saved', 'tracker'].forEach(function (kind) {
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
    var records = read(key(), null) || legacy({ saved: read(KEYS.saved, {}), tracker: read(KEYS.tracker, []) });
    var lastTime = 0;
    function refresh() { records = merge(records, read(key(), empty())); }
    function persist(changed) {
      storage.setItem(key(), JSON.stringify(records));
      var v = view(records);
      var viewChanged = storage.getItem(KEYS.saved) !== JSON.stringify(v.saved) || storage.getItem(KEYS.tracker) !== JSON.stringify(v.tracker);
      storage.setItem(KEYS.saved, JSON.stringify(v.saved));
      storage.setItem(KEYS.tracker, JSON.stringify(v.tracker));
      if (notify && (changed || viewChanged)) notify(changed);
    }
    function stamp(value) {
      ['saved', 'tracker'].forEach(function (kind) { Object.values(records[kind]).forEach(function (op) { lastTime = Math.max(lastTime, op.at); }); });
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
        if (JSON.stringify(previous ? previous.value : (kind === 'saved' ? false : null)) !== JSON.stringify(v)) edits.push([k, v]);
      });
      // Apply only this view's edits. Another tab may have saved a new item since it rendered.
      refresh();
      edits.forEach(function (edit) { records[kind][edit[0]] = stamp(edit[1]); });
      persist(true);
    }
    persist(false);
    return {
      saveSaved: function (v) { save('saved', v); },
      saveTracker: function (v) { save('tracker', v); },
      snapshot: function () { refresh(); return clone(records); },
      receive: function (v) { refresh(); records = merge(records, v); persist(false); },
      activate: function (uid) {
        // Guest data is imported once. Never import a previous account into a different account.
        refresh(); storage.setItem(key(), JSON.stringify(records));
        var guest = owner === null ? records : empty();
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
      if (JSON.stringify(payload(merged)) !== JSON.stringify(payload(decode(remote)))) queue();
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
