// addCategory / deleteCategory — category CRUD from the category manager modal.

test('addCategory adds a category using the input field value and chosen color', function () {
  document.getElementById('newCatInput').value = 'Legal';
  newCatColor = 'coral';
  const before = categories.length;
  addCategory();
  assertEqual(categories.length, before + 1);
  const added = categories[categories.length - 1];
  assertEqual(added.name, 'Legal');
  assertEqual(added.color, 'coral');
});

test('addCategory rejects a duplicate name case-insensitively', function () {
  document.getElementById('newCatInput').value = categories[0].name.toUpperCase();
  const before = categories.length;
  addCategory();
  assertEqual(categories.length, before, 'no category should have been added');
});

test('addCategory does nothing for a blank/whitespace-only name', function () {
  document.getElementById('newCatInput').value = '   ';
  const before = categories.length;
  addCategory();
  assertEqual(categories.length, before);
});

test('deleteCategory refuses to delete a category still in use by a prompt', function () {
  const catId = prompts[0].catId;
  const before = categories.length;
  globalThis.__confirmReturn = true;
  deleteCategory(catId);
  assertEqual(categories.length, before, 'category in use should not be deleted');
});

test('deleteCategory removes a category with no prompts assigned, after confirmation', function () {
  categories.push({ id: 'cat_unused', name: 'Unused', color: 'blue' });
  globalThis.__confirmReturn = true;
  deleteCategory('cat_unused');
  assertFalse(categories.some(c => c.id === 'cat_unused'));
});

test('deleteCategory does nothing when the confirmation is declined', function () {
  categories.push({ id: 'cat_unused2', name: 'Unused2', color: 'blue' });
  globalThis.__confirmReturn = false;
  deleteCategory('cat_unused2');
  assertTrue(categories.some(c => c.id === 'cat_unused2'));
});

test('deleting the currently active filter category clears the filter', function () {
  categories.push({ id: 'cat_unused3', name: 'Unused3', color: 'blue' });
  filterCatId = 'cat_unused3';
  globalThis.__confirmReturn = true;
  deleteCategory('cat_unused3');
  assertEqual(filterCatId, null);
});

test('deleteCategory offers an undo via the toast, which restores the category at its original position and re-applies the filter', function () {
  categories.push({ id: 'cat_unused4', name: 'Unused4', color: 'blue' });
  const idx = categories.findIndex(c => c.id === 'cat_unused4');
  filterCatId = 'cat_unused4';
  globalThis.__confirmReturn = true;
  deleteCategory('cat_unused4');
  assertFalse(categories.some(c => c.id === 'cat_unused4'));
  assertEqual(filterCatId, null);
  assertTrue(typeof toastUndoAction === 'function');
  triggerToastUndo();
  assertTrue(categories.some(c => c.id === 'cat_unused4'), 'the category should be back after undo');
  assertEqual(categories.findIndex(c => c.id === 'cat_unused4'), idx, 'it should be reinserted at its original position');
  assertEqual(filterCatId, 'cat_unused4', 'the filter that was cleared by the delete should be re-applied');
  assertFalse(deletedCategoryIds.some(x => x.id === 'cat_unused4'), 'the tombstone should be cleared on undo');
});
