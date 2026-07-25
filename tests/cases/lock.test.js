// toggleLock() and the locked-prompt edit guards.
// makeUnlockedPrompt() is defined in sync-vars.test.js (shared eval scope).

test('toggleLock flips the locked flag', function () {
  const p = makeUnlockedPrompt({ locked: false });
  toggleLock(p.id);
  assertTrue(p.locked);
  toggleLock(p.id);
  assertFalse(p.locked);
});

test('updateName is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({ locked: true, name: 'Original' });
  updateName(p.id, 'Changed');
  assertEqual(p.name, 'Original');
});

test('updateCat is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({ locked: true, catId: categories[0].id });
  updateCat(p.id, categories[1].id);
  assertEqual(p.catId, categories[0].id);
});

test('deletePrompt is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({ locked: true });
  const before = prompts.length;
  globalThis.__confirmReturn = true;
  deletePrompt(p.id);
  assertEqual(prompts.length, before);
  assertTrue(prompts.some(x => x.id === p.id));
  assertFalse(deletedPromptIds.some(x => x.id === p.id));
});

test('a default bundled prompt loads locked', function () {
  // CLAUDE.md: "The bundled default prompts are locked on first load."
  assertTrue(prompts[0].locked);
});

test('updateTextVar still works on a locked prompt', function () {
  const p = makeUnlockedPrompt({
    locked: true, template: 'Hello ((name)).',
    vars: { name: { type: 'text', value: '' } }
  });
  updateTextVar(p.id, 'name', 'Ada');
  assertEqual(p.vars.name.value, 'Ada');
});

test('renderMain leaves a locked prompt\'s ((text)) var input editable', function () {
  const p = makeUnlockedPrompt({
    locked: true, template: 'Hello ((name)).',
    vars: { name: { type: 'text', value: '' } }
  });
  renderMain();
  const html = document.getElementById('mainArea').innerHTML;
  const inputStart = html.indexOf('var-text-input');
  const inputTag = html.slice(inputStart, html.indexOf('>', inputStart));
  assertNotIncludes(inputTag, 'readonly', 'text-var input should not be readonly when locked');
  // sanity check: the template textarea is still readonly, as before.
  const taStart = html.indexOf('id="templateArea"');
  const taTag = html.slice(taStart, html.indexOf('>', taStart));
  assertIncludes(taTag, 'readonly', 'template textarea should stay readonly when locked');
});

test('savePreset is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({ locked: true, presets: [{ name: 'Clear', values: { tone: '' } }] });
  globalThis.__promptReturn = 'New preset';
  savePreset(p.id);
  assertEqual(p.presets.length, 1, 'no preset should have been added');
});

test('deletePreset is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({
    locked: true,
    presets: [{ name: 'Clear', values: { tone: '' } }, { name: 'Formal', values: { tone: 'formal' } }]
  });
  deletePreset(p.id, 'Formal');
  assertTrue(p.presets.some(x => x.name === 'Formal'));
});

test('startRenamePreset is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({
    locked: true,
    presets: [{ name: 'Clear', values: { tone: '' } }, { name: 'Formal', values: { tone: 'formal' } }]
  });
  startRenamePreset(p.id, 'Formal');
  assertEqual(renamingPreset, null, 'no rename should have started');
});

test('renderMain hides preset rename/delete/reorder affordances and the Save preset button for a locked prompt', function () {
  const p = makeUnlockedPrompt({
    locked: true,
    presets: [{ name: 'Clear', values: { tone: '' } }, { name: 'Formal', values: { tone: 'formal' } }]
  });
  renderMain();
  const html = document.getElementById('mainArea').innerHTML;
  assertNotIncludes(html, 'preset-chip-del', 'no delete button on a locked prompt\'s presets');
  assertNotIncludes(html, 'startRenamePreset', 'no double-click rename trigger on a locked prompt\'s presets');
  assertNotIncludes(html, 'draggable="true"', 'preset chips should not be draggable on a locked prompt');
  assertNotIncludes(html, 'Save preset', 'no Save preset button on a locked prompt');
});
