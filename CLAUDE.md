# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PromptLab is a single-file, zero-dependency HTML application — the entire app (HTML, CSS, JavaScript) lives in `promptlab.html`. There is no build step and no package manager. It's also an installable PWA (manifest, service worker, icons — see below).

## Running it

A plain `file://` open of `promptlab.html` works fine for quick checks, but PWA install/offline support requires serving it over http — browsers refuse to register a service worker for `file://` pages. `./start-promptlab.command` serves the directory on `http://127.0.0.1:8935` and opens it in Chrome/Edge (Safari can't install this kind of PWA on macOS). `./stop-promptlab.command` kills the server.

## PWA

`manifest.json` and `sw.js` live alongside `promptlab.html`. `icons/icon.svg` is the source artwork (reused from the app's existing favicon/apple-touch-icon design); `icons/icon-180.png`, `icon-192.png`, `icon-512.png` are rendered from it for apple-touch-icon and manifest icons respectively — regenerate them with `qlmanage -t -s <size> -o icons icons/icon.svg` if the source SVG changes. `sw.js` precaches the app shell (HTML, manifest, icons, Font Awesome CSS/fonts) on install, network-first for the page navigation and cache-first for everything else; bump `CACHE_NAME` when the shell's contents change so old caches get evicted. Registration is gated on `location.protocol !== 'file:'` near the end of the `<script>` block, matching the http-only requirement above.

## Tests

There's no lint config, but there is a test suite at `tests/`: extract the inline `<script>` block, mock just enough of the DOM (`document.getElementById` returning cached fake elements with a settable `innerHTML`, plus `localStorage`, `navigator`, `window`, `confirm`, `location`) and `eval()` the real code in a headless JS engine (`osascript -l JavaScript` — JavaScriptCore, no Node install needed).

Run it with `./tests/run.sh` (optionally `./tests/run.sh someSubstring` to run only tests whose name contains that substring). No install step.

Add a test by dropping a `tests/cases/*.test.js` file with `test('description', function(){ ... })` calls — see existing files for the pattern. All app code plus every `tests/cases/*.test.js` file get concatenated and `eval()`'d *together* in one call, which is why a test can read/reassign `prompts`, `categories`, `activeId`, and the other top-level `let` state directly by bare name, and call any of the app's real functions — they're all sharing the same eval'd lexical scope. `tests/harness.js` calls `resetState()` (clears `localStorage` and re-runs the real `load()`, which reseeds `DEFAULT_CATS`/`DEFAULT_PROMPTS`) and clears the fake DOM before every test, so tests never see state left over from another test — write fixtures at the top of each test rather than relying on run order. `makeUnlockedPrompt()` (defined in `sync-vars.test.js`) is the shared fixture helper for tests that need an editable (non-locked) prompt, since the bundled defaults all load locked. Helper functions declared at a test file's top level are visible to every other test file too (same shared scope), so keep helper names distinctive enough not to collide across files.

Timers (`setTimeout`) are no-op in the harness rather than firing immediately, for deterministic tests — this means `updateTemplate`'s 1s undo-stack debounce never fires during a test. `undo-redo.test.js` seeds the undo/redo stacks directly instead of relying on the debounce, and exercises the real `undoTemplate`/`redoTemplate`/`applyTemplateUndo` functions on that seeded state.

## Architecture

The file has three logical sections in order: CSS styles, HTML structure, and a `<script>` block containing all application logic (~1500+ lines of vanilla JS).

### Data model

All state is stored in `localStorage` under the key `"promptlab-v4"` and serialised as JSON with this shape:

```json
{
  "prompts": [...],
  "categories": [...],
  "activeId": 1234,
  "filterCatId": "marketing",
  "filterFavs": false,
  "theme": "light"
}
```

A **prompt** object:
```js
{
  id: Number,          // Date.now() timestamp
  name: String,
  catId: String,       // matches a category id
  favorite: Boolean,
  locked: Boolean,     // read-only mode; prevents edits
  template: String,    // raw template text with {{var}}, [[var]], ((var)) placeholders
  lastEdited: Number,  // timestamp
  vars: {
    varName: {
      type: 'option' | 'instruction' | 'text',
      options: String[],            // for option/instruction types
      selected: String | String[],  // String for option, String[] for instruction
      value: String                 // for text type only
    }
  },
  presets: [{ name: String, values: { varName: String | String[] } }],
  versions: [{ ts: Number, template: String, vars: Object }]
}
```

A **category** object:
```js
{ id: String, name: String, color: String }  // color is a name key from CAT_COLORS
```

### Variable system

Templates support three placeholder syntaxes detected by `detectVars()`:
- `{{name}}` — single-select option variable; substituted with the selected string value
- `[[name]]` — multi-select instruction variable; substituted with a bullet list of all checked items
- `((name))` — free-text variable; substituted with the typed value
- Prefix with `\` to escape a placeholder (e.g. `\{{name}}`) — it renders as literal text in the copy output

`syncVars(id)` re-runs `detectVars()` after template edits, preserving existing var configurations while adding newly detected ones and dropping removed ones.

### Rendering pattern

The app uses direct DOM re-renders (no virtual DOM or framework). Every state mutation calls `save()` then one of:
- `render()` — full re-render of sidebar + main
- `renderSidebar()` — sidebar + filter strip only
- `renderMain()` — main editor/preview area only

`buildPreview(p)` returns highlighted HTML for the live preview panel. `buildFinal(p)` returns plain text for clipboard copy.

### Modals

Seven modals share a common `.modal-bg` pattern (add `.open` class to show, remove to hide):
- `modalBg` — add/edit a variable option
- `catModalBg` — category manager
- `importModalBg` — import confirmation
- `helpModalBg` — help reference
- `aboutModalBg` — about screen
- `shortcutsModalBg` — keyboard shortcuts reference
- `fileSyncModalBg` — File System Access API sync setup

### Drag-and-drop

`initPillDragDrop()` is called after every `renderMain()` and wires native HTML5 drag events onto `.option-pill` elements (reorder single-select options) and `.instr-item` elements (reorder instruction items). `initCatDragDrop()` does the same for category rows in the category manager modal.

### Prompt locking

Each prompt has a `locked: Boolean` field. When locked, the template textarea and name input are `readonly`, edit-only buttons (Sync, add option, etc.) are hidden, and all mutation functions guard with `if (p.locked) return`. The bundled default prompts are locked on first load. `toggleLock(id)` flips the flag.

### Version history

`snapshotVersion(id)` captures a `{ ts, template, vars }` snapshot into `p.versions[]` (capped at 20) whenever the user stops typing (debounced via `updateTemplate`). `restoreVersion(id, idx)` rolls template and vars back to a snapshot. `buildVersionList(p)` renders the collapsible version history panel with inline diffs via `renderDiff()`.

### Presets

Each prompt stores named snapshots of its current variable selections in `p.presets[]`. A built-in "Clear" preset (index 0) is always present when vars exist. `savePreset`, `applyPreset`, and `deletePreset` manage the list. Presets are shown as chips in the variables panel.

### Undo / redo

Per-prompt undo stacks are kept in `undoStacks` (a `Map<id, { past, future }>`). `updateTemplate` pushes to the stack on a debounce. `undoTemplate` / `redoTemplate` walk the stack and call `applyTemplateUndo`. The undo/redo buttons in the UI are disabled when the respective stack is empty.

### File sync

`save()` writes to both `localStorage` and, if a `fileHandle` is set, the linked JSON file via the File System Access API. The handle is persisted across page loads in IndexedDB (`promptlab-fs`). `fileSyncWrite` / `fileSyncRead` handle the async file I/O. The sync indicator in the topbar shows the linked filename.

### Theme

`currentTheme` (`'light'` | `'dark'`) is stored in both `localStorage` (key `"promptlab-theme"`) and the main data blob. `toggleTheme()` flips it and updates `data-theme` on `<html>`, which switches the CSS variable set.

## Key functions reference

| Function | Purpose |
|---|---|
| `load()` / `save()` | Read/write localStorage (and linked file if set); `load()` also runs data migrations |
| `detectVars(template, existing)` | Parse `{{}}`, `[[]]`, `(())` placeholders from a template string |
| `buildPreview(p)` | Build highlighted HTML preview with substituted vars |
| `buildFinal(p)` | Build plain-text output for clipboard copy |
| `syncVars(id)` | Re-detect vars from current template, preserve existing configs |
| `toggleLock(id)` | Toggle read-only lock on a prompt |
| `snapshotVersion(id)` | Save a version history entry for a prompt |
| `restoreVersion(id, idx)` | Roll a prompt back to a version snapshot |
| `savePreset(id)` / `applyPreset(id, name)` / `deletePreset(id, name)` | Manage variable presets |
| `undoTemplate(id)` / `redoTemplate(id)` | Walk the per-prompt undo stack |
| `copyFinal(id)` | Copy finished prompt text to clipboard |
| `exportLibrary()` | Download library as `.json` (version 4 format) |
| `confirmImport()` | Merge or replace library from a parsed import file |
| `toggleTheme()` | Switch between light and dark mode |
| `fileSyncWrite(data)` / `fileSyncRead()` | Write/read the linked JSON file via File System Access API |

## Import/export format

Export produces a version-4 JSON file:
```json
{ "version": 4, "exported": "<ISO date>", "categories": [...], "prompts": [...] }
```
Import accepts both the version-4 format and legacy formats (bare array of prompts). Merge deduplicates by `name + template` concatenation.
