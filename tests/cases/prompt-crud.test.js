// newPrompt / deletePrompt / clonePrompt / toggleFav.

test('newPrompt creates an unlocked prompt and makes it active', function () {
  const before = prompts.length;
  newPrompt();
  assertEqual(prompts.length, before + 1);
  assertEqual(activeId, prompts[0].id);
  assertFalse(!!prompts[0].locked);
});

test('newPrompt defaults the category to the current category filter, when set', function () {
  filterCatId = categories[1].id;
  newPrompt();
  assertEqual(prompts[0].catId, categories[1].id);
});

test('newPrompt disambiguates the default name so repeated clicks don\'t collide', function () {
  newPrompt();
  assertEqual(prompts[0].name, 'New Prompt');
  newPrompt();
  assertEqual(prompts[0].name, 'New Prompt 2');
  newPrompt();
  assertEqual(prompts[0].name, 'New Prompt 3');
});

test('uniqueName is case-insensitive and fills the first free numeric suffix', function () {
  makeUnlockedPrompt({ id: 7101, name: 'Draft' });
  makeUnlockedPrompt({ id: 7102, name: 'draft 2' }); // different case, still counts as taken
  assertEqual(uniqueName('Draft'), 'Draft 3');
  assertEqual(uniqueName('Something else'), 'Something else');
});

test('updateName rejects an exact duplicate (case-insensitive) of another prompt, leaving the name unchanged', function () {
  const a = makeUnlockedPrompt({ id: 7201, name: 'Alpha' });
  const b = makeUnlockedPrompt({ id: 7202, name: 'Beta' });
  updateName(b.id, 'ALPHA');
  assertEqual(b.name, 'Beta', 'the rename should have been silently rejected');
  updateName(b.id, 'Gamma');
  assertEqual(b.name, 'Gamma', 'a non-colliding rename should still go through');
});

test('deletePrompt removes the prompt after confirmation', function () {
  const p = makeUnlockedPrompt();
  const before = prompts.length;
  globalThis.__confirmReturn = true;
  deletePrompt(p.id);
  assertEqual(prompts.length, before - 1);
  assertFalse(prompts.some(x => x.id === p.id));
});

test('deletePrompt does nothing when the confirmation is declined', function () {
  const p = makeUnlockedPrompt();
  const before = prompts.length;
  globalThis.__confirmReturn = false;
  deletePrompt(p.id);
  assertEqual(prompts.length, before);
});

test('deletePrompt falls back to the next prompt as active, or null if none remain', function () {
  prompts = [{ id: 1, name: 'Only', catId: categories[0].id, template: 't', vars: {}, presets: [], versions: [] }];
  globalThis.__confirmReturn = true;
  deletePrompt(1);
  assertEqual(activeId, null);
});

test('deletePrompt offers an undo via the toast, which restores the prompt at its original position', function () {
  const p = makeUnlockedPrompt({ name: 'Undo me' });
  const idx = prompts.findIndex(x => x.id === p.id);
  const before = prompts.map(x => x.id);
  globalThis.__confirmReturn = true;
  deletePrompt(p.id);
  assertFalse(prompts.some(x => x.id === p.id));
  assertTrue(typeof toastUndoAction === 'function', 'the toast should carry an undo action');
  triggerToastUndo();
  assertTrue(prompts.some(x => x.id === p.id), 'the prompt should be back after undo');
  assertEqual(prompts.findIndex(x => x.id === p.id), idx, 'it should be reinserted at its original position');
  assertDeepEqual(prompts.map(x => x.id), before, 'the full ordering should match the pre-delete state');
  assertEqual(activeId, p.id, 'the restored prompt should become active');
  assertFalse(deletedPromptIds.some(x => x.id === p.id), 'the tombstone should be cleared on undo');
});

test('clonePrompt duplicates the prompt with a new id and "(copy)" suffix', function () {
  const src = prompts[0];
  const before = prompts.length;
  clonePrompt(src.id);
  assertEqual(prompts.length, before + 1);
  const clone = prompts[0];
  assertTrue(clone.id !== src.id);
  assertEqual(clone.name, src.name + ' (copy)');
  assertEqual(activeId, clone.id);
});

test('clonePrompt disambiguates the suffix when cloning the same prompt twice', function () {
  const src = makeUnlockedPrompt({ id: 7301, name: 'Twice cloned' });
  clonePrompt(src.id);
  clonePrompt(src.id);
  assertEqual(prompts[0].name, 'Twice cloned (copy) 2');
  assertTrue(prompts.some(p => p.name === 'Twice cloned (copy)'), 'the first clone should keep its plain suffix');
});

test('clonePrompt resets favorite on the clone even if the source was favorited', function () {
  const src = prompts.find(p => p.favorite) || prompts[0];
  src.favorite = true;
  clonePrompt(src.id);
  assertFalse(prompts[0].favorite);
});

test('toggleFav flips the favorite flag on the given prompt', function () {
  const p = prompts[0];
  const before = p.favorite;
  toggleFav({ stopPropagation() {} }, p.id);
  assertEqual(p.favorite, !before);
});
