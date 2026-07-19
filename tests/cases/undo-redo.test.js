// undoTemplate / redoTemplate / applyTemplateUndo — per-prompt undo stacks.
// updateTemplate() only pushes onto the stack inside a 1s debounce timer
// (see CLAUDE.md "Undo / redo"), and the harness's setTimeout is a
// deliberate no-op (see harness.js), so the debounce itself never fires in
// tests. These tests instead seed the stack directly — the same state
// updateTemplate's debounce would have produced — and exercise the real
// undo/redo/apply functions on it.
// makeUnlockedPrompt() is defined in sync-vars.test.js (shared eval scope).

test('updateTemplate updates the template synchronously, independent of the debounce', function () {
  const p = makeUnlockedPrompt();
  updateTemplate(p.id, 'A brand new template with {{tone}}.');
  assertEqual(p.template, 'A brand new template with {{tone}}.');
});

test('updateTemplate is a no-op on a locked prompt', function () {
  const p = makeUnlockedPrompt({ locked: true, template: 'original' });
  updateTemplate(p.id, 'changed');
  assertEqual(p.template, 'original');
});

test('undoTemplate pops the most recent past entry and applies it', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  getUndoStack(p.id).past.push('older text', 'previous text');
  undoTemplate(p.id);
  assertEqual(p.template, 'previous text');
  assertDeepEqual(getUndoStack(p.id).past, ['older text']);
});

test('undoTemplate pushes the pre-undo template onto the future stack', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  getUndoStack(p.id).past.push('previous text');
  undoTemplate(p.id);
  assertDeepEqual(getUndoStack(p.id).future, ['current text']);
});

test('undoTemplate does nothing when the past stack is empty', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  undoTemplate(p.id);
  assertEqual(p.template, 'current text');
});

test('redoTemplate pops the most recent future entry and applies it', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  getUndoStack(p.id).future.push('newer text');
  redoTemplate(p.id);
  assertEqual(p.template, 'newer text');
  assertDeepEqual(getUndoStack(p.id).future, []);
});

test('redoTemplate pushes the pre-redo template onto the past stack', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  getUndoStack(p.id).future.push('newer text');
  redoTemplate(p.id);
  assertDeepEqual(getUndoStack(p.id).past, ['current text']);
});

test('undo then redo round-trips back to the pre-undo template', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  getUndoStack(p.id).past.push('previous text');
  undoTemplate(p.id);
  redoTemplate(p.id);
  assertEqual(p.template, 'current text');
});

test('undoTemplate caps the future stack at 50, dropping the oldest', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  const s = getUndoStack(p.id);
  s.past.push('previous text');
  for (let i = 0; i < 50; i++) s.future.push('f' + i);
  undoTemplate(p.id);
  assertEqual(s.future.length, 50);
  assertEqual(s.future[0], 'f1', 'oldest future entry (f0) should have been dropped to make room');
  assertEqual(s.future[49], 'current text');
});

test('redoTemplate caps the past stack at 50, dropping the oldest', function () {
  const p = makeUnlockedPrompt({ template: 'current text' });
  const s = getUndoStack(p.id);
  s.future.push('next text');
  for (let i = 0; i < 50; i++) s.past.push('p' + i);
  redoTemplate(p.id);
  assertEqual(s.past.length, 50);
  assertEqual(s.past[0], 'p1', 'oldest past entry (p0) should have been dropped to make room');
  assertEqual(s.past[49], 'current text');
});
