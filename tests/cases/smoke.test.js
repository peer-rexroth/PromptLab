// Sanity check that the harness can eval the app and call real functions.
test('smoke: default prompts load and render without crashing', function () {
  assertTrue(prompts.length > 0, 'DEFAULT_PROMPTS should have loaded');
  assertEqual(activeId, prompts[0].id);
  render();
  assertTrue(true);
});
