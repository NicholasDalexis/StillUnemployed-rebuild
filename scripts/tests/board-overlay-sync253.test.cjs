'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {board} = require('./helpers/board-harness.cjs');

test('Recently viewed survives a data sync as one closable modal', () => {
  const b = board(); b.init();
  b.app.setState({recentOpen: true});
  assert.equal(b.document.querySelectorAll('.su-recent-backdrop').length, 1);

  // Account data can arrive while the dialog is open and refresh the whole board.
  b.fireWindow('su:data-sync');
  assert.equal(b.document.querySelectorAll('.su-recent-backdrop').length, 1);
  assert.equal(b.grid.querySelector('.su-recent-backdrop'), null, 'modal belongs only to the overlay root');
  b.overlay.querySelector('button[data-act="closeRecent"]').click();
  assert.equal(b.app.state.recentOpen, false);
  assert.equal(b.document.querySelectorAll('.su-recent-backdrop').length, 0);
});

test('open detail reflects a synced save before a subsequent toggle without replacing its focused button', () => {
  const b = board(); b.init();
  b.grid.querySelector('[data-act="openJob"]').click();
  const button = b.overlay.querySelector('[data-act="detailSave"]');
  button.focus();
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.textContent, 'Save for later');

  // A save in another tab/device must not leave a misleading unsaved control.
  b.localStorage.setItem('su_saved_jobs', JSON.stringify({'https://example.com/job': true}));
  b.fireWindow('su:data-sync');
  assert.equal(b.app.isSaved('https://example.com/job'), true);
  assert.equal(b.overlay.querySelector('[data-act="detailSave"]'), button);
  assert.equal(b.document.activeElement, button);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.textContent, 'Saved');

  // The visible Saved state now correctly describes the explicit unsave action.
  button.click();
  assert.equal(b.app.isSaved('https://example.com/job'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.textContent, 'Save for later');

  // An external removal follows the same path as an external save.
  button.click();
  assert.equal(b.app.isSaved('https://example.com/job'), true);
  b.localStorage.setItem('su_saved_jobs', '{}');
  b.fireWindow('storage', {key: 'su_saved_jobs'});
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.textContent, 'Save for later');
});
