// tombstone()/untombstone() and their wiring into deletePrompt/deleteCategory
// and the merge paths (mergePrompts/mergeCategories, and reconnectFile()/
// initFileSync() now that they merge instead of raw-replacing) — the
// "deleted things shouldn't come back from a stale linked file, another
// device, or an old local backup" guarantee.
// makeUnlockedPrompt() is defined in sync-vars.test.js (shared eval scope).

test('tombstone() adds a new entry with the current time', function () {
  const list = [];
  tombstone(list, 'x1');
  assertEqual(list.length, 1);
  assertEqual(list[0].id, 'x1');
  assertTrue(typeof list[0].deletedAt === 'number');
});

test('tombstone() on an already-tombstoned id refreshes deletedAt instead of duplicating', function () {
  const list = [{ id: 'x1', deletedAt: 1 }];
  tombstone(list, 'x1');
  assertEqual(list.length, 1);
  assertTrue(list[0].deletedAt > 1);
});

test('untombstone() removes the matching entry', function () {
  const list = [{ id: 'x1', deletedAt: 1 }, { id: 'x2', deletedAt: 2 }];
  untombstone(list, 'x1');
  assertDeepEqual(list.map(x => x.id), ['x2']);
});

test('deletePrompt records a tombstone for the deleted id', function () {
  const p = makeUnlockedPrompt();
  globalThis.__confirmReturn = true;
  deletePrompt(p.id);
  assertTrue(deletedPromptIds.some(x => x.id === p.id));
});

test('deleteCategory records a tombstone for the deleted id', function () {
  categories.push({ id: 'cat_unused', name: 'Unused', color: 'blue' });
  globalThis.__confirmReturn = true;
  deleteCategory('cat_unused');
  assertTrue(deletedCategoryIds.some(x => x.id === 'cat_unused'));
});

test('mergePrompts does not resurrect a prompt whose tombstone is newer than the incoming copy', function () {
  deletedPromptIds.push({ id: 5001, deletedAt: 2000 });
  const { added } = mergePrompts([{ id: 5001, name: 'Deleted elsewhere', template: 'hi', lastEdited: 1000 }]);
  assertEqual(added, 0);
  assertFalse(prompts.some(p => p.name === 'Deleted elsewhere'));
});

test('mergePrompts lets a prompt back in when the incoming edit is newer than the tombstone', function () {
  deletedPromptIds.push({ id: 5002, deletedAt: 1000 });
  const { added } = mergePrompts([{ id: 5002, name: 'Edited after delete', template: 'hi', lastEdited: 2000 }]);
  assertEqual(added, 1);
  assertTrue(prompts.some(p => p.name === 'Edited after delete'));
  assertFalse(deletedPromptIds.some(x => x.id === 5002), 'the stale tombstone should have been cleared');
});

test('mergePrompts merges incoming tombstones into the local list', function () {
  mergePrompts([], [{ id: 9001, deletedAt: 500 }]);
  assertTrue(deletedPromptIds.some(x => x.id === 9001));
});

test('mergePrompts keeps the later deletedAt when both sides have a tombstone for the same id', function () {
  deletedPromptIds.push({ id: 9002, deletedAt: 100 });
  mergePrompts([], [{ id: 9002, deletedAt: 999 }]);
  assertEqual(deletedPromptIds.find(x => x.id === 9002).deletedAt, 999);
});

test('mergeCategories does not resurrect a tombstoned category', function () {
  deletedCategoryIds.push({ id: 'cat_gone', deletedAt: Date.now() });
  mergeCategories([{ id: 'cat_gone', name: 'Gone', color: 'blue' }]);
  assertFalse(categories.some(c => c.id === 'cat_gone'));
});

test('mergeCategories merges incoming category tombstones into the local list', function () {
  mergeCategories([], [{ id: 'cat_9003', deletedAt: 500 }]);
  assertTrue(deletedCategoryIds.some(x => x.id === 'cat_9003'));
});

test('reconnectFile merges rather than replacing — an existing local-only prompt survives', function () {
  const localOnly = makeUnlockedPrompt({ id: 7001, name: 'Local only, not in the file' });
  const externalJson = JSON.stringify({
    prompts: [{ id: 7002, name: 'From the file', template: 'hi', lastEdited: 1 }],
    categories: []
  });
  fileHandle = {
    name: 'test.json',
    requestPermission: async () => 'granted',
    getFile: async () => ({ text: async () => externalJson })
  };
  return reconnectFile().then(() => {
    assertTrue(prompts.some(p => p.id === 7001), 'the local-only prompt should not have been wiped out by the merge');
    assertTrue(prompts.some(p => p.id === 7002), 'the file-only prompt should have been merged in');
  });
});

