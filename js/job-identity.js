/* Job identity only. Original URLs and job objects are never rewritten.
 * ES5 syntax; works as a browser global, Apps Script global or CommonJS export.
 * No URL global, network access, storage or employer inference from job titles.
 */
var SUJobIdentity = (function () {
  'use strict';

  var TRACKING = {
    gclid: true, dclid: true, fbclid: true, msclkid: true,
    mc_cid: true, mc_eid: true, ttclid: true, igshid: true,
    _ga: true, _gl: true
  };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var TENANT = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
  var AMBIGUOUS = {};
  // These exact short links were observed redirecting to the named employer
  // paths on 2026-09-05. Unknown shortcodes never infer an employer or share a
  // globally unscoped ID key with every Workable tenant.
  var WORKABLE_SHORT_ALIASES = {
    '9E2D6ACC47': 'magicspoon',
    'A6CF4192C0': 'petlab-co'
  };

  function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function encoded(value) {
    return value.replace(/%([0-9a-f]{2})/gi, function (match, hex) {
      var character = String.fromCharCode(parseInt(hex, 16));
      return /^[A-Za-z0-9._~-]$/.test(character) ? character : '%' + hex.toUpperCase();
    });
  }
  function isTracking(name) {
    var lower = name.toLowerCase();
    return /^utm_/.test(lower) || has(TRACKING, lower);
  }
  function parse(value) {
    if (typeof value !== 'string') return null;
    var raw = value.trim();
    if (!raw || raw.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) return null;
    var match = raw.match(/^(https?):\/\/([^\/?#]+)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i);
    if (!match) return null;
    var scheme = match[1].toLowerCase();
    var authority = match[2].toLowerCase();
    if (authority.indexOf('@') !== -1) return null;
    var hostMatch = authority.match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]+))?$/);
    if (!hostMatch) return null;
    var host = hostMatch[1];
    var labels = host.split('.');
    for (var n = 0; n < labels.length; n++) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(labels[n])) return null;
    }
    var port = hostMatch[2] ? Number(hostMatch[2]) : null;
    if (port !== null && (port < 1 || port > 65535)) return null;
    if ((scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)) port = null;
    var path = encoded(match[3] || '/');
    // Dot segments, slashes and path case stay intact in the fallback. Ambiguity
    // should produce a false negative, never a guessed match to another posting.
    var fragment = match[5] === undefined ? '' : '#' + encoded(match[5]);
    var pairs = [];
    var pieces = match[4] === undefined || match[4] === '' ? [] : match[4].split('&');
    for (var i = 0; i < pieces.length; i++) {
      var piece = encoded(pieces[i]);
      var equals = piece.indexOf('=');
      var name = equals < 0 ? piece : piece.slice(0, equals);
      var content = equals < 0 ? '' : piece.slice(equals + 1);
      if (!isTracking(name)) pairs.push({ name: name, value: content, text: piece });
    }
    return { scheme: scheme, host: host, port: port, path: path, pairs: pairs, fragment: fragment };
  }
  function parameter(pairs, name) {
    var found = null;
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].name !== name) continue;
      if (found !== null && found !== pairs[i].value) return false;
      found = pairs[i].value;
    }
    return found;
  }
  function onlyParameters(pairs, names) {
    for (var i = 0; i < pairs.length; i++) {
      if (names.indexOf(pairs[i].name) === -1) return false;
    }
    return true;
  }
  function removeProviderTracking(parsed, names) {
    parsed.pairs = parsed.pairs.filter(function (pair) { return names.indexOf(pair.name) === -1; });
  }
  function atsKey(provider, tenant, id) {
    if (!TENANT.test(tenant)) return null;
    return 'ats:' + provider + ':' + tenant + ':' + id;
  }
  function greenhouse(parsed, tenant, pathId, embedded) {
    var id = parameter(parsed.pairs, embedded ? 'token' : 'gh_jid');
    if (id === false || (id !== null && !/^\d+$/.test(id))) return AMBIGUOUS;
    if (pathId && id !== null && pathId !== id) return AMBIGUOUS;
    id = pathId || id;
    if (!id || !onlyParameters(parsed.pairs, embedded ? ['for', 'token'] : ['gh_jid'])) return null;
    return atsKey(parsed.host === 'boards.eu.greenhouse.io' ? 'greenhouse-eu' : 'greenhouse', tenant, id);
  }
  function strongKey(parsed) {
    // Nonstandard ports and fragments can route to another resource. Do not infer.
    if (parsed.port !== null || parsed.fragment) return null;
    var host = parsed.host;
    var path = parsed.path.replace(/\/$/, '');
    var match;

    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io' || host === 'boards.eu.greenhouse.io') {
      if ((match = path.match(/^\/([^\/]+)\/jobs\/(\d+)$/))) return greenhouse(parsed, match[1], match[2], false);
      if (path === '/embed/job_app') {
        var tenant = parameter(parsed.pairs, 'for');
        if (tenant === false) return AMBIGUOUS;
        if (typeof tenant === 'string') return greenhouse(parsed, tenant, null, true);
      }
      return null;
    }

    // Explicit employer-owned aliases. gh_jid on an arbitrary host is never enough.
    if (host === 'careers.cargurus.com') {
      if ((match = path.match(/^\/us\/en\/job\/(\d+)$/))) return greenhouse(parsed, 'cargurus', match[1], false);
      return null;
    }
    if (host === 'www.codeandtheory.com' || host === 'codeandtheory.com') {
      if ((match = path.match(/^\/careers(?:\/(\d+))?$/))) return greenhouse(parsed, 'codeandtheory', match[1] || null, false);
      return null;
    }

    if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
      match = path.match(/^\/([^\/]+)\/([^\/]+)(?:\/apply)?$/);
      if (match && UUID.test(match[2]) && !parsed.pairs.length) return atsKey(host === 'jobs.eu.lever.co' ? 'lever-eu' : 'lever', match[1], match[2].toLowerCase());
      return null;
    }
    if (host === 'jobs.ashbyhq.com') {
      match = path.match(/^\/([^\/]+)\/([^\/]+)$/);
      if (match && UUID.test(match[2]) && !parsed.pairs.length) return atsKey('ashby', match[1], match[2].toLowerCase());
      return null;
    }
    if (/^[a-z0-9-]+\.wd[0-9]+\.myworkdayjobs\.com$/.test(host)) {
      match = path.match(/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?([^\/]+)\/job\/(.+)$/);
      if (!match || parsed.pairs.length || !TENANT.test(match[1])) return null;
      var slug = match[2].split('/').pop();
      // Workday also issues wholly numeric requisitions (for example Madewell
      // 125248). Preserve the complete ID and its tenant/site namespace.
      var requisition = slug.match(/_([0-9]+|[A-Za-z][A-Za-z0-9-]*[0-9][A-Za-z0-9-]*)$/);
      if (!requisition) return null;
      // Keep tenant host, job-board/site and the complete requisition suffix.
      return 'ats:workday:' + host + ':' + match[1] + ':' + requisition[1];
    }
    if (host === 'jobs.smartrecruiters.com') {
      match = path.match(/^\/([^\/]+)\/(\d+)(?:-[^\/]*)?$/);
      if (match && !parsed.pairs.length) return atsKey('smartrecruiters', match[1], match[2]);
      return null;
    }
    if (host === 'apply.workable.com') {
      match = path.match(/^\/j\/([A-Za-z0-9]+)$/);
      if (match && !parsed.pairs.length && has(WORKABLE_SHORT_ALIASES, match[1])) {
        return atsKey('workable', WORKABLE_SHORT_ALIASES[match[1]], match[1]);
      }
      match = path.match(/^\/([^\/]+)\/j\/([A-Za-z0-9]+)$/);
      if (match && !parsed.pairs.length) return atsKey('workable', match[1], match[2]);
    }
    return null;
  }
  function inspect(url) {
    var parsed = parse(url);
    if (!parsed) return { valid: false, ambiguous: false, reason: 'malformed_or_unsupported_url', keys: [] };
    if (parsed.host === 'boards.greenhouse.io' || parsed.host === 'job-boards.greenhouse.io' || parsed.host === 'boards.eu.greenhouse.io' || parsed.host === 'careers.cargurus.com' || parsed.host === 'www.codeandtheory.com' || parsed.host === 'codeandtheory.com') {
      removeProviderTracking(parsed, ['gh_src']);
    }
    if (parsed.host === 'jobs.lever.co' || parsed.host === 'jobs.eu.lever.co') removeProviderTracking(parsed, ['lever-source', 'lever-origin']);
    var strong = strongKey(parsed);
    if (strong === AMBIGUOUS) return { valid: true, ambiguous: true, reason: 'conflicting_or_invalid_job_identifiers', keys: [] };
    var query = parsed.pairs.map(function (pair) { return pair.text; }).join('&');
    var normalized = parsed.scheme + '://' + parsed.host + (parsed.port === null ? '' : ':' + parsed.port) + parsed.path + (query ? '?' + query : '') + parsed.fragment;
    return { valid: true, ambiguous: false, reason: null, keys: strong ? [strong, 'url:' + normalized] : ['url:' + normalized] };
  }
  function keys(url) { return inspect(url).keys; }
  function equivalent(left, right) {
    var a = keys(left), b = keys(right);
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) return true;
    return false;
  }
  function defaultUrl(job) {
    if (!job || typeof job !== 'object') return '';
    var names = ['Link', 'link', 'url'];
    for (var i = 0; i < names.length; i++) {
      if (typeof job[names[i]] === 'string' && job[names[i]].trim()) return job[names[i]];
    }
    return '';
  }
  function groupJobs(jobs, options) {
    if (!Array.isArray(jobs)) return [];
    var getUrl = options && typeof options.getUrl === 'function' ? options.getUrl : defaultUrl;
    var index = Object.create(null), groups = [];
    jobs.forEach(function (job, position) {
      var rawUrl = getUrl(job);
      var identity = keys(rawUrl);
      var matches = [];
      identity.forEach(function (key) {
        if (has(index, key) && matches.indexOf(index[key]) === -1) matches.push(index[key]);
      });
      matches.sort(function (a, b) { return a.order - b.order; });
      var group = matches[0];
      if (!group) {
        group = { order: position, entries: [], identity: [], active: true };
        groups.push(group);
      }
      for (var i = 1; i < matches.length; i++) {
        var merged = matches[i];
        group.entries = group.entries.concat(merged.entries);
        merged.identity.forEach(function (key) {
          if (group.identity.indexOf(key) === -1) group.identity.push(key);
          index[key] = group;
        });
        merged.active = false;
      }
      group.entries.push({ job: job, url: typeof rawUrl === 'string' ? rawUrl : '', position: position });
      identity.forEach(function (key) {
        if (group.identity.indexOf(key) === -1) group.identity.push(key);
        index[key] = group;
      });
    });
    return groups.filter(function (group) { return group.active; }).map(function (group) {
      group.entries.sort(function (a, b) { return a.position - b.position; });
      var aliases = [], members = [];
      group.entries.forEach(function (entry) {
        members.push(entry.job);
        if (entry.url && aliases.indexOf(entry.url) === -1) aliases.push(entry.url);
      });
      return { job: members[0], aliases: aliases, members: members, key: group.identity[0] || null };
    });
  }
  return { keys: keys, equivalent: equivalent, groupJobs: groupJobs, inspect: inspect };
}());

if (typeof module === 'object' && module && module.exports) module.exports = SUJobIdentity;
