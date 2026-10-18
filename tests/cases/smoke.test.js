// Sanity check that the harness can eval the app and call real functions.
test('smoke: default prompts load and render without crashing', function () {
  assertTrue(prompts.length > 0, 'DEFAULT_PROMPTS should have loaded');
  assertEqual(activeId, prompts[0].id);
  render();
  assertTrue(true);
});

// ── Keyboard shortcuts dialog (data-driven) ──────────────────────────────────

test('shortcutGroups lists every group with rows of [label, keys]', function () {
  const groups = shortcutGroups();
  assertTrue(groups.length >= 3);
  groups.forEach(g => {
    assertTrue(!!g.id && !!g.label && !!g.icon, 'group needs id/label/icon');
    assertTrue(g.rows.length > 0, g.id + ' has no rows');
    g.rows.forEach(([label, keys]) => { assertTrue(typeof label === 'string' && Array.isArray(keys) && keys.length > 0, label); });
  });
});

test('shortcut keys use the platform modifier (⌘ on Mac, Ctrl elsewhere)', function () {
  const keysFor = ua => { navigator.userAgent = ua; return shortcutGroups().flatMap(g => g.rows).map(r => r[1].join(' ')).join(' | '); };
  const mac = keysFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  assertIncludes(mac, '⌘'); assertIncludes(mac, '⇧'); assertNotIncludes(mac, 'Ctrl');
  const win = keysFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  assertIncludes(win, 'Ctrl'); assertIncludes(win, 'Shift'); assertNotIncludes(win, '⌘');
});

test('renderShortcutsDialog builds a tab and a pane for every group', function () {
  renderShortcutsDialog();
  const nav = document.getElementById('scNav').innerHTML, panes = document.getElementById('scPanes').innerHTML;
  shortcutGroups().forEach(g => { assertIncludes(nav, `id="scTab-${g.id}"`); assertIncludes(panes, `id="scPane-${g.id}"`); });
  assertIncludes(panes, 'sc-row');
});

test('scSearch lists only matching shortcuts and says so when nothing matches', function () {
  renderShortcutsDialog();
  scSearch('sidebar');
  const html = document.getElementById('scPane-search').innerHTML;
  assertIncludes(html, '<mark>');
  assertIncludes(html, 'sidebar');
  assertNotIncludes(html, 'Focus the search field');
  scSearch('zzzqqq');
  assertIncludes(document.getElementById('scPane-search').innerHTML, 'No shortcut matches');
});

test('every Help topic has a label', function () {
  HELP_TABS.forEach(t => assertTrue(!!HELP_TAB_LABELS[t], t));
});

test('openHelp / openShortcuts / openAbout open their dialogs and the close functions close them', function () {
  openHelp(); assertTrue(document.getElementById('helpModalBg').classList.contains('open'));
  closeHelp(); assertFalse(document.getElementById('helpModalBg').classList.contains('open'));
  openShortcuts(); assertTrue(document.getElementById('shortcutsModalBg').classList.contains('open'));
  closeShortcuts(); assertFalse(document.getElementById('shortcutsModalBg').classList.contains('open'));
  openAbout(); assertTrue(document.getElementById('aboutModalBg').classList.contains('open'));
  closeAbout(); assertFalse(document.getElementById('aboutModalBg').classList.contains('open'));
});
