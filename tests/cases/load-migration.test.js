// load() — reading + migrating localStorage["promptlab-v4"] on startup.

test('load() with no stored data seeds the bundled defaults', function () {
  localStorage.clear();
  load();
  assertEqual(prompts.length, DEFAULT_PROMPTS.length);
  assertEqual(categories.length, DEFAULT_CATS.length);
  assertEqual(activeId, prompts[0].id);
});

test('load() falls back to defaults when localStorage holds corrupted JSON', function () {
  localStorage.setItem(STORAGE_KEY, '{not valid json');
  load();
  assertEqual(prompts.length, DEFAULT_PROMPTS.length);
});

test('load() migrates an old tag-based prompt to a category id', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS,
    prompts: [{ id: 1, name: 'Legacy', tag: 'Marketing', template: 'hi' }]
  }));
  load();
  assertEqual(prompts[0].catId, 'marketing');
});

test('load() backfills favorite/locked/presets/versions/lastEdited on an old-schema prompt', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS,
    prompts: [{ id: 1, name: 'Bare', catId: 'other', template: 'hi' }]
  }));
  load();
  const p = prompts[0];
  assertEqual(p.favorite, false);
  assertEqual(p.locked, false);
  assertDeepEqual(p.versions, []);
  assertTrue(typeof p.lastEdited === 'number' && p.lastEdited > 0);
});

test('load() backfills a missing "type" on an old-schema var to "option"', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS,
    prompts: [{
      id: 1, name: 'Typeless var', catId: 'other', template: '{{tone}}',
      vars: { tone: { options: ['a', 'b'], selected: 'a' } }
    }]
  }));
  load();
  assertEqual(prompts[0].vars.tone.type, 'option');
});

test('load() inserts a built-in Clear preset when a prompt has vars but no presets', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS,
    prompts: [{
      id: 1, name: 'Needs a Clear preset', catId: 'other', template: '{{tone}}',
      vars: { tone: { type: 'option', options: ['a'], selected: 'a' } }, presets: []
    }]
  }));
  load();
  assertEqual(prompts[0].presets[0].name, 'Clear');
  assertDeepEqual(prompts[0].presets[0].values, { tone: '' });
});

test('load() does not add a Clear preset to a prompt with no vars', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS,
    prompts: [{ id: 1, name: 'No vars', catId: 'other', template: 'plain', vars: {}, presets: [] }]
  }));
  load();
  assertDeepEqual(prompts[0].presets, []);
});

test('load() restores the persisted theme and applies it to the document', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS, prompts: DEFAULT_PROMPTS, theme: 'dark'
  }));
  load();
  assertEqual(currentTheme, 'dark');
  assertEqual(document.documentElement.getAttribute('data-theme'), 'dark');
});
