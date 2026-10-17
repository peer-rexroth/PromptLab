// Collapsible sidebar — a per-device preference (localStorage), applied as html.sidebar-collapsed.

test('toggleSidebar flips the collapsed state, the html class and localStorage', function () {
  sidebarCollapsed = false;
  toggleSidebar();
  assertEqual(sidebarCollapsed, true);
  assertEqual(localStorage.getItem('promptlab-sidebar-collapsed'), '1');
  assertTrue(document.documentElement.classList.contains('sidebar-collapsed'));
  toggleSidebar();
  assertEqual(sidebarCollapsed, false);
  assertEqual(localStorage.getItem('promptlab-sidebar-collapsed'), '0');
  assertFalse(document.documentElement.classList.contains('sidebar-collapsed'));
});

test('collapseSidebarIfNarrow collapses on a narrow window without saving the preference', function () {
  sidebarCollapsed = false;
  window.matchMedia = function () { return { matches: true }; };
  collapseSidebarIfNarrow();
  assertEqual(sidebarCollapsed, true);
  assertEqual(localStorage.getItem('promptlab-sidebar-collapsed'), null);
});

test('collapseSidebarIfNarrow leaves a wide window alone', function () {
  sidebarCollapsed = false;
  window.matchMedia = function () { return { matches: false }; };
  collapseSidebarIfNarrow();
  assertEqual(sidebarCollapsed, false);
});

test('selecting a prompt on a narrow window closes the floating sidebar', function () {
  window.matchMedia = function () { return { matches: true }; };
  sidebarCollapsed = false;
  select(prompts[0].id);
  assertEqual(sidebarCollapsed, true);
});
