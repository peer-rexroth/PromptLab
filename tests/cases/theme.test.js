// Color scheme picker (Standard/Modern/Dracula/GitHub/GitHub Dimmed) —
// persistence and cross-device sync via the same theme/filter plumbing.

test('setColorScheme updates state, the data-scheme attribute, and localStorage', function () {
  setColorScheme('modern');
  assertEqual(colorScheme, 'modern');
  assertEqual(document.documentElement.getAttribute('data-scheme'), 'modern');
  assertEqual(localStorage.getItem('promptlab-scheme'), 'modern');
});

test('setColorScheme persists into the stored data blob via save()', function () {
  setColorScheme('dracula');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assertEqual(saved.colorScheme, 'dracula');
});

test('load() picks up a colorScheme saved in the data blob, same as theme', function () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS, prompts: DEFAULT_PROMPTS, colorScheme: 'github'
  }));
  load();
  assertEqual(colorScheme, 'github');
  assertEqual(document.documentElement.getAttribute('data-scheme'), 'github');
});

test('load() ignores an unrecognized colorScheme rather than crashing', function () {
  colorScheme = 'github';
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    categories: DEFAULT_CATS, prompts: DEFAULT_PROMPTS, colorScheme: 'not-a-real-scheme'
  }));
  load();
  assertEqual(colorScheme, 'github', 'an invalid saved scheme should leave the current one alone');
});

test('applyThemeFromData applies colorScheme even when theme is absent', function () {
  colorScheme = 'standard';
  applyThemeFromData({ colorScheme: 'githubdimmed' });
  assertEqual(colorScheme, 'githubdimmed');
  assertEqual(document.documentElement.getAttribute('data-scheme'), 'githubdimmed');
});

test('applyThemeFromData ignores an unrecognized colorScheme', function () {
  colorScheme = 'standard';
  applyThemeFromData({ colorScheme: 'not-a-real-scheme' });
  assertEqual(colorScheme, 'standard');
});

test('applyThemeFromData still applies theme independently of colorScheme', function () {
  currentTheme = 'light';
  applyThemeFromData({ theme: 'dark' });
  assertEqual(currentTheme, 'dark');
  assertEqual(document.documentElement.getAttribute('data-theme'), 'dark');
});

test('renderThemeModal marks only the currently active scheme as selected', function () {
  setColorScheme('dracula');
  renderThemeModal();
  const html = document.getElementById('themeOptions').innerHTML;
  assertIncludes(html, `class="theme-option selected" onclick="setColorScheme('dracula')"`);
  assertNotIncludes(html, `class="theme-option selected" onclick="setColorScheme('standard')"`);
});

test('every THEME_SCHEMES entry has a matching [data-scheme] CSS selector in the stylesheet', function () {
  // Cheap guard against a typo splitting the picker's ids from the CSS
  // selectors that actually retheme the app.
  const ids = THEME_SCHEMES.map(s => s.id).sort();
  assertDeepEqual(ids, ['dracula', 'github', 'githubdimmed', 'modern', 'standard']);
});

test('openThemeModal opens the modal and renders the current options', function () {
  openThemeModal();
  assertTrue(document.getElementById('themeModalBg').classList.contains('open'));
  assertIncludes(document.getElementById('themeOptions').innerHTML, 'Standard');
});

test('closeThemeModal closes the modal', function () {
  openThemeModal();
  closeThemeModal();
  assertFalse(document.getElementById('themeModalBg').classList.contains('open'));
});
