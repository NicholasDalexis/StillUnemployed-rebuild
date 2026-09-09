/* Optional first-party measurement and recommendations stay off until chosen.
 * First visit gets a short notice; detailed controls open only on request.
 */
(function () {
  'use strict';
  var notice, tools, settings, noticeObserver;
  function reserveNoticeSpace() {
    var height = notice && !notice.hidden ? notice.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--su-mobile-notice-height', Math.ceil(height) + 'px');
  }
  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, value) { try { localStorage.setItem(key, value); return get(key) === value; } catch (_) { return false; } }
  function decided(key) { return get(key) === 'granted' || get(key) === 'denied'; }
  function focusAfterClose(preferred) {
    if (preferred && preferred.isConnected && preferred.getClientRects().length) { preferred.focus({ preventScroll:true }); return; }
    var target = Array.from(document.querySelectorAll('a[href], button')).find(function (el) { return !el.disabled && el.getClientRects().length; });
    if (target) target.focus({ preventScroll:true });
  }
  function style() {
    if (document.getElementById('su-cc-style')) return;
    var sheet = document.createElement('style'); sheet.id = 'su-cc-style';
    sheet.textContent = [
      '.su-cc{box-sizing:border-box;background:var(--su-paper,#FCFAF3);color:var(--su-ink,#2A2118);font:14px/1.5 var(--su-body,Archivo,sans-serif)}',
      '.su-cc[hidden]{display:none}.su-cc-notice{display:flex;align-items:center;gap:16px;max-width:960px;margin:8px auto;padding:8px 16px;border-bottom:1px solid #c9bfae}',
      '.su-cc-notice p{flex:1;margin:0;font:18px/1.3 var(--su-hand,"Indie Flower",cursive)}',
      '.su-cc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.su-cc-notice .su-cc-actions{flex:none}',
      '.su-cc button,.su-privacy-settings{min-height:44px;padding:8px 12px;font:18px/1.2 var(--su-hand,"Indie Flower",cursive);color:var(--su-ink,#2A2118);border:0;background:var(--su-yellow-paper,#F2E14B);box-shadow:var(--su-note-shadow,2px 3px 7px #2c21181a);cursor:pointer;border-radius:2px}',
      '.su-cc .su-cc-link,.su-privacy-settings{background:none;box-shadow:none;text-decoration:underline;text-underline-offset:3px;color:var(--su-orange-text,#A63D22)}',
      '.su-cc a{color:var(--su-orange-text,#A63D22);text-decoration:underline}.su-cc :focus-visible,.su-privacy-settings:focus-visible{outline:3px solid var(--su-ink,#2A2118);outline-offset:3px}',
      '.su-cc-details{position:relative;text-align:left;max-width:620px;padding:20px;margin:16px auto;box-shadow:var(--su-note-shadow);border:1px solid #d4c8b4}',
      '.su-cc-details h2{font:28px/1.2 var(--su-hand,"Indie Flower",cursive);margin:0 48px 8px 0}.su-cc-details p{margin:8px 0 16px}',
      '.su-cc-details .su-cc-close{position:absolute;right:8px;top:8px;width:44px;background:none;box-shadow:none;font-size:26px}',
      '.su-cc-option{margin:16px 0}.su-cc-option label{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:600}.su-cc-option input{width:20px;height:20px;flex:none;accent-color:var(--su-ink,#2A2118)}',
      '.su-cc-option p{margin:0 0 0 30px;color:var(--su-muted,#6F5E45)}.su-cc .su-cc-feedback{flex-basis:100%;margin:8px 0 0}.su-cc-feedback:empty{display:none}',
      '.su-privacy-tools{max-width:960px;margin:8px auto;padding:0 12px;text-align:center}.su-privacy-settings{font-size:16px}',
      '@media(max-width:700px){.su-cc-notice{display:block;margin:0;padding:10px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left))}.su-cc-notice p{font-size:17px}.su-cc-notice .su-cc-actions{margin-top:6px;gap:6px}.su-cc-notice button{font-size:16px;padding:8px 10px}.su-cc-details{margin:12px;padding:16px}.su-cc-details .su-cc-actions{gap:6px}}'
    ].join('');
    document.head.appendChild(sheet);
  }
  function save(analytics, personalization, feedback, after) {
    // GPC also wins when consent is changed through the short notice.
    var savedAnalytics = set('su_consent_v3', analytics && !navigator.globalPrivacyControl ? 'granted' : 'denied');
    var savedPersonalization = set('su_personalization_v1', personalization ? 'granted' : 'denied');
    window.dispatchEvent(new CustomEvent('su:consent-changed'));
    if (!savedAnalytics || !savedPersonalization) { feedback.textContent = 'Your browser couldn’t save both choices. Please try again.'; return; }
    if (notice) { notice.remove(); notice = null; if (noticeObserver) noticeObserver.disconnect(); reserveNoticeSpace(); }
    after();
  }
  function showSettings(event) {
    if (settings) { settings.focus({ preventScroll:true }); return; }
    var opener = event && event.currentTarget || document.activeElement;
    var panel = document.createElement('section'); settings = panel;
    panel.id = 'su-privacy-choices'; panel.className = 'su-cc su-cc-details'; panel.tabIndex = -1; panel.setAttribute('aria-labelledby', 'su-privacy-title');
    panel.innerHTML = '<button type="button" class="su-cc-close" aria-label="Close privacy choices">×</button><h2 id="su-privacy-title">your privacy choices</h2><p>Saved jobs and your tracker work without these extras.</p><div class="su-cc-option"><label><input type="checkbox" name="analytics">Help improve the board</label><p>Share usage, including job clicks and estimated time away after opening a job. We can’t see another site’s activity.</p></div><div class="su-cc-option"><label><input type="checkbox" name="personalization">Tailor my job feed</label><p>When signed in, use the roles I explore and save to recommend jobs.</p><p>Written major, location and interest preferences are separate. Clear those in Your preferences on the board.</p></div><p><a href="/privacy.html">How your data is used</a></p><div class="su-cc-actions"><button type="button" class="su-cc-save">Save choices</button><button type="button" class="su-cc-decline">No thanks</button><button type="button" class="su-cc-link su-cc-reset">Reset history</button></div><p class="su-cc-feedback" role="status"></p>';
    var analytics = panel.querySelector('[name="analytics"]'), personalization = panel.querySelector('[name="personalization"]'), feedback = panel.querySelector('[role="status"]');
    analytics.checked = get('su_consent_v3') === 'granted'; personalization.checked = get('su_personalization_v1') === 'granted';
    if (navigator.globalPrivacyControl) { analytics.checked = false; analytics.disabled = true; feedback.textContent = 'Your browser privacy signal keeps optional analytics off.'; }
    function close() { panel.remove(); settings = null; if (notice) notice.hidden = false; reserveNoticeSpace(); focusAfterClose(opener); }
    panel.querySelector('.su-cc-close').addEventListener('click', close);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    panel.querySelector('.su-cc-save').addEventListener('click', function () { save(analytics.checked, personalization.checked, feedback, close); });
    panel.querySelector('.su-cc-decline').addEventListener('click', function () { save(false, false, feedback, close); });
    panel.querySelector('.su-cc-reset').addEventListener('click', async function (e) {
      e.currentTarget.disabled = true; var button = e.currentTarget; feedback.textContent = 'Resetting your history…';
      try { if (!window.SUAnalytics) throw new Error('Please reload and try again.'); await window.SUAnalytics.reset(); feedback.textContent = 'History reset. Your saved jobs and tracker are unchanged.'; }
      catch (error) { feedback.textContent = error.message; }
      finally { button.disabled = false; }
    });
    // Expand where the visitor asked, without a modal or a jump to the page top.
    if (notice && notice.contains(opener)) { notice.hidden = true; reserveNoticeSpace(); notice.parentNode.insertBefore(panel, notice.nextSibling); }
    else tools.appendChild(panel);
    panel.focus({ preventScroll:true }); panel.scrollIntoView({ block:'nearest' });
  }
  function showNotice() {
    notice = document.createElement('section'); notice.className = 'su-cc su-cc-notice'; notice.setAttribute('aria-label', 'Privacy notice');
    var gpc = !!navigator.globalPrivacyControl;
    notice.innerHTML = '<p>' + (gpc ? 'Your browser keeps analytics off. Want a job feed tailored to your activity when you sign in?' : 'Can we use your activity here to improve the board and tailor your job feed when you sign in?') + ' <a href="/privacy.html">Privacy</a></p><div class="su-cc-actions"><button type="button" class="su-cc-accept">' + (gpc ? 'Allow recommendations' : 'Allow optional') + '</button><button type="button" class="su-cc-decline">No thanks</button><button type="button" class="su-cc-link su-cc-choose">Choose</button></div><p class="su-cc-feedback" role="status"></p>';
    var feedback = notice.querySelector('[role="status"]');
    notice.querySelector('.su-cc-accept').addEventListener('click', function () { save(!gpc, true, feedback, function () { focusAfterClose(); }); });
    notice.querySelector('.su-cc-decline').addEventListener('click', function () { save(false, false, feedback, function () { focusAfterClose(); }); });
    notice.querySelector('.su-cc-choose').addEventListener('click', showSettings);
    // In flow on every screen: never cover a job, the headline or bottom navigation.
    document.body.insertBefore(notice, document.body.firstChild);
    reserveNoticeSpace();
    if (typeof ResizeObserver === 'function') { noticeObserver = new ResizeObserver(reserveNoticeSpace); noticeObserver.observe(notice); }
  }
  function boot() {
    style(); window.addEventListener('resize', reserveNoticeSpace); tools = document.createElement('div'); tools.className = 'su-privacy-tools';
    var button = document.createElement('button'); button.className = 'su-privacy-settings'; button.type = 'button'; button.textContent = 'Privacy & recommendations'; button.addEventListener('click', showSettings);
    tools.appendChild(button); document.body.appendChild(tools);
    if (!decided('su_consent_v3') || !decided('su_personalization_v1')) showNotice();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
