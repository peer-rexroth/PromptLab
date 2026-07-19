// maybeSnapshotBackup / getBackups / restoreBackup — the rolling daily
// local-backup safety net (distinct from the linked-file sync, which
// mirrors live state rather than preserving history).

test('save() takes a backup snapshot on the first save of the day', function () {
  assertEqual(getBackups().length, 0, 'resetState() clears localStorage, so no backup should exist yet');
  save();
  const backups = getBackups();
  assertEqual(backups.length, 1);
  assertEqual(backups[0].date, todayStr());
  assertEqual(backups[0].prompts.length, prompts.length);
});

test('save() does not take a second backup the same day', function () {
  save();
  save();
  save();
  assertEqual(getBackups().length, 1);
});

test('a backup taken earlier in the day is not updated by later saves that same day', function () {
  save(); // first backup of the day, captures current prompts
  const originalCount = prompts.length;
  makeUnlockedPrompt({ name: 'Added after first save' });
  save(); // same day — maybeSnapshotBackup should short-circuit, not refresh the snapshot
  const backups = getBackups();
  assertEqual(backups.length, 1);
  assertEqual(backups[0].prompts.length, originalCount, 'the backup should reflect state at the first save of the day, not this later save');
});

test('backups older than MAX_BACKUPS days are trimmed, keeping the most recent', function () {
  const old = [];
  for (let i = 0; i < MAX_BACKUPS; i++) {
    old.push({ date: `2020-01-0${i + 1}`, savedAt: i, categories, prompts: [] });
  }
  localStorage.setItem(BACKUPS_KEY, JSON.stringify(old));
  save(); // pushes one more (today's), should trigger trimming
  const backups = getBackups();
  assertEqual(backups.length, MAX_BACKUPS);
  assertEqual(backups[0].date, '2020-01-02', 'oldest (2020-01-01) should have been dropped');
  assertEqual(backups[backups.length - 1].date, todayStr());
});

test('restoreBackup replaces the library with the snapshot, after confirmation', function () {
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-06-01', savedAt: 1, categories: DEFAULT_CATS, prompts: [{ id: 42, name: 'From backup', catId: 'other', template: 'hi', vars: {}, presets: [], versions: [] }] }
  ]));
  globalThis.__confirmReturn = true;
  restoreBackup('2020-06-01');
  assertEqual(prompts.length, 1);
  assertEqual(prompts[0].name, 'From backup');
});

test('restoreBackup does nothing when the confirmation is declined', function () {
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-06-01', savedAt: 1, categories: DEFAULT_CATS, prompts: [{ id: 42, name: 'From backup' }] }
  ]));
  const before = prompts.length;
  globalThis.__confirmReturn = false;
  restoreBackup('2020-06-01');
  assertEqual(prompts.length, before);
});

test('restoreBackup downloads a safety backup of the current library before restoring', function () {
  const beforeCount = prompts.length;
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-06-01', savedAt: 1, categories: DEFAULT_CATS, prompts: [{ id: 42, name: 'From backup', catId: 'other', template: 'hi', vars: {}, presets: [], versions: [] }] }
  ]));
  globalThis.__confirmReturn = true;
  globalThis.__lastBlob = null;
  restoreBackup('2020-06-01');
  assertTrue(!!globalThis.__lastBlob);
  const dl = JSON.parse(globalThis.__lastBlob.parts[0]);
  assertEqual(dl.prompts.length, beforeCount, 'the downloaded file should be the pre-restore library');
});

test('restoreBackup normalizes the restored prompts', function () {
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-06-01', savedAt: 1, categories: DEFAULT_CATS, prompts: [{ id: 42, name: 'Bare', catId: 'other', template: 'hi' }] }
  ]));
  globalThis.__confirmReturn = true;
  restoreBackup('2020-06-01');
  assertEqual(prompts[0].locked, false);
  assertDeepEqual(prompts[0].versions, []);
});

test('restoreBackup resets activeId when it no longer points at a surviving prompt', function () {
  activeId = 999999; // not present in the backup being restored
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-06-01', savedAt: 1, categories: DEFAULT_CATS, prompts: [{ id: 42, name: 'Survivor', catId: 'other', template: 'hi', vars: {}, presets: [], versions: [] }] }
  ]));
  globalThis.__confirmReturn = true;
  restoreBackup('2020-06-01');
  assertEqual(activeId, 42);
});

test('restoreBackup does nothing for a date with no matching backup', function () {
  const before = JSON.stringify(prompts);
  restoreBackup('1999-01-01');
  assertEqual(JSON.stringify(prompts), before);
});

test('renderBackupsModal shows the empty state when there are no backups', function () {
  renderBackupsModal();
  assertIncludes(document.getElementById('backupsList').innerHTML, 'No backups yet');
});

test('renderBackupsModal lists backups newest first', function () {
  localStorage.setItem(BACKUPS_KEY, JSON.stringify([
    { date: '2020-01-01', savedAt: 1, categories: [], prompts: [] },
    { date: '2020-01-02', savedAt: 2, categories: [], prompts: [] }
  ]));
  renderBackupsModal();
  const html = document.getElementById('backupsList').innerHTML;
  const idxJan1 = html.indexOf(fmtDate('2020-01-01'));
  const idxJan2 = html.indexOf(fmtDate('2020-01-02'));
  assertTrue(idxJan2 < idxJan1, 'the newer backup should be listed first');
});
