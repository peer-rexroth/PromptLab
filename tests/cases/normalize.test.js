// normalizePrompts() — the reusable schema-migration step, and its wiring
// into every place that assigns prompts/categories from an external source
// (import in both modes, and the three File System Access sync paths).

test('normalizePrompts backfills a missing vars object entirely (not just missing types)', function () {
  prompts.push({ id: 1, name: 'No vars field at all', catId: categories[0].id, template: 'plain' });
  normalizePrompts();
  assertDeepEqual(prompts.find(p => p.id === 1).vars, {});
});

test('normalizePrompts reassigns a prompt with an orphaned catId to the first available category', function () {
  prompts.push({ id: 1, name: 'Orphaned', catId: 'does-not-exist', template: 'plain', vars: {} });
  normalizePrompts();
  assertEqual(prompts.find(p => p.id === 1).catId, categories[0].id);
});

test('normalizePrompts leaves a valid catId untouched', function () {
  const catId = categories[1].id;
  prompts.push({ id: 1, name: 'Valid cat', catId, template: 'plain', vars: {} });
  normalizePrompts();
  assertEqual(prompts.find(p => p.id === 1).catId, catId);
});

test('confirmImport replace mode normalizes the incoming prompts (missing presets/versions/locked backfilled)', function () {
  pendingImportData = {
    prompts: [{ id: 9001, name: 'Bare import', template: '{{tone}}', catId: categories[0].id, vars: { tone: { options: ['a'], selected: 'a' } } }],
    categories: []
  };
  globalThis.__importMode = 'replace';
  confirmImport();
  const p = prompts[0];
  assertEqual(p.locked, false);
  assertDeepEqual(p.versions, []);
  assertEqual(p.vars.tone.type, 'option', 'var type should have been backfilled');
  assertEqual(p.presets[0].name, 'Clear', 'a Clear preset should have been generated for the var');
});

test('confirmImport replace mode downloads a backup of the previous library before overwriting', function () {
  globalThis.__lastBlob = null;
  pendingImportData = { prompts: [{ id: 9002, name: 'New', template: 'hi', catId: categories[0].id, vars: {}, presets: [], versions: [] }], categories: [] };
  globalThis.__importMode = 'replace';
  const beforeCount = prompts.length;
  confirmImport();
  assertTrue(!!globalThis.__lastBlob, 'a backup Blob should have been created');
  const backup = JSON.parse(globalThis.__lastBlob.parts[0]);
  assertEqual(backup.prompts.length, beforeCount, 'the backup should contain the library as it was before the replace');
});

test('confirmImport merge mode normalizes newly-added prompts', function () {
  pendingImportData = {
    prompts: [{ id: 9003, name: 'Bare merge', template: 'plain', lastEdited: 999 }],
    categories: []
  };
  globalThis.__importMode = 'merge';
  confirmImport();
  const p = prompts.find(x => x.name === 'Bare merge');
  assertEqual(p.locked, false);
  assertDeepEqual(p.versions, []);
});

test('linkFile merging an external library normalizes the result', async function () {
  const externalJson = JSON.stringify({
    prompts: [{ id: 7001, name: 'From linked file', template: 'plain', lastEdited: 999 }],
    categories: []
  });
  globalThis.window.showOpenFilePicker = async () => [{
    requestPermission: async () => 'granted',
    queryPermission: async () => 'granted',
    getFile: async () => ({ text: async () => externalJson })
  }];
  await linkFile();
  const p = prompts.find(x => x.name === 'From linked file');
  assertTrue(!!p, 'the linked prompt should have been merged in');
  assertEqual(p.locked, false);
  assertDeepEqual(p.versions, []);
});

test('reconnectFile normalizes prompts adopted from the reconnected file', async function () {
  const oldSchemaJson = JSON.stringify({
    prompts: [{ id: 1, name: 'From reconnect', template: '{{tone}}', catId: 'other', vars: { tone: { options: ['a'], selected: 'a' } } }],
    categories: DEFAULT_CATS
  });
  fileHandle = {
    name: 'test.json',
    requestPermission: async () => 'granted',
    getFile: async () => ({ text: async () => oldSchemaJson })
  };
  await reconnectFile();
  const p = prompts.find(x => x.name === 'From reconnect');
  assertTrue(!!p, 'the reconnected prompt should have been merged in');
  assertEqual(p.locked, false);
  assertEqual(p.vars.tone.type, 'option');
  assertEqual(p.presets[0].name, 'Clear');
});

test('reconnectFile does nothing when there is no linked file handle', async function () {
  fileHandle = null;
  const before = JSON.stringify(prompts);
  await reconnectFile();
  assertEqual(JSON.stringify(prompts), before);
});
