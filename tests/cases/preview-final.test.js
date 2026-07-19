// buildPreview() (highlighted HTML for the live preview) and buildFinal()
// (plain text for clipboard copy) — the two substitution engines that turn
// a template + vars into output.

function optionPrompt(selected) {
  return { template: 'Write a {{tone}} email.', vars: { tone: { type: 'option', options: ['formal', 'casual'], selected } } };
}

test('buildFinal substitutes an option var with its selected value', function () {
  assertEqual(buildFinal(optionPrompt('casual')), 'Write a casual email.');
});

test('buildFinal substitutes an instruction var as a sorted bullet list', function () {
  const p = {
    template: 'Cover: [[topics]]',
    vars: { topics: { type: 'instruction', options: ['A', 'B', 'C'], selected: ['C', 'A'] } }
  };
  // Selected items are ordered by their position in `options`, not selection order.
  assertEqual(buildFinal(p), 'Cover: • A\n• C');
});

test('buildFinal substitutes a text var with its typed value', function () {
  const p = { template: 'Input: ((notes))', vars: { notes: { type: 'text', value: 'hello world' } } };
  assertEqual(buildFinal(p), 'Input: hello world');
});

test('buildFinal renders an escaped placeholder as literal text without the backslash', function () {
  const p = { template: 'Use \\{{tone}} literally, but {{tone}} really.', vars: { tone: { type: 'option', options: ['formal'], selected: 'formal' } } };
  assertEqual(buildFinal(p), 'Use {{tone}} literally, but formal really.');
});

test('buildFinal substitutes the same var name at every occurrence', function () {
  const p = optionPrompt('casual');
  p.template = '{{tone}} then {{tone}} again';
  assertEqual(buildFinal(p), 'casual then casual again');
});

test('buildPreview wraps the selected option value in a highlight span', function () {
  const html = buildPreview(optionPrompt('casual'));
  assertIncludes(html, '<span class="var-highlight">casual</span>');
});

test('buildPreview HTML-escapes a selected value containing markup', function () {
  const p = optionPrompt('<b>x</b>');
  const html = buildPreview(p);
  assertIncludes(html, '&lt;b&gt;x&lt;/b&gt;');
  assertNotIncludes(html, '<b>x</b>');
});

test('buildPreview shows a placeholder message for an empty instruction selection', function () {
  const p = { template: 'Cover: [[topics]]', vars: { topics: { type: 'instruction', options: ['A'], selected: [] } } };
  assertIncludes(buildPreview(p), '(no instructions selected)');
});

test('buildPreview shows a placeholder message for an empty text value', function () {
  const p = { template: 'Input: ((notes))', vars: { notes: { type: 'text', value: '' } } };
  assertIncludes(buildPreview(p), '(empty)');
});

test('buildPreview renders an escaped placeholder as dimmed literal text', function () {
  const p = { template: 'Literal \\{{tone}} here.', vars: {} };
  const html = buildPreview(p);
  assertIncludes(html, '{{tone}}');
  assertNotIncludes(html, 'var-highlight');
});
