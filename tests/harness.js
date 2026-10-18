// JXA test harness — no build step, no Node, no dependencies (matches the
// rest of this project). Run via ./tests/run.sh from anywhere, or directly:
//   osascript -l JavaScript tests/harness.js [nameFilter]
//
// How it works: extracts the inline <script> block from promptlab.html,
// appends a resetState() glue function plus every tests/cases/*.test.js
// file, and evaluates all of it in ONE eval() call so test files can read
// and reassign the app's real top-level state (prompts, categories,
// activeId, filters, etc.) by bare name, and call any of its real
// functions directly — mirrors the mytasks project's test harness.
//
// A test file just calls test('description', function(){ ... }) at its
// top level — the function can be async, the runner awaits it either way.
// Before each test, the harness calls resetState() (clears localStorage
// and re-runs the real load(), which seeds DEFAULT_CATS/DEFAULT_PROMPTS)
// and clears the fake DOM element cache, so tests never see state left
// over from another test. Use assertEqual/assertDeepEqual/assertTrue/
// assertFalse/assertIncludes/assertNotIncludes.

async function run(argv) {
  ObjC.import('Foundation');
  ObjC.import('stdlib');

  const nameFilter = argv[0] || '';
  const cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
  const appPath = cwd + '/promptlab.html';
  const casesDir = cwd + '/tests/cases';

  function readFile(path) {
    const str = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
    if (!str) throw new Error('Could not read file: ' + path);
    return str.js;
  }
  function listDir(path) {
    const arr = $.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(path, null);
    if (!arr) throw new Error('Could not list directory: ' + path);
    const out = [];
    for (let i = 0; i < arr.count; i++) out.push(ObjC.unwrap(arr.objectAtIndex(i)));
    return out.sort();
  }

  // ---- extract the inline <script> block from promptlab.html ----
  const html = readFile(appPath);
  const openTag = '<script>';
  const openIdx = html.indexOf(openTag);
  const closeIdx = openIdx === -1 ? -1 : html.indexOf('</script>', openIdx);
  if (openIdx === -1 || closeIdx === -1) {
    throw new Error('Could not find an inline <script>...</script> block in promptlab.html — did the markup change?');
  }
  const appCode = html.slice(openIdx + openTag.length, closeIdx);

  // ---- minimal fake DOM element ----
  // Deliberately loose: every element supports every property/method any
  // code path touches, so tests never crash on a missing mock — the
  // assertions are what should catch real bugs, not the harness.
  function makeFakeElement() {
    const classSet = new Set();
    const attrs = {};
    return {
      innerHTML: '', textContent: '', value: '', className: '',
      style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, disabled: false, checked: false,
      tabIndex: 0, offsetParent: {}, offsetWidth: 0,
      classList: {
        add() { for (const c of arguments) classSet.add(c); },
        remove() { for (const c of arguments) classSet.delete(c); },
        toggle(c, force) {
          const on = force === undefined ? !classSet.has(c) : !!force;
          if (on) classSet.add(c); else classSet.delete(c);
          return on;
        },
        contains(c) { return classSet.has(c); }
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      removeAttribute(k) { delete attrs[k]; },
      addEventListener() {}, removeEventListener() {},
      appendChild(c) { return c; }, removeChild() {}, remove() {},
      focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
      closest() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
  }

  const elCache = new Map();
  globalThis.document = {
    documentElement: makeFakeElement(),
    activeElement: null,
    getElementById(id) {
      if (!elCache.has(id)) elCache.set(id, makeFakeElement());
      return elCache.get(id);
    },
    createElement() { return makeFakeElement(); },
    // Special-cased: confirmImport() reads the checked import-mode radio
    // this way. Tests control it via globalThis.__importMode ('merge'|'replace').
    querySelector(sel) {
      if (sel === 'input[name="importMode"]:checked') {
        return { value: globalThis.__importMode || 'merge' };
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}
  };
  // A function (not a plain object literal) so each call — once at setup,
  // then again before every test — produces a fresh window with no leftover
  // per-test additions (e.g. a test-mocked showOpenFilePicker).
  function makeFakeWindow() {
    return {
      matchMedia() { return { matches: false }; },
      addEventListener() {}, removeEventListener() {},
      // Mocked by tests that need a specific typed value; default 'Preset' keeps
      // savePreset() tests working without every test having to set this.
      prompt() { return globalThis.__promptReturn !== undefined ? globalThis.__promptReturn : 'Preset'; }
    };
  }
  globalThis.window = makeFakeWindow();
  // Mocked by tests that need to simulate Cancel; default true (OK) matches
  // the common case so most tests don't have to set this.
  globalThis.confirm = function () { return globalThis.__confirmReturn !== undefined ? globalThis.__confirmReturn : true; };
  globalThis.navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    clipboard: { writeText(text) { globalThis.__lastClipboardText = text; return Promise.resolve(); } }
  };
  globalThis.location = { protocol: 'file:' }; // skips service-worker registration
  globalThis.localStorage = (function () {
    let store = {};
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      clear() { store = {}; }
    };
  })();
  // Timers are no-ops (never fire) rather than immediate, so tests get
  // deterministic behavior instead of surprise reentrancy (e.g. the undo
  // debounce firing mid-test and pushing an unexpected stack entry).
  globalThis.setTimeout = function () { return 0; };
  globalThis.clearTimeout = function () {};
  globalThis.requestAnimationFrame = function () { return 0; };
  globalThis.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; globalThis.__lastBlob = this; };
  globalThis.URL = { createObjectURL() { return 'blob:mock'; }, revokeObjectURL() {} };

  // ---- test registration + assertions (real globals, visible from the eval'd code too) ----
  globalThis.__TESTS__ = [];
  globalThis.test = function (name, fn) { globalThis.__TESTS__.push({ name, fn }); };
  function show(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  globalThis.assertEqual = function (actual, expected, msg) {
    if (actual !== expected) throw new Error((msg ? msg + ': ' : '') + 'expected ' + show(expected) + ' but got ' + show(actual));
  };
  globalThis.assertDeepEqual = function (actual, expected, msg) {
    const a = show(actual), e = show(expected);
    if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ' but got ' + a);
  };
  globalThis.assertTrue = function (cond, msg) { if (!cond) throw new Error(msg || 'expected a truthy value'); };
  globalThis.assertFalse = function (cond, msg) { if (cond) throw new Error(msg || 'expected a falsy value'); };
  globalThis.assertIncludes = function (haystack, needle, msg) {
    if (!haystack || !haystack.includes(needle)) throw new Error((msg ? msg + ': ' : '') + show(haystack) + ' does not include ' + show(needle));
  };
  globalThis.assertNotIncludes = function (haystack, needle, msg) {
    if (haystack && haystack.includes(needle)) throw new Error((msg ? msg + ': ' : '') + show(haystack) + ' should not include ' + show(needle));
  };

  // ---- glue appended directly after the app code, sharing its lexical scope ----
  const glue = `
;function resetState(){
  localStorage.clear();
  load(); // no stored data → re-seeds DEFAULT_CATS/DEFAULT_PROMPTS, sets activeId to the first one
  filterCatId = null; filterFavs = false;
  currentTheme = 'light';
  modalTarget = null; pendingImportData = null; newCatColor = 'blue';
  undoStacks.clear(); lastSyncedTemplates.clear();
  undoDebounce = null; undoSessionStart = null; undoSessionId = null;
  showVersionHistory = false; expandedVersionIdx = -1;
  sidebarFiltered = []; sidebarFocusIdx = -1;
  colorPopoverTarget = null;
  fileHandle = null;
  toastUndoAction = null; toastHideTimer = null;
  renamingPreset = null;
  globalThis.__importMode = undefined;
  globalThis.__promptReturn = undefined;
  globalThis.__confirmReturn = undefined;
  globalThis.__lastClipboardText = undefined;
  globalThis.__lastBlob = null;
}
`;

  // ---- load every tests/cases/*.test.js file ----
  const fileNames = listDir(casesDir).filter(f => f.endsWith('.test.js'));
  if (fileNames.length === 0) throw new Error('No *.test.js files found in ' + casesDir);
  const testSrc = fileNames.map(f => '\n// --- ' + f + ' ---\n' + readFile(casesDir + '/' + f)).join('\n');

  // ---- one combined eval: app code + resetState glue + all test registrations ----
  eval(appCode + glue + testSrc);

  // ---- run ----
  const toRun = globalThis.__TESTS__.filter(t => !nameFilter || t.name.includes(nameFilter));
  if (toRun.length === 0) {
    console.log('No tests matched filter "' + nameFilter + '" (of ' + globalThis.__TESTS__.length + ' total).');
    $.exit(1);
  }

  let pass = 0, fail = 0;
  for (const t of toRun) {
    try {
      resetState();
      elCache.clear();
      document.documentElement = makeFakeElement();
      globalThis.window = makeFakeWindow();
      await t.fn();
      pass++;
      console.log('  ok  ' + t.name);
    } catch (e) {
      fail++;
      console.log('FAIL  ' + t.name + ' — ' + (e && e.message ? e.message : e));
    }
  }

  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed' +
    (nameFilter ? ' (filter: "' + nameFilter + '", ' + globalThis.__TESTS__.length + ' total)' : ''));

  $.exit(fail > 0 ? 1 : 0);
}
