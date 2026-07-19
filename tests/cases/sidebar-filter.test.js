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
