// snapshotVersion / restoreVersion / clearVersionHistory — a capped
// (3-entry) history of pre-Sync template snapshots.
// makeUnlockedPrompt() is defined in sync-vars.test.js (shared eval scope).

test('syncVars snapshots the pre-edit template into versions[0]', function () {
  const p = makeUnlockedPrompt({ template: 'Write a {{tone}} email.' });
  lastSyncedTemplates.set(p.id, p.template); // simulates a prior Sync having run
  p.template = 'Write a {{tone}} email about {{topic}}.';
  syncVars(p.id);
  assertEqual(p.versions[0].template, 'Write a {{tone}} email.');
});

test('snapshotVersion is a no-op the first time (no prior synced template)', function () {
  const p = makeUnlockedPrompt();
  snapshotVersion(p.id);
  assertDeepEqual(p.versions, []);
});

test('snapshotVersion is a no-op when the template has not changed since the last sync', function () {
  const p = makeUnlockedPrompt({ template: 'unchanged' });
  lastSyncedTemplates.set(p.id, 'unchanged');
  snapshotVersion(p.id);
  assertDeepEqual(p.versions, []);
});

test('versions are capped at 3, dropping the oldest', function () {
  const p = makeUnlockedPrompt({ template: 'v5' });
  p.versions = [{ template: 'v3', savedAt: 3 }, { template: 'v2', savedAt: 2 }, { template: 'v1', savedAt: 1 }];
  lastSyncedTemplates.set(p.id, 'v4'); // the stable state as of the previous sync, not yet snapshotted
  snapshotVersion(p.id);
  assertEqual(p.versions.length, 3);
  assertEqual(p.versions[0].template, 'v4', 'newest snapshot goes to the front');
  assertFalse(p.versions.some(v => v.template === 'v1'), 'oldest snapshot should have been dropped');
});

test('restoreVersion rolls the template and vars back to the snapshot', function () {
  const p = makeUnlockedPrompt({ template: 'current {{tone}}' });
  p.versions = [{ template: 'older text with no vars', savedAt: 1 }];
  lastSyncedTemplates.set(p.id, 'current {{tone}}');
  restoreVersion(p.id, 0);
  assertEqual(p.template, 'older text with no vars');
  assertDeepEqual(Object.keys(p.vars), [], 'vars should be re-detected from the restored template');
});

test('restoreVersion snapshots the last-synced state before overwriting the template', function () {
  const p = makeUnlockedPrompt({ template: 'unsaved current edits' });
  p.versions = [{ template: 'older text', savedAt: 1 }];
  lastSyncedTemplates.set(p.id, 'last synced text'); // diverges from p.template — unsaved edits exist
  restoreVersion(p.id, 0);
  assertEqual(p.versions.length, 2, 'the last-synced state should have been snapshotted before the restore overwrote the template');
  assertEqual(p.versions[0].template, 'last synced text');
  assertEqual(p.template, 'older text');
});

test('restoreVersion does nothing for an out-of-range index', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  p.versions = [];
  restoreVersion(p.id, 0);
  assertEqual(p.template, 'current text');
});

test('clearVersionHistory empties the versions array', function () {
  const p = makeUnlockedPrompt();
  p.versions = [{ template: 'x', savedAt: 1 }];
  clearVersionHistory(p.id);
  assertDeepEqual(p.versions, []);
});
