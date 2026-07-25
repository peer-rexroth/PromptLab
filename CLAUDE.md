# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PromptLab is a single-file, zero-dependency HTML application — the entire app (HTML, CSS, JavaScript) lives in `promptlab.html`. There is no build step and no package manager. It's also an installable PWA (manifest, service worker, icons — see below).

## Running it

A plain `file://` open of `promptlab.html` works fine for quick checks, but PWA install/offline support requires serving it over http — browsers refuse to register a service worker for `file://` pages. `./start-promptlab.command` serves the directory on `http://127.0.0.1:8935` and opens it in Chrome/Edge (Safari can't install this kind of PWA on macOS). `./stop-promptlab.command` kills the server.

## PWA

`manifest.json` and `sw.js` live alongside `promptlab.html`. `icons/icon.svg` is the source artwork (reused from the app's existing favicon/apple-touch-icon design); `icons/icon-180.png`, `icon-192.png`, `icon-512.png` are rendered from it for apple-touch-icon and manifest icons respectively — regenerate them with `qlmanage -t -s <size> -o icons icons/icon.svg` if the source SVG changes. `sw.js` precaches the app shell (HTML, manifest, icons, Font Awesome CSS/fonts) on install, network-first for the page navigation and cache-first for everything else; bump `CACHE_NAME` when the shell's contents change so old caches get evicted. Registration is gated on `location.protocol !== 'file:'` near the end of the `<script>` block, matching the http-only requirement above.

The install handler caches each `APP_SHELL` entry independently (`cache.add(url).catch(...)` per resource) rather than a single `cache.addAll()` — `addAll()` is all-or-nothing, so one failed request (a CDN hiccup, an ad-blocker on cdnjs) would reject the whole install and leave the service worker never activated, silently disabling offline support entirely.

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

`syncVars(id)` re-runs `detectVars()` after template edits, preserving existing var configurations while adding newly detected ones and dropping removed ones. It always shows a toast (`"Synced"`, or `"Synced — N new variables detected"`) even though a plain text edit that touches no placeholder has no other visible effect — without it, Sync looks like a no-op for exactly that (very common) kind of edit.

### Rendering pattern

The app uses direct DOM re-renders (no virtual DOM or framework). Every state mutation calls `save()` then one of:
- `render()` — full re-render of sidebar + main
- `renderSidebar()` — sidebar + filter strip only
- `renderMain()` — main editor/preview area only

`buildPreview(p)` returns highlighted HTML for the live preview panel. `buildFinal(p)` returns plain text for clipboard copy.

### Modals

Nine modals share a common `.modal-bg` pattern (add `.open` class to show, remove to hide):
- `modalBg` — add/edit a variable option
- `catModalBg` — category manager
- `importModalBg` — import confirmation
- `helpModalBg` — help reference
- `aboutModalBg` — about screen
- `shortcutsModalBg` — keyboard shortcuts reference
- `fileSyncModalBg` — File System Access API sync setup
- `backupsModalBg` — restore a local daily backup (see "Local backups" below)
- `themeModalBg` — pick a color scheme (see "Theme and color scheme" above)

### Drag-and-drop

`initPillDragDrop()` is called after every `renderMain()` and wires native HTML5 drag events onto `.option-pill` elements (reorder single-select options) and `.instr-item` elements (reorder instruction items). `initCatDragDrop()` does the same for category rows in the category manager modal.

### Prompt locking

Each prompt has a `locked: Boolean` field. When locked, the template textarea and name input are `readonly`, edit-only buttons (Sync, add option, Delete, etc.) are hidden, and all mutation functions guard with `if (p.locked) return`. The bundled default prompts are locked on first load. `toggleLock(id)` flips the flag. `deletePrompt(id)` is a no-op on a locked prompt — it must be unlocked first, same as renaming or editing its template.

The lock only protects the template's *structure* (its text, name, category, and var definitions/options) — a `((text))` var's typed value is still editable while locked, since filling in free-text input is normal usage of a bundled prompt, not an edit to it. `updateTextVar()` has no `p.locked` guard, and its `<input class="var-text-input">` is never rendered with `readonly`.

### Version history

`snapshotVersion(id)` captures a `{ template, vars, presets, savedAt }` snapshot into `p.versions[]` (capped at 3, newest first) — called from `syncVars()`, right before it reassigns `p.vars` via `detectVars()`, so `p.vars`/`p.presets` at that point are still the pre-edit values matching the pre-edit `template` text pulled from `lastSyncedTemplates`. `restoreVersion(id, idx)` rolls `template`, `vars`, and `presets` back to a snapshot (deep-cloned, so mutating the restored prompt doesn't corrupt the stored version entry) — it snapshots the current unsaved state first, same as any other edit. Version entries saved before `vars`/`presets` were captured lack those fields; `restoreVersion()` falls back to re-detecting vars from the restored template and leaves `presets` untouched in that case. `buildVersionList(p)` renders the collapsible version history panel with inline template diffs via `renderDiff()` (the diff itself is template-text-only, not vars/presets).

### Presets

Each prompt stores named snapshots of its current variable selections in `p.presets[]`. A built-in "Clear" preset (index 0) is always present when vars exist. `savePreset`, `applyPreset`, and `deletePreset` manage the list. Presets are shown as chips in the variables panel.

### Undo / redo

Per-prompt undo stacks are kept in `undoStacks` (a `Map<id, { past, future }>`). `updateTemplate` pushes to the stack on a debounce. `undoTemplate` / `redoTemplate` walk the stack and call `applyTemplateUndo`. The undo/redo buttons in the UI are disabled when the respective stack is empty.

### File sync

`save()` writes to both `localStorage` and, if a `fileHandle` is set, the linked JSON file via the File System Access API. The handle is persisted across page loads in IndexedDB (`promptlab-fs`). `fileSyncWrite` / `fileSyncRead` handle the async file I/O. The sync indicator in the topbar shows the linked filename.

### Theme and color scheme

Two independent axes control appearance: `data-theme` (`light`/`dark`, toggled by the topbar's circle-half-stroke button — `currentTheme`, stored in `localStorage["promptlab-theme"]` and the main data blob, unchanged since before schemes existed) and `data-scheme` (picked from the palette-icon button's theme modal — `colorScheme`, stored in `localStorage["promptlab-scheme"]` and the main data blob). Each scheme defines its own light *and* dark CSS variable pair, so the two axes combine freely — e.g. `[data-scheme="dracula"][data-theme="dark"]`.

- **`THEME_SCHEMES`** (near `CAT_COLORS`, top of the `<script>` block) is the single source of truth for which schemes exist — each entry has `id`, `name`, `desc`, and `swatches` (three hex values shown as dots in the picker). `id` must exactly match a `[data-scheme="..."]` selector; nothing enforces this automatically except `tests/cases/theme.test.js`'s "every entry has a matching CSS selector" test, which will fail loudly on a typo but won't catch a selector that exists with no matching `THEME_SCHEMES` entry (a harmless orphan, not a crash).
- **`:root, html[data-scheme="standard"]`** and the bare `html[data-theme="dark"]` block are the original, untouched palette — this is what renders when `data-scheme` is absent entirely, so it must stay exactly as-is. Every other scheme is defined as `html[data-scheme="x"] { ... }` (light) and `html[data-scheme="x"][data-theme="dark"] { ... }` (dark) — the dark block's extra attribute selector always wins on specificity over the bare `html[data-theme="dark"]`, so block order in the file doesn't matter for correctness.
- PromptLab's `:root` has three Standard-only accent slots (`--coral-bg`/`--coral-text`, `--pink-bg`/`--pink-text`, `--star`/`--star-bg`) with no equivalent token in any of the four ported schemes' source palettes (they don't exist in mytasks' scheme system either, which only has blue/teal/amber/red/green/purple). They're deliberately left undeclared in every non-Standard scheme block, so CSS falls back to `:root`'s/the bare dark block's values for those specific properties regardless of which scheme is active — those three category-color pairs and the favorite-star color simply don't re-theme.
- Each scheme has its own one-off "signature" rule scoped near its variable block: Modern restyles `.sidebar-footer` into a solid-blue status bar (mirroring VS Code's most recognizable UI element); Dracula adds a purple glow to `.topbar-brand i`; GitHub and GitHub Dimmed both turn `.btn-primary` into GitHub's solid green.
- **Accuracy convention**: when a scheme claims to replicate a real product's theme (VS Code, GitHub, Dracula, etc.), the actual token values were verified against the real source (fetched from `microsoft/vscode`'s theme JSON, `draculatheme.com/spec`, and `@primer/primitives`) rather than reconstructed from memory — see the comment above each scheme's variable block for exactly what's a real spec value vs. this app's own derivation (e.g. neither GitHub palette has an official teal token, so that slot is an approximation).

`setColorScheme(scheme)` updates state + `data-scheme` + `localStorage`, re-renders the picker, and calls `save()`. `applyThemeFromData(d)` (used by `linkFile()`/`reconnectFile()`/`initFileSync()` when adopting a linked file's data) applies `theme` and `colorScheme` independently of each other — a payload with only one of the two still applies that one, rather than an early return on the other being absent.

## Key functions reference

| Function | Purpose |
|---|---|
| `load()` / `save()` | Read/write localStorage (and linked file if set); `load()` calls `normalizePrompts()` |
| `normalizePrompts()` | Schema defaults/migration for `prompts` — see "Data integrity" below |
| `tombstone(list, id)` / `untombstone(list, id)` | Record/clear a deletion marker — see "Deletion tombstones" below |
| `mergePrompts(incoming, incomingDeleted?)` / `mergeCategories(incoming, incomingDeleted?)` | Tombstone-aware additive merge, shared by every merge-mode entry point |
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
| `exportLibrary()` / `downloadLibrary(cats, proms, filename)` | Download a library as `.json` (version 4 format); `exportLibrary()` is the user-facing action, `downloadLibrary()` is the reusable primitive it and the pre-replace backup both call |
| `confirmImport()` | Merge or replace library from a parsed import file |
| `toggleTheme()` | Switch between light and dark mode |
| `setColorScheme(id)` | Switch the color scheme (Standard/Modern/Dracula/GitHub/GitHub Dimmed) |
| `applyThemeFromData(d)` | Apply `theme`/`colorScheme` from a linked-file payload, independently of each other |
| `fileSyncWrite(data)` / `fileSyncRead()` | Write/read the linked JSON file via File System Access API |
| `maybeSnapshotBackup()` | Take a rolling daily local backup snapshot; called from `save()` |
| `getBackups()` / `restoreBackup(date)` | Read local backups; roll the library back to one, after confirmation |

## Import/export format

Export produces a version-4 JSON file:
```json
{ "version": 4, "exported": "<ISO date>", "categories": [...], "prompts": [...] }
```
Import accepts both the version-4 format and legacy formats (bare array of prompts). `mergePrompts()` (the merge-mode helper, also used by `linkFile()`'s first-link merge, `reconnectFile()`, and `initFileSync()`) dedups by prompt **name**, keeping whichever copy has the newer `lastEdited`, then merges the incoming list in the same way — not by content hash, so two unrelated prompts that happen to share a name will collide. It's also tombstone-aware — see "Deletion tombstones" below.

Because merging is name-keyed, two *locally*-created prompts sharing a name is also a real problem, not just a display nit — `mergePrompts()`'s `appByName` map (and its own pre-merge same-name dedup pass) can only keep one entry per name, so the other risks being silently overwritten or dropped on a future merge. Three guards prevent this from happening by accident, all built on one helper, `uniqueName(base)` (appends ` 2`, ` 3`, ... until the name is free, case-insensitively): `newPrompt()` runs its default `"New Prompt"` through it, `clonePrompt()` runs `` `${src.name} (copy)` `` through it (so cloning the same prompt twice gives "X (copy)" then "X (copy) 2", not two colliding "X (copy)"s), and `updateName()` silently rejects a rename that would exactly match another prompt's name case-insensitively (mirroring `renameCat()`'s identical guard for categories) — the input's own typed characters stay visible while the name field simply doesn't commit the colliding value, so the user can keep typing past it.

When an incoming prompt's name doesn't match anything locally, `mergePrompts()` falls back to matching by **id** before treating it as new — otherwise a prompt renamed locally after the incoming copy was captured (an old backup, a stale linked file, another device) would get re-added as a second array entry sharing the renamed prompt's id, since its old name no longer matches anything. Two array entries with the same id break any id-keyed lookup, most visibly the sidebar's `p.id===activeId` highlight check, which then highlights both. `normalizePrompts()` also runs a same-id dedup pass (keeping the newer `lastEdited`) as a repair step, so a library that already hit this bug (prior to the fix) self-heals on next load — see "Data integrity" below.

Replacing the library via import (`confirmImport()`'s "replace" mode) is destructive, so it auto-downloads the current library as `prompt-library-backup-before-replace-<date>.json` before overwriting — the same `downloadLibrary()` primitive `exportLibrary()` uses.

## Local backups

`save()` calls `maybeSnapshotBackup()` on every save, which takes at most one rolling snapshot per calendar day (keyed by `todayStr()`) and stores it in `localStorage["promptlab-backups"]`, keeping the last `MAX_BACKUPS` (7) days — a local safety net distinct from the linked-file sync, which mirrors live state rather than preserving history. A backup taken earlier in the day is *not* refreshed by later saves that same day — `maybeSnapshotBackup()` short-circuits once today's entry exists, so it captures state as of the first save of the day, not the latest.

The "Data → Backups" modal (`openBackupsModal()`/`renderBackupsModal()`) lists snapshots newest-first with a Restore button. `restoreBackup(date)` downloads a safety backup of the *current* library first (same `downloadLibrary()` primitive as the pre-replace-import backup), then overwrites `categories`/`prompts` from the snapshot, runs them through `normalizePrompts()`, and resets `activeId` if it no longer points at a surviving prompt.

## Data integrity

`normalizePrompts()` (promptlab.html, right before `load()`) is the single source of truth for prompt schema defaults/migration: a same-`id` dedup pass (keeping the newer `lastEdited` — see "Import/export format" above for why duplicate ids could occur), tag→category backfill, an orphaned `catId` reassigned to the first available category, `favorite`/`locked`/`vars`/`presets`/`versions`/`lastEdited` backfilled, var `type` defaulted to `'option'`, and a `Clear` preset generated for prompts that have vars but no presets yet.

Every place that assigns `prompts`/`categories` from an external source calls it, not just `load()` — **if you add another data-loading path, route it through `normalizePrompts()` too**, or you'll reintroduce the exact bug class this fixed (a library saved by an older version, or hand-edited outside the app, missing a field that a render function assumes exists — e.g. `renderMain()`'s `Object.keys(p.vars)` used to crash outright on a prompt with no `vars` field at all). The current call sites: `load()`, both branches of `confirmImport()`, `linkFile()`'s merge-on-first-link branch, `reconnectFile()`, and `initFileSync()`.

## Deletion tombstones — why mergePrompts()/mergeCategories() can't just diff arrays

`deletedPromptIds`/`deletedCategoryIds` (each an array of `{id, deletedAt}`) are the record of "this id used to exist and was intentionally removed" — without them, an id absent from `prompts`/`categories` is indistinguishable from an id the app has simply never seen. `tombstone(list, id)`/`untombstone(list, id)` (small helpers near `esc`/`escJs`) add/remove an entry; `deletePrompt()` and `deleteCategory()` call `tombstone()` when removing something. Both also `untombstone()` in their undo callback — see "Undo-delete via the toast" below — so the tombstone doesn't outlive the undo window; if it did, undoing would restore the prompt/category locally while leaving it permanently un-mergeable from any linked file/device that still has it.

## Undo-delete via the toast

`showToast(msg, isError=false, undoAction=null)` takes an optional third argument: when present, the toast shows an "Undo" button (`toastUndoBtn`) and stays up for 6s instead of the usual 2.4s. Clicking it (or pressing `⌘Z`/`Ctrl+Z` outside any text input — see below) calls `triggerToastUndo()`, which invokes `undoAction` and dismisses the toast immediately. `deletePrompt()` and `deleteCategory()` both use this: each captures the removed item and its array index before removing it, tombstones the id, then on undo splices the item back into that exact position and clears the tombstone — `deletePrompt()` also makes the restored prompt active again, `deleteCategory()` also re-applies the sidebar filter if that category was the active filter at delete time.

Only one undo action is live at a time (`toastUndoAction`, a single module-level slot) — showing any other toast (with or without its own undo) overwrites it, matching the single visible toast. The `⌘Z`/`Ctrl+Z` binding lives in the main `keydown` listener, guarded by `!inInput` (true for any focused `input`/`textarea`/`select`) so it never fires while typing — this is also what keeps it from colliding with the template editor's own `⌘Z` undo/redo, which is wired in a separate listener scoped specifically to `document.activeElement.id === 'templateArea'` (a textarea, so already excluded by `!inInput` in the first listener).

`mergePrompts()`/`mergeCategories()` are additive by id (prompts also dedup by name — see "Import/export format" above): an incoming item not currently found locally gets added, *unless* its id is tombstoned locally and the tombstone's `deletedAt` is newer than the incoming item's `lastEdited` — in which case it stays deleted. If the incoming copy is newer than the tombstone (an edit made elsewhere *after* the local delete), it's let back in and the stale tombstone is cleared — same last-write-wins spirit as the rest of the merge, rather than a delete being permanent no matter what happens on another device. Both merge functions also fold any *incoming* tombstone list into the local one first (union by id, keeping the later `deletedAt`), so a deletion recorded on one device/file propagates to whichever side is doing the reading.

This is what `mergePrompts()`/`mergeCategories()` protect against: without tombstones, any of the merge points below could resurrect a prompt/category the user had already deleted, simply because a stale copy was still sitting in a linked file, an older local backup, or on another device. `reconnectFile()` and `initFileSync()` used to do a raw overwrite (`prompts = data.prompts`) rather than merge at all, which had the same resurrection failure mode plus a second one — it could silently discard local edits that hadn't made it to the file yet (e.g. during a permission lapse). Both now route through `mergePrompts()`/`mergeCategories()` instead.

**The one exception: `confirmImport()`'s merge mode.** Both functions take an `opts.respectTombstones` flag (default `true`); `confirmImport()` is the only caller that passes `{ respectTombstones: false }`, for both its `mergeCategories()` and `mergePrompts()` calls. Picking a specific file and clicking Import → Merge is a deliberate, one-off action — the user is looking at that exact file and choosing to bring it in — unlike `linkFile()`/`reconnectFile()`/`initFileSync()`, which merge automatically in the background on reconnect/link and where silently resurrecting a deletion via a stale copy would be surprising. With the flag off, a matching tombstone is cleared and the incoming item is added regardless of its `lastEdited` relative to `deletedAt`. Without this, manually re-importing an old export/backup that contains anything you'd since deleted here would silently report "nothing new" with no indication why — which is exactly the bug this was added to fix.

Tombstones travel through the file-sync payload (`save()`'s `data`, and the two `fileSyncWrite()` calls in `linkFile()`/`createNewLinkedFile()`) so they propagate to a linked file — but **not** through the plain export/import `.json` format (`downloadLibrary()`/`exportLibrary()` deliberately omit them, matching the export schema staying `{version, exported, categories, prompts}`), and **not** through the local daily-backup snapshots (`maybeSnapshotBackup()`/`restoreBackup()`) — a backup restore is an explicit full replace, same as import's "replace" mode, so neither goes through the tombstone-aware merge path.
