// exportLibrary, mergePrompts (the merge-mode dedup helper shared by
// confirmImport and file-sync's cross-tab merge), and confirmImport itself.

test('exportLibrary produces a version-4 blob with all prompts and categories', function () {
  exportLibrary();
  assertTrue(!!globalThis.__lastBlob, 'a Blob should have been created');
  const data = JSON.parse(globalThis.__lastBlob.parts[0]);
  assertEqual(data.version, 4);
  assertEqual(data.prompts.length, prompts.length);
  assertEqual(data.categories.length, categories.length);
});

test('mergePrompts adds an incoming prompt with a name not already in the library', function () {
  const before = prompts.length;
  const { added, updated } = mergePrompts([{ id: 5001, name: 'Brand new prompt', template: 'hi', lastEdited: 1 }]);
  assertEqual(added, 1);
  assertEqual(updated, 0);
  assertEqual(prompts.length, before + 1);
  assertTrue(prompts.some(p => p.name === 'Brand new prompt'));
});

test('mergePrompts updates an existing prompt when the incoming one is newer', function () {
  const existing = prompts[0];
  existing.lastEdited = 100;
  const { added, updated } = mergePrompts([{ id: existing.id, name: existing.name, template: 'updated content', lastEdited: 200 }]);
  assertEqual(updated, 1);
  assertEqual(added, 0);
  assertEqual(prompts.find(p => p.name === existing.name).template, 'updated content');
});

test('mergePrompts ignores an incoming prompt older than the existing one with the same name', function () {
  const existing = prompts[0];
  existing.lastEdited = 200;
  existing.template = 'keep me';
  const { added, updated } = mergePrompts([{ id: existing.id, name: existing.name, template: 'stale content', lastEdited: 100 }]);
  assertEqual(added, 0);
  assertEqual(updated, 0);
  assertEqual(prompts.find(p => p.name === existing.name).template, 'keep me');
});

test('mergePrompts collapses pre-existing same-name duplicates, keeping the most recently edited', function () {
  prompts.push({ id: 8001, name: 'Duplicate', template: 'old copy', lastEdited: 1, catId: categories[0].id, vars: {}, presets: [], versions: [] });
  prompts.push({ id: 8002, name: 'Duplicate', template: 'new copy', lastEdited: 2, catId: categories[0].id, vars: {}, presets: [], versions: [] });
  mergePrompts([]);
  const dupes = prompts.filter(p => p.name === 'Duplicate');
  assertEqual(dupes.length, 1);
  assertEqual(dupes[0].template, 'new copy');
});

test('confirmImport in replace mode swaps out the entire library', function () {
  pendingImportData = {
    prompts: [{ id: 9001, name: 'Only prompt', template: 'hi', catId: categories[0].id, vars: {}, presets: [], versions: [] }],
    categories: []
  };
  globalThis.__importMode = 'replace';
  confirmImport();
  assertEqual(prompts.length, 1);
  assertEqual(prompts[0].name, 'Only prompt');
});

test('confirmImport in merge mode adds new categories and merges prompts', function () {
  pendingImportData = {
    prompts: [{ id: 9002, name: 'Merged-in prompt', template: 'hi', lastEdited: 999 }],
    categories: [{ id: 'cat_imported', name: 'Imported Cat', color: 'teal' }]
  };
  const beforeCount = prompts.length;
  globalThis.__importMode = 'merge';
  confirmImport();
  assertEqual(prompts.length, beforeCount + 1);
  assertTrue(categories.some(c => c.id === 'cat_imported'));
});

test('confirmImport closes the modal and clears pendingImportData', function () {
  pendingImportData = { prompts: [{ id: 9003, name: 'X', template: 'hi', lastEdited: 1 }], categories: [] };
  globalThis.__importMode = 'merge';
  confirmImport();
  assertEqual(pendingImportData, null);
});