test('mergePrompts updates a renamed prompt in place instead of adding a duplicate under its old name', function () {
  // Regression: a prompt renamed locally (same id) used to get re-added as a
  // second array entry when a stale-named copy came in via merge, leaving two
  // prompts sharing one id (sidebar highlight is id-based, so both would light
  // up together). Matching by id as a fallback when the name doesn't match
  // any longer prevents that.
  // Names are deliberately unique (no bundled default shares them) so the
  // lookup can only succeed via the id fallback, not an incidental name match.
  const p = makeUnlockedPrompt({ id: 6001, name: 'Sync test v2.0', template: 'current', lastEdited: 2000 });
  const { added, updated } = mergePrompts([{ id: 6001, name: 'Sync test v1.0', template: 'stale', lastEdited: 1000 }]);
  assertEqual(added, 0);
  assertEqual(updated, 0); // incoming is older than the local rename, so it's ignored outright
  assertEqual(prompts.filter(x => x.id === 6001).length, 1, 'should still be exactly one prompt with this id');
  assertEqual(p.name, 'Sync test v2.0', 'the local rename should survive');
});

test('mergePrompts adopts a newer incoming rename of the same id, not just a newer name match', function () {
  const p = makeUnlockedPrompt({ id: 6002, name: 'Sync test v1.0', template: 'old', lastEdited: 1000 });
  const { added, updated } = mergePrompts([{ id: 6002, name: 'Sync test v2.0', template: 'new', lastEdited: 2000 }]);
  assertEqual(added, 0);
  assertEqual(updated, 1);
  assertEqual(prompts.filter(x => x.id === 6002).length, 1);
  assertEqual(p.name, 'Sync test v2.0');
});

test('reconnectFile does not resurrect a prompt deleted locally, even if the file still has it', function () {
  const p = makeUnlockedPrompt();
  const id = p.id;
  const name = p.name;
  globalThis.__confirmReturn = true;
  deletePrompt(id); // records a tombstone with deletedAt = now
  const externalJson = JSON.stringify({
    prompts: [{ id, name, template: 'stale copy', lastEdited: 1 }], // older than the tombstone
    categories: []
  });
  fileHandle = {
    name: 'test.json',
    requestPermission: async () => 'granted',
    getFile: async () => ({ text: async () => externalJson })
  };
  return reconnectFile().then(() => {
    assertFalse(prompts.some(p => p.id === id), 'the deleted prompt should stay deleted');
  });
});

// { respectTombstones: false } — the opt-out confirmImport() uses (but
// reconnectFile()/initFileSync()/linkFile() do not), since a manual import is
// a deliberate, user-picked action rather than an automatic background sync.
test('mergePrompts with respectTombstones:false brings back a prompt even if the incoming copy is older than the tombstone', function () {
  deletedPromptIds.push({ id: 5003, deletedAt: 2000 });
  const { added } = mergePrompts([{ id: 5003, name: 'Deleted then reimported', template: 'hi', lastEdited: 1000 }], null, { respectTombstones: false });
  assertEqual(added, 1);
  assertTrue(prompts.some(p => p.name === 'Deleted then reimported'));
  assertFalse(deletedPromptIds.some(x => x.id === 5003), 'the tombstone should be cleared once the prompt is deliberately brought back');
});

test('mergeCategories with respectTombstones:false brings back a tombstoned category', function () {
  deletedCategoryIds.push({ id: 'cat_gone2', deletedAt: Date.now() });
  mergeCategories([{ id: 'cat_gone2', name: 'Gone but reimported', color: 'blue' }], null, { respectTombstones: false });
  assertTrue(categories.some(c => c.id === 'cat_gone2'));
  assertFalse(deletedCategoryIds.some(x => x.id === 'cat_gone2'));
});

test('confirmImport in merge mode brings back a prompt previously deleted in this browser', function () {
  const p = makeUnlockedPrompt({ id: 5004, name: 'Old friend', lastEdited: 1000 });
  globalThis.__confirmReturn = true;
  deletePrompt(5004); // tombstoned with deletedAt = now, well after lastEdited: 1000
  pendingImportData = {
    prompts: [{ id: 5004, name: 'Old friend', template: 'restored', lastEdited: 1000 }],
    categories: []
  };
  globalThis.__importMode = 'merge';
  confirmImport();
  assertTrue(prompts.some(p => p.id === 5004), 'a manually-imported prompt should come back even though it was deleted here before');
});
