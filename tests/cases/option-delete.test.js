// Per-option delete: the ✕ on an option pill removes that option.

function makeOptionPrompt() {
  const p = makeUnlockedPrompt();
  p.template = '{{tone}}';
  p.vars = { tone: { type: 'option', options: ['Formal', 'Casual', 'Playful'], selected: 'Casual', value: '' } };
  prompts = [p]; activeId = p.id;
  return p;
}

test('deleteOption removes only the given option', function () {
  const p = makeOptionPrompt();
  deleteOption(p.id, 'tone', 'Formal');
  assertDeepEqual(p.vars.tone.options, ['Casual', 'Playful']);
  assertEqual(p.vars.tone.selected, 'Casual');
});

test('deleting the selected option selects the first remaining one', function () {
  const p = makeOptionPrompt();
  deleteOption(p.id, 'tone', 'Casual');
  assertDeepEqual(p.vars.tone.options, ['Formal', 'Playful']);
  assertEqual(p.vars.tone.selected, 'Formal');
});

test('deleteOption refuses to remove the last remaining option', function () {
  const p = makeOptionPrompt();
  p.vars.tone.options = ['Only']; p.vars.tone.selected = 'Only';
  deleteOption(p.id, 'tone', 'Only');
  assertDeepEqual(p.vars.tone.options, ['Only']);
});

test('deleteOption is a no-op on a locked prompt and for an unknown option', function () {
  const p = makeOptionPrompt();
  p.locked = true;
  deleteOption(p.id, 'tone', 'Formal');
  assertEqual(p.vars.tone.options.length, 3);
  p.locked = false;
  deleteOption(p.id, 'tone', 'Nope');
  assertEqual(p.vars.tone.options.length, 3);
});

test('option pills render a delete badge when unlocked with more than one option, and none when locked', function () {
  const p = makeOptionPrompt();
  renderMain();
  assertIncludes(document.getElementById('mainArea').innerHTML, `deleteOption(${p.id},'tone','Formal')`);
  p.locked = true;
  renderMain();
  assertNotIncludes(document.getElementById('mainArea').innerHTML, 'deleteOption(');
});
