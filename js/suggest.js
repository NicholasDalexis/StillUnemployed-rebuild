/* Private Netlify Forms intake. These checks help visitors; every inbox item
   remains untrusted and needs review. No submitted URL is fetched here. */
var SUSuggest = (function () {
  'use strict';
  var FORM_NAME = 'job-suggestions-v2';
  var MAX_URL = 2048, MAX_CONTEXT = 500;
  var NON_POSTING_HOSTS = ['linkedin.com', 'lnkd.in', 'indeed.com', 'glassdoor.com',
    'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
    'bit.ly', 't.co', 'tinyurl.com', 'goo.gl'];

  function validate(rawUrl, rawContext) {
    var link = String(rawUrl || '').trim(), context = String(rawContext || '').trim(), parsed;
    if (!link || link.length > MAX_URL) return { field: 'url', error: 'Paste a job link up to 2,048 characters long.' };
    if (!/^https:\/\//i.test(link) || /[\s<>"\\\u0000-\u001f\u007f]/.test(link)) {
      return { field: 'url', error: 'Use the complete public posting link, starting with https://.' };
    }
    try { parsed = new URL(link); } catch (e) { return { field: 'url', error: 'That link looks incomplete. Copy it from the employer’s posting and try again.' }; }
    var host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    var labels = host.split('.');
    var badLabel = labels.some(function (label) { return !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label); });
    if (parsed.username || parsed.password || parsed.port || host.indexOf('.') < 0 ||
        badLabel || !/^[a-z0-9.-]+$/.test(host) || /^[0-9.]+$/.test(host) ||
        /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
      return { field: 'url', error: 'Use a public employer or hiring-platform link, without a login or private address.' };
    }
    for (var i = 0; i < NON_POSTING_HOSTS.length; i++) {
      var blocked = NON_POSTING_HOSTS[i];
      if (host === blocked || host.slice(-(blocked.length + 1)) === '.' + blocked) {
        return { field: 'url', error: 'Please send the employer’s posting link, rather than a social post, job aggregator or shortened link.' };
      }
    }
    if (context.length > MAX_CONTEXT) return { field: 'context', error: 'Keep your note to 500 characters or fewer.' };
    return { url: link, context: context };
  }

  function encode(data) {
    return Object.keys(data).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]); }).join('&');
  }

  function mount(doc, win) {
    var form = doc.getElementById('suggest-form');
    if (!form) return;
    var input = doc.getElementById('suggest-url'), context = doc.getElementById('suggest-context');
    var button = doc.getElementById('suggest-submit'), status = doc.getElementById('suggest-status');
    var receipt = doc.getElementById('suggest-receipt'), receiptTitle = doc.getElementById('suggest-receipt-title');
    var requestId = doc.getElementById('suggest-request-id'), another = doc.getElementById('suggest-another');
    var busy = false, lastAttempt = '';
    // Netlify removes this attribute when it registers a form. Keep unprocessed
    // local files / unconfigured deploys from reporting a false successful send.
    var ready = !form.hasAttribute('data-netlify') && !form.hasAttribute('netlify');

    function newRequestId() {
      return win.crypto && win.crypto.randomUUID ? win.crypto.randomUUID() :
        'su-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    }
    function message(text, state) {
      status.textContent = text;
      status.setAttribute('data-state', state || 'info');
    }
    function invalid(field, text) {
      var target = field === 'context' ? context : input;
      target.setAttribute('aria-invalid', 'true');
      message(text, 'error'); target.focus();
    }
    requestId.value = newRequestId();
    button.disabled = !ready;
    if (!ready) message('Suggestions are not open on this page yet. Your link has not been sent.');

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !ready) return;
      input.removeAttribute('aria-invalid'); context.removeAttribute('aria-invalid');
      var checked = validate(input.value, context.value);
      if (checked.error) { invalid(checked.field, checked.error); return; }
      var attempt = JSON.stringify([checked.url, checked.context]);
      if (lastAttempt && lastAttempt !== attempt) requestId.value = newRequestId();
      lastAttempt = attempt;
      busy = true; button.disabled = true;
      input.disabled = true; context.disabled = true;
      form.setAttribute('aria-busy', 'true'); message('Sending your suggestion…');
      var controller = win.AbortController ? new win.AbortController() : null;
      var timer = controller ? win.setTimeout(function () { controller.abort(); }, 15000) : null;
      try {
        var payload = { 'form-name': FORM_NAME, 'job-url': checked.url, context: checked.context,
          'request-id': requestId.value, 'bot-field': form.elements['bot-field'].value };
        var options = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encode(payload), credentials: 'same-origin', redirect: 'error' };
        if (controller) options.signal = controller.signal;
        var response = await win.fetch('/suggest', options);
        if (!response || !response.ok) throw new Error('Unconfirmed receipt');
        form.hidden = true; receipt.hidden = false; receiptTitle.focus();
        message('');
      } catch (e) {
        // A timeout can occur after server acceptance. Preserve the request ID
        // and fields on retry so a reviewer can identify duplicate receipts.
        message('We couldn’t confirm receipt. Your link is still here. Please try again.', 'error');
      } finally {
        if (timer !== null) win.clearTimeout(timer);
        busy = false; button.disabled = false; input.disabled = false; context.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
    another.addEventListener('click', function () {
      if (busy) return;
      form.reset(); requestId.value = newRequestId(); lastAttempt = '';
      input.removeAttribute('aria-invalid'); context.removeAttribute('aria-invalid');
      receipt.hidden = true; form.hidden = false; message(''); input.focus();
    });
  }
  return { validate: validate, encode: encode, mount: mount, formName: FORM_NAME };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SUSuggest;
if (typeof document !== 'undefined' && typeof window !== 'undefined') SUSuggest.mount(document, window);
