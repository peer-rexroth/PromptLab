// renderSidebar()'s filtering/search/sort logic, asserted against the real
// sidebarFiltered state rather than painted HTML.

test('renderSidebar sorts favorites first, then alphabetically', function () {
  prompts = [
    { id: 1, name: 'Zebra', favorite: false, catId: categories[0].id, template: 't', vars: {} },
    { id: 2, name: 'Apple', favorite: true, catId: categories[0].id, template: 't', vars: {} },
    { id: 3, name: 'Mango', favorite: false, catId: categories[0].id, template: 't', vars: {} }
  ];
  renderSidebar();
  assertDeepEqual(sidebarFiltered.map(p => p.name), ['Apple', 'Mango', 'Zebra']);
});

test('renderSidebar filters by favorites-only', function () {
  prompts = [
    { id: 1, name: 'A', favorite: false, catId: categories[0].id, template: 't', vars: {} },
    { id: 2, name: 'B', favorite: true, catId: categories[0].id, template: 't', vars: {} }
  ];
  filterFavs = true;
  renderSidebar();
  assertDeepEqual(sidebarFiltered.map(p => p.name), ['B']);
});

test('renderSidebar filters by category', function () {
  prompts = [
    { id: 1, name: 'A', favorite: false, catId: 'cat-x', template: 't', vars: {} },
    { id: 2, name: 'B', favorite: false, catId: 'cat-y', template: 't', vars: {} }
  ];
  filterCatId = 'cat-y';
  renderSidebar();
  assertDeepEqual(sidebarFiltered.map(p => p.name), ['B']);
});

test('renderSidebar search matches the prompt name', function () {
  prompts = [
    { id: 1, name: 'Meeting notes', favorite: false, catId: categories[0].id, template: 'irrelevant', vars: {} },
    { id: 2, name: 'Translate text', favorite: false, catId: categories[0].id, template: 'irrelevant', vars: {} }
  ];
  document.getElementById('searchInput').value = 'meet';
  renderSidebar();
  assertDeepEqual(sidebarFiltered.map(p => p.name), ['Meeting notes']);
});

test('renderSidebar search also matches inside the template body', function () {
  prompts = [
    { id: 1, name: 'A', favorite: false, catId: categories[0].id, template: 'contains a unique keyword', vars: {} },
    { id: 2, name: 'B', favorite: false, catId: categories[0].id, template: 'nothing special', vars: {} }
  ];
  document.getElementById('searchInput').value = 'keyword';
  renderSidebar();
  assertDeepEqual(sidebarFiltered.map(p => p.name), ['A']);
});

test('renderSidebar search is case-insensitive', function () {
  prompts = [{ id: 1, name: 'Meeting Notes', favorite: false, catId: categories[0].id, template: 't', vars: {} }];
  document.getElementById('searchInput').value = 'MEETING';
  renderSidebar();
  assertEqual(sidebarFiltered.length, 1);
});

// ── Source-list filter (All Prompts / Favorites / collapsible Categories) ─────

test('renderFilterStrip lists All Prompts, Favorites and every category with counts', function () {
  renderFilterStrip();
  const html = document.getElementById('filterStrip').innerHTML;
  assertIncludes(html, 'All Prompts');
  assertIncludes(html, 'Favorites');
  categories.forEach(c => assertIncludes(html, esc(c.name)));
  assertIncludes(html, `<span class="src-count">${prompts.length}</span>`);
});

test('renderFilterStrip marks only the active category row', function () {
  setFilter(categories[0].id, false);
  const html = document.getElementById('filterStrip').innerHTML;
  assertEqual((html.match(/src-row active/g) || []).length, 1);
  assertIncludes(html, `onCatRowClick('${categories[0].id}')`);
});

test('onCatRowClick selects a category, and clicking it again clears the filter', function () {
  onCatRowClick(categories[0].id);
  assertEqual(filterCatId, categories[0].id);
  onCatRowClick(categories[0].id);
  assertEqual(filterCatId, null);
});

test('toggleCatsSection hides the category rows and persists the choice per device', function () {
  catsCollapsed = false;
  toggleCatsSection();
  assertEqual(catsCollapsed, true);
  assertEqual(localStorage.getItem('promptlab-cats-collapsed'), '1');
  assertNotIncludes(document.getElementById('filterStrip').innerHTML, `onCatRowClick('${categories[1].id}')`);
  toggleCatsSection();
  assertEqual(localStorage.getItem('promptlab-cats-collapsed'), '0');
});

test('a collapsed Categories section still shows the active category, so the filter is never invisible', function () {
  catsCollapsed = true;
  setFilter(categories[1].id, false);
  const html = document.getElementById('filterStrip').innerHTML;
  assertIncludes(html, `onCatRowClick('${categories[1].id}')`);
  assertNotIncludes(html, `onCatRowClick('${categories[2].id}')`);
  catsCollapsed = false;
});

// ── Keyboard navigation: ↑/↓ switch directly between prompts ─────────────────

function seedNavPrompts() {
  prompts = [makeUnlockedPrompt(), makeUnlockedPrompt(), makeUnlockedPrompt()];
  prompts.forEach((p, i) => { p.id = 100 + i; p.name = 'P' + i; });
  filterCatId = null; filterFavs = false;
  activeId = 100;
  renderSidebar();
}

test('stepPrompt(1) opens the next prompt in the list directly', function () {
  seedNavPrompts();
  stepPrompt(1);
  assertEqual(activeId, sidebarFiltered[1].id);
  stepPrompt(1);
  assertEqual(activeId, sidebarFiltered[2].id);
});

test('stepPrompt(-1) opens the previous prompt, and both ends stop rather than wrap', function () {
  seedNavPrompts();
  activeId = sidebarFiltered[2].id;
  stepPrompt(-1);
  assertEqual(activeId, sidebarFiltered[1].id);
  stepPrompt(1); stepPrompt(1);
  assertEqual(activeId, sidebarFiltered[2].id);
  activeId = sidebarFiltered[0].id;
  stepPrompt(-1);
  assertEqual(activeId, sidebarFiltered[0].id);
});

test('stepPrompt with no open prompt in the list opens the first (down) or last (up)', function () {
  seedNavPrompts();
  activeId = null;
  stepPrompt(1);
  assertEqual(activeId, sidebarFiltered[0].id);
  activeId = null;
  stepPrompt(-1);
  assertEqual(activeId, sidebarFiltered[sidebarFiltered.length - 1].id);
});

test('stepPrompt does not close the floating sidebar on a narrow window', function () {
  seedNavPrompts();
  window.matchMedia = function () { return { matches: true }; };
  sidebarCollapsed = false;
  stepPrompt(1);
  assertEqual(sidebarCollapsed, false);
});
