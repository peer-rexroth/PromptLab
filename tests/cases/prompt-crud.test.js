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

test('deletePrompt removes the prompt after confirmation', function () {
  const id = prompts[0].id;
  const before = prompts.length;
  globalThis.__confirmReturn = true;
  deletePrompt(id);
  assertEqual(prompts.length, before - 1);
  assertFalse(prompts.some(p => p.id === id));
});

test('deletePrompt does nothing when the confirmation is declined', function () {
  const before = prompts.length;
  globalThis.__confirmReturn = false;
  deletePrompt(prompts[0].id);
  assertEqual(prompts.length, before);
});

test('deletePrompt falls back to the next prompt as active, or null if none remain', function () {
  prompts = [{ id: 1, name: 'Only', catId: categories[0].id, template: 't', vars: {}, presets: [], versions: [] }];
  globalThis.__confirmReturn = true;
  deletePrompt(1);
  assertEqual(activeId, null);
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
