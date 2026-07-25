// savePreset / applyPreset / deletePreset / presetMatchesCurrent —
// named snapshots of a prompt's current variable selections.
// makeUnlockedPrompt() is defined in sync-vars.test.js (shared eval scope).

function presetTestPrompt() {
  return makeUnlockedPrompt({
    id: 999101,
    template: 'Write a {{tone}} email about {{topic}}.',
    vars: {
      tone: { type: 'option', options: ['formal', 'casual'], selected: 'formal' },
      topic: { type: 'option', options: ['sales', 'support'], selected: 'sales' }
    },
    presets: [{ name: 'Clear', values: { tone: '', topic: '' } }]
  });
}

test('savePreset captures the current var values under the given name', function () {
  const p = presetTestPrompt();
  globalThis.__promptReturn = 'My preset';
  savePreset(p.id);
  const saved = p.presets.find(x => x.name === 'My preset');
  assertTrue(!!saved, 'preset should have been added');
  assertDeepEqual(saved.values, { tone: 'formal', topic: 'sales' });
});

test('savePreset does nothing when the name prompt is cancelled', function () {
  const p = presetTestPrompt();
  globalThis.__promptReturn = null; // simulates Cancel
  savePreset(p.id);
  assertEqual(p.presets.length, 1, 'only the built-in Clear preset should remain');
});

test('savePreset asks before replacing an existing preset with the same name', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Sales pitch', values: { tone: 'casual', topic: 'sales' } });
  globalThis.__promptReturn = 'Sales pitch';
  globalThis.__confirmReturn = false; // decline the overwrite
  savePreset(p.id);
  const saved = p.presets.find(x => x.name === 'Sales pitch');
  assertEqual(saved.values.tone, 'casual', 'should be unchanged since the overwrite was declined');
});

test('applyPreset sets vars to the preset\'s stored values', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Support formal', values: { tone: 'formal', topic: 'support' } });
  applyPreset(p.id, 'Support formal');
  assertEqual(p.vars.topic.selected, 'support');
});

test('applying the built-in Clear preset resets every var to blank', function () {
  const p = presetTestPrompt();
  applyPreset(p.id, 'Clear');
  assertEqual(p.vars.tone.selected, '');
  assertEqual(p.vars.topic.selected, '');
});

test('deletePreset removes it from the list', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  deletePreset(p.id, 'Temp');
  assertTrue(!p.presets.some(x => x.name === 'Temp'));
});

test('presetMatchesCurrent(Clear) is true only when every var is blank', function () {
  const p = presetTestPrompt();
  const clear = p.presets[0];
  assertFalse(presetMatchesCurrent(p, clear, true), 'tone/topic are still set to formal/sales');
  p.vars.tone.selected = ''; p.vars.topic.selected = '';
  assertTrue(presetMatchesCurrent(p, clear, true));
});

test('presetMatchesCurrent(named preset) compares stored values against live vars', function () {
  const p = presetTestPrompt();
  const preset = { name: 'Support formal', values: { tone: 'formal', topic: 'support' } };
  assertFalse(presetMatchesCurrent(p, preset, false), 'topic is sales, not support');
  p.vars.topic.selected = 'support';
  assertTrue(presetMatchesCurrent(p, preset, false));
});

test('renamePreset renames a preset to the prompted value', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  globalThis.__promptReturn = 'Sales pitch';
  renamePreset(p.id, 'Temp');
  assertFalse(p.presets.some(x => x.name === 'Temp'));
  assertTrue(p.presets.some(x => x.name === 'Sales pitch'));
});

test('renamePreset does nothing when the rename prompt is cancelled', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  globalThis.__promptReturn = null; // simulates Cancel
  renamePreset(p.id, 'Temp');
  assertTrue(p.presets.some(x => x.name === 'Temp'), 'name should be unchanged');
});

test('renamePreset does nothing for a blank or unchanged name', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  globalThis.__promptReturn = '   ';
  renamePreset(p.id, 'Temp');
  assertTrue(p.presets.some(x => x.name === 'Temp'));
  globalThis.__promptReturn = 'Temp';
  renamePreset(p.id, 'Temp');
  assertTrue(p.presets.some(x => x.name === 'Temp'));
});

test('renamePreset rejects a name that collides with another preset, case-insensitively', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Sales pitch', values: { tone: 'casual', topic: 'sales' } });
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  globalThis.__promptReturn = 'SALES PITCH';
  renamePreset(p.id, 'Temp');
  assertTrue(p.presets.some(x => x.name === 'Temp'), 'the rename should have been rejected');
});

test('renamePreset refuses to rename the built-in Clear preset', function () {
  const p = presetTestPrompt();
  globalThis.__promptReturn = 'Not Clear';
  renamePreset(p.id, 'Clear');
  assertTrue(p.presets.some(x => x.name === 'Clear'), 'Clear should be unrenameable');
});
