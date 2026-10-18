// Appearance: light/dark/auto theme and the two text sizes. The app has one look (Glass, set as
// <html data-scheme="glass"> in the markup). The theme is a per-device preference (localStorage only);
// the text size also travels in the saved blob / linked file.

test('setThemeMode light/dark sets state, the attribute and localStorage', function () {
  setThemeMode('dark');
  assertEqual(themePref, 'dark');
  assertEqual(currentTheme, 'dark');
  assertEqual(document.documentElement.getAttribute('data-theme'), 'dark');
  assertEqual(localStorage.getItem('promptlab-theme'), 'dark');
  setThemeMode('light');
  assertEqual(document.documentElement.getAttribute('data-theme'), 'light');
});

test('setThemeMode auto follows the system setting', function () {
  window.matchMedia = function () { return { matches: true }; };
  setThemeMode('auto');
  assertEqual(themePref, 'auto');
  assertEqual(currentTheme, 'dark');
  window.matchMedia = function () { return { matches: false }; };
  applyTheme();
  assertEqual(currentTheme, 'light');
});

test('setThemeMode treats an unknown mode as auto', function () {
  setThemeMode('sepia');
  assertEqual(themePref, 'auto');
});

test('the theme is not written into the saved blob', function () {
  setThemeMode('dark');
  save();
  assertEqual(JSON.parse(localStorage.getItem('promptlab-v4')).theme, undefined);
  assertEqual(JSON.parse(localStorage.getItem('promptlab-v4')).colorScheme, undefined);
});

test('clampUiScale snaps any value to Medium (100) or Large (115)', function () {
  assertEqual(clampUiScale(100), 100);
  assertEqual(clampUiScale(115), 115);
  assertEqual(clampUiScale(90), 100);
  assertEqual(clampUiScale(130), 115);
  assertEqual(clampUiScale('abc'), 100);
});

test('setUiScale updates state, zoom, localStorage and the saved blob', function () {
  setUiScale(115);
  assertEqual(uiScale, 115);
  assertEqual(document.documentElement.style.zoom, 1.15);
  assertEqual(localStorage.getItem('promptlab-uiscale'), '115');
  assertEqual(JSON.parse(localStorage.getItem('promptlab-v4')).uiScale, 115);
});

test('applyAppearanceFromData applies a text size from a linked file, and ignores one that is absent', function () {
  uiScale = 100;
  applyAppearanceFromData({ uiScale: 115 });
  assertEqual(uiScale, 115);
  applyAppearanceFromData({});
  applyAppearanceFromData(null);
  assertEqual(uiScale, 115);
});

test('load() restores the text size saved in the blob', function () {
  uiScale = 100;
  localStorage.setItem('promptlab-v4', JSON.stringify({ categories: DEFAULT_CATS, prompts: DEFAULT_PROMPTS, uiScale: 115 }));
  load();
  assertEqual(uiScale, 115);
});

test('renderUiScaleMenu marks only the active size and theme', function () {
  uiScale = 115; setThemeMode('dark');
  renderUiScaleMenu();
  const html = document.getElementById('uiScaleMenu').innerHTML;
  assertIncludes(html, 'view-switch-btn active" title="Large"');
  assertNotIncludes(html, 'view-switch-btn active" title="Medium"');
  assertIncludes(html, `view-switch-btn active" onclick="event.stopPropagation();setThemeMode('dark')"`);
  assertNotIncludes(html, `view-switch-btn active" onclick="event.stopPropagation();setThemeMode('light')"`);
});

test('applyZoom publishes the zoom as --ui-zoom so the CSS can divide 100vh by it (the zoom lives on <html>; 100vh is not scaled)', function () {
  uiScale = 115;
  applyZoom();
  assertEqual(document.documentElement.style.zoom, 1.15);
  assertEqual(document.documentElement.style['--ui-zoom'], '1.15');
  setUiScale(100);
  assertEqual(document.documentElement.style['--ui-zoom'], '1');
});
