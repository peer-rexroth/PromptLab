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
  const id = prompts[0].id;
  globalThis.__confirmReturn = true;
  deletePrompt(id);
  assertTrue(deletedPromptIds.some(x => x.id === id));
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

test('reconnectFile does not resurrect a prompt deleted locally, even if the file still has it', function () {
  const id = prompts[0].id;
  const name = prompts[0].name;
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
