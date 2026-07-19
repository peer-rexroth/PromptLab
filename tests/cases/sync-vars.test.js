// syncVars() — re-detects vars from the current template while preserving
// existing var configuration, and snapshots the pre-edit template first
// (see version-history.test.js for the snapshot side of this).

function makeUnlockedPrompt(overrides) {
  const p = Object.assign({
    id: 999001, name: 'Test prompt', catId: categories[0].id, favorite: false, locked: false,
    template: 'Write a {{tone}} email.',
    vars: { tone: { type: 'option', options: ['formal', 'casual'], selected: 'casual' } },
    presets: [], versions: [], lastEdited: Date.now()
  }, overrides || {});
  prompts.unshift(p);
  activeId = p.id;
  return p;
}

test('syncVars adds a newly-typed variable to p.vars', function () {
  const p = makeUnlockedPrompt();
  p.template = 'Write a {{tone}} email about {{topic}}.';
  syncVars(p.id);
  assertTrue('topic' in p.vars, 'topic should be detected after Sync');
});

test('syncVars removes a variable no longer referenced in the template', function () {
  const p = makeUnlockedPrompt();
  p.template = 'Just plain text now, no vars.';
  syncVars(p.id);
  assertDeepEqual(Object.keys(p.vars), []);
});

test('syncVars preserves the existing selection for a variable still present', function () {
  const p = makeUnlockedPrompt();
  p.template = 'Write a {{tone}} email, make it {{tone}} in style.'; // same var, still {{}}
  syncVars(p.id);
  assertEqual(p.vars.tone.selected, 'casual');
});

test('syncVars updates lastEdited', function () {
  const p = makeUnlockedPrompt({ lastEdited: 1 });
  syncVars(p.id);
  assertTrue(p.lastEdited > 1);
});
