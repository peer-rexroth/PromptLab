// detectVars() — parses {{}}/[[]]/(()) placeholders from a template string.

test('detects an option ({{}}) variable with a default option', function () {
  const vars = detectVars('Write a {{tone}} email.', {});
  assertEqual(vars.tone.type, 'option');
  assertDeepEqual(vars.tone.options, ['Option 1']);
  assertEqual(vars.tone.selected, 'Option 1');
});

test('detects an instruction ([[]]) variable defaulting to no selection', function () {
  const vars = detectVars('Cover: [[topics]]', {});
  assertEqual(vars.topics.type, 'instruction');
  assertDeepEqual(vars.topics.selected, []);
});

test('detects a free-text (()) variable defaulting to empty string', function () {
  const vars = detectVars('Input: ((source_text))', {});
  assertEqual(vars.source_text.type, 'text');
  assertEqual(vars.source_text.value, '');
});

test('detects all three types together, each keyed by its own name', function () {
  const vars = detectVars('{{tone}} about [[topics]] using ((notes))', {});
  assertDeepEqual(Object.keys(vars).sort(), ['notes', 'tone', 'topics']);
});

test('preserves an existing var config for a name still present in the template', function () {
  const existing = { tone: { type: 'option', options: ['formal', 'casual'], selected: 'casual' } };
  const vars = detectVars('Write a {{tone}} email.', existing);
  assertEqual(vars.tone.selected, 'casual', 'should keep the user\'s prior selection, not reset to the placeholder default');
  assertDeepEqual(vars.tone.options, ['formal', 'casual']);
});

test('does not reuse an existing config when the type changed at the same name', function () {
  // {{tone}} became [[tone]] — the old option-type config should not carry over as-is.
  const existing = { tone: { type: 'option', options: ['formal'], selected: 'formal' } };
  const vars = detectVars('Cover: [[tone]]', existing);
  assertEqual(vars.tone.type, 'instruction');
  assertDeepEqual(vars.tone.selected, []);
});

test('a var no longer referenced in the template is dropped', function () {
  const existing = { tone: { type: 'option', options: ['formal'], selected: 'formal' }, topic: { type: 'option', options: ['x'], selected: 'x' } };
  const vars = detectVars('Just about {{topic}} now.', existing);
  assertDeepEqual(Object.keys(vars), ['topic']);
});

test('escaped placeholders (\\{{name}}) are not detected as variables', function () {
  const vars = detectVars('Literal \\{{tone}} but real {{topic}}.', {});
  assertDeepEqual(Object.keys(vars), ['topic']);
});

test('a name appearing twice in the template only produces one variable', function () {
  const vars = detectVars('{{tone}} intro, {{tone}} again.', {});
  assertEqual(Object.keys(vars).length, 1);
});
