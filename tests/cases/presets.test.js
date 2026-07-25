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

test('startRenamePreset marks the chip as renaming, but refuses the built-in Clear preset', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  assertDeepEqual(renamingPreset, { promptId: p.id, name: 'Temp' });
  startRenamePreset(p.id, 'Clear');
  assertDeepEqual(renamingPreset, { promptId: p.id, name: 'Temp' }, 'Clear should not become renamable');
});

test('commitRenamePreset renames the preset to the given value (double-click + inline edit, not a dialog)', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  commitRenamePreset(p.id, 'Temp', 'Sales pitch');
  assertFalse(p.presets.some(x => x.name === 'Temp'));
  assertTrue(p.presets.some(x => x.name === 'Sales pitch'));
  assertEqual(renamingPreset, null, 'renaming state should be cleared after commit');
});

test('commitRenamePreset does nothing for a blank or unchanged value', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  commitRenamePreset(p.id, 'Temp', '   ');
  assertTrue(p.presets.some(x => x.name === 'Temp'));
  startRenamePreset(p.id, 'Temp');
  commitRenamePreset(p.id, 'Temp', 'Temp');
  assertTrue(p.presets.some(x => x.name === 'Temp'));
});

test('commitRenamePreset rejects a value that collides with another preset, case-insensitively', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Sales pitch', values: { tone: 'casual', topic: 'sales' } });
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  commitRenamePreset(p.id, 'Temp', 'SALES PITCH');
  assertTrue(p.presets.some(x => x.name === 'Temp'), 'the rename should have been rejected');
});

test('cancelRenamePreset clears the renaming state without touching the preset', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  cancelRenamePreset();
  assertEqual(renamingPreset, null);
  assertTrue(p.presets.some(x => x.name === 'Temp'));
});

test('commitRenamePreset is a no-op once cancelRenamePreset already cleared the state (Escape-then-blur race)', function () {
  const p = presetTestPrompt();
  p.presets.push({ name: 'Temp', values: { tone: 'formal', topic: 'sales' } });
  startRenamePreset(p.id, 'Temp');
  cancelRenamePreset(); // simulates Escape firing before the input's blur event
  commitRenamePreset(p.id, 'Temp', 'Sales pitch'); // the blur handler still fires afterward
  assertTrue(p.presets.some(x => x.name === 'Temp'), 'the stale commit should not have applied');
  assertFalse(p.presets.some(x => x.name === 'Sales pitch'));
});
