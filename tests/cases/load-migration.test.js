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

test('load() ignores a legacy theme in the stored blob (the theme is per-device)', function () {
  setThemeMode('light');
  localStorage.setItem('promptlab-v4', JSON.stringify({
    categories: DEFAULT_CATS, prompts: DEFAULT_PROMPTS, theme: 'dark'
  }));
  load();
  assertEqual(currentTheme, 'light');
  assertEqual(document.documentElement.getAttribute('data-theme'), 'light');
});

// ── Bundled defaults: Create performance feedback ────────────────────────────

test('the bundled defaults include "Create performance feedback", locked, in an existing category', function () {
  const d = DEFAULT_PROMPTS.find(p => p.name === 'Create performance feedback');
  assertTrue(!!d, 'bundled prompt missing');
  assertTrue(d.locked, 'bundled prompts load locked');
  assertTrue(DEFAULT_CATS.some(c => c.id === d.catId), 'its category must exist in DEFAULT_CATS');
  assertEqual(d.favorite, false);
  assertDeepEqual(d.versions, []);
});

test('every placeholder in the bundled performance-feedback template has a matching variable of the same type, and vice versa', function () {
  const d = DEFAULT_PROMPTS.find(p => p.name === 'Create performance feedback');
  const detected = detectVars(d.template, {});
  assertDeepEqual(Object.keys(detected).sort(), Object.keys(d.vars).sort());
  Object.keys(detected).forEach(k => assertEqual(detected[k].type, d.vars[k].type, 'type of ' + k));
});

test('the bundled performance-feedback presets only touch real option variables and Clear lists every variable', function () {
  const d = DEFAULT_PROMPTS.find(p => p.name === 'Create performance feedback');
  assertEqual(d.presets[0].name, 'Clear');
  assertDeepEqual(Object.keys(d.presets[0].values).sort(), Object.keys(d.vars).sort());
  d.presets.slice(1).forEach(pr => {
    Object.keys(pr.values).forEach(k => {
      assertTrue(!!d.vars[k], pr.name + ': unknown variable ' + k);
      assertTrue(d.vars[k].type !== 'text', pr.name + ': text variable ' + k + ' must not be stored in a preset');
      if (pr.values[k] !== '') assertTrue(d.vars[k].options.includes(pr.values[k]), pr.name + ': ' + k + ' value is not one of its options');
    });
  });
});

test('a fresh install loads the performance-feedback prompt and renders it', function () {
  localStorage.clear();
  load();
  const p = prompts.find(x => x.name === 'Create performance feedback');
  assertTrue(!!p);
  activeId = p.id;
  renderMain();
  assertIncludes(document.getElementById('mainArea').innerHTML, 'Create performance feedback');
});
