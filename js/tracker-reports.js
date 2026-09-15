/* Private, acknowledged review requests. Never changes Tracker or public availability. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.SUTrackerReports = factory(root);
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  function fail(message) { return new Error(message); }
  function report(job, options) {
    options = options || {};
    var current = options.current || function () { return true; }, auth = root.SUAuth;
    function guard() {
      if (!current() || !auth || !auth.signedIn || !auth.signedIn() || (auth.accountCurrent && !auth.accountCurrent())) {
        throw fail('Sign in again, then reopen this report.');
      }
    }
    var requestId = options.requestId;
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return Promise.reject(fail('Could not prepare this report. Reopen it to try again.'));
    // Construct an explicit allowlist; never serialize the private Tracker row.
    var source = job.source === 'StillUnemployed' ? 'StillUnemployed.com' : job.source;
    if (['StillUnemployed.com', 'LinkedIn', 'Indeed', 'Company website', 'Referral', 'Other'].indexOf(source) === -1) source = 'Other';
    if (['unavailable', 'suspicious', 'incorrect', 'other'].indexOf(options.reason) === -1) return Promise.reject(fail('Choose a reason for this report.'));
    var payload = { requestId: requestId, reason: options.reason, job: {
      link: String(job.link || ''), company: String(job.company || ''), role: String(job.role || ''), source: source
    } };
    var controller = new root.AbortController(), timer;
    return Promise.resolve().then(function () {
      guard();
      return auth.getToken(true);
    }).then(function (token) {
      guard();
      var timeout = new Promise(function (_, reject) { timer = root.setTimeout(function () { controller.abort(); reject(fail('Receipt could not be confirmed. Retry to check the same report.')); }, 15000); });
      var request = root.fetch('/api/tracker-reports', { method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload)
      }).then(function (response) {
        return response.text().then(function (text) {
          guard();
          if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? 'Sign in again, then reopen this report.' : response.status === 429 ? 'Too many reports right now. Please try again later.' : response.status === 400 || response.status === 409 ? 'This posting could not be reported. Check its link and details, then reopen the report.' : 'Receipt could not be confirmed. Retry to check the same report.');
          if (text.length > 8192) throw fail('Receipt could not be confirmed. Retry to check the same report.');
          var data;
          try { data = JSON.parse(text); } catch (_) { throw fail('Receipt could not be confirmed. Retry to check the same report.'); }
          var scope = /--stillunemployed\.netlify\.app$/.test(root.location.hostname) ? 'preview' : 'production';
          if (!data || data.schemaVersion !== 1 || data.requestId !== requestId || data.status !== 'pending_review' || typeof data.reportId !== 'string' || !/^[a-f0-9]{64}$/.test(data.reportId) || data.scope !== scope || typeof data.duplicate !== 'boolean') throw fail('Receipt could not be confirmed. Retry to check the same report.');
          return data;
        });
      });
      return Promise.race([request, timeout]);
    }).catch(function (error) {
      guard();
      if (error && error.message && /^(Sign in again|Too many reports|This posting|Receipt could not)/.test(error.message)) throw error;
      throw fail('Receipt could not be confirmed. Retry to check the same report.');
    }).finally(function () { root.clearTimeout(timer); });
  }
  return { report: report };
});
