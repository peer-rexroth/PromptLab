# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PromptLab is a single-file, zero-dependency HTML application — the entire app (HTML, CSS, JavaScript) lives in `promptlab.html`. There is no build step and no package manager. It's also an installable PWA (manifest, service worker, icons — see below).

## Running it

A plain `file://` open of `promptlab.html` works fine for quick checks, but PWA install/offline support requires serving it over http — browsers refuse to register a service worker for `file://` pages. `./start-promptlab.command` serves the directory on `http://127.0.0.1:8935` and opens it in Chrome/Edge (Safari can't install this kind of PWA on macOS). `./stop-promptlab.command` kills the server.

## PWA

`manifest.json` and `sw.js` live alongside `promptlab.html`. `icons/icon.svg` is the source artwork (reused from the app's existing favicon/apple-touch-icon design); `icons/icon-180.png`, `icon-192.png`, `icon-512.png` are rendered from it for apple-touch-icon and manifest icons respectively — regenerate them with `qlmanage -t -s <size> -o icons icons/icon.svg` if the source SVG changes. `sw.js` precaches the app shell (HTML, manifest, icons, Font Awesome CSS/fonts) on install, network-first for the page navigation and cache-first for everything else; bump `CACHE_NAME` (currently `promptlab-cache-v2`) when the shell's contents change so old caches get evicted. Registration is gated on `location.protocol !== 'file:'` near the end of the `<script>` block, matching the http-only requirement above.

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

Eight modals share a common `.modal-bg` pattern (add `.open` class to show, remove to hide):
- `modalBg` — add/edit a variable option
- `catModalBg` — category manager
- `importModalBg` — import confirmation
- `helpModalBg` — help reference
- `aboutModalBg` — about screen
- `shortcutsModalBg` — keyboard shortcuts reference
- `fileSyncModalBg` — File System Access API sync setup
- `backupsModalBg` — restore a local daily backup (see "Local backups" below)

### Drag-and-drop

`initPillDragDrop()` is called after every `renderMain()` and wires native HTML5 drag events onto `.option-pill` elements (reorder single-select options) and `.instr-item` elements (reorder instruction items). `initCatDragDrop()` does the same for category rows in the category manager modal.

### Prompt locking

Each prompt has a `locked: Boolean` field. When locked, the template textarea and name input are `readonly`, edit-only buttons (Sync, add option, Delete, etc.) are hidden, and all mutation functions guard with `if (p.locked) return`. The bundled default prompts are locked on first load. `toggleLock(id)` flips the flag. `deletePrompt(id)` is a no-op on a locked prompt — it must be unlocked first, same as renaming or editing its template.

The lock only protects the template's *structure* (its text, name, category, var definitions/options, and presets) — a `((text))` var's typed value is still editable while locked, since filling in free-text input is normal usage of a bundled prompt, not an edit to it. `updateTextVar()` has no `p.locked` guard, and its `<input class="var-text-input">` is never rendered with `readonly`. `applyPreset()` is likewise unguarded for the same reason (applying a preset only fills in var values); `savePreset()`, `deletePreset()`, and `startRenamePreset()` do guard, and the preset chip markup computes `editable = !fixed && !locked` to decide whether to render the delete button, the double-click rename trigger, and `draggable="true"` — a locked prompt's presets get none of the three, and the "Save preset" button in the presets header is hidden entirely, mirroring how the Sync button and "add option" affordances disappear when locked.

### Version history

`snapshotVersion(id)` captures a `{ template, vars, presets, savedAt }` snapshot into `p.versions[]` (capped at 3, newest first) — called from `syncVars()`, right before it reassigns `p.vars` via `detectVars()`, so `p.vars`/`p.presets` at that point are still the pre-edit values matching the pre-edit `template` text pulled from `lastSyncedTemplates`. `restoreVersion(id, idx)` rolls `template`, `vars`, and `presets` back to a snapshot (deep-cloned, so mutating the restored prompt doesn't corrupt the stored version entry) — it snapshots the current unsaved state first, same as any other edit. Version entries saved before `vars`/`presets` were captured lack those fields; `restoreVersion()` falls back to re-detecting vars from the restored template and leaves `presets` untouched in that case. `buildVersionList(p)` renders the collapsible version history panel with inline template diffs via `renderDiff()` (the diff itself is template-text-only, not vars/presets).

### Presets

Each prompt stores named snapshots of its current variable selections in `p.presets[]`. A built-in "Clear" preset (index 0) is always present when vars exist and can't be renamed, deleted, or reordered — the chip markup computes `editable = !fixed && !locked` (`fixed = idx === 0 && pr.name === 'Clear'`), and both `initPillDragDrop()`'s preset-chip drag handlers and the chip markup gate on it, only marking editable chips `draggable` and only rendering the rename trigger/delete button on them — see "Prompt locking" above for the `!locked` half of that. `savePreset`, `applyPreset`, and `deletePreset` manage the list; reordering is drag-and-drop only (no dedicated function — the chip's `drop` handler in `initPillDragDrop()` splices `p.presets` directly, same pattern as option-pill and category-row reordering). Presets are shown as chips in the variables panel.

Renaming (`startRenamePreset`/`commitRenamePreset`/`cancelRenamePreset`) mirrors mytasks' inline-rename convention rather than using a `window.prompt()` dialog like `savePreset` does for creation: double-clicking an editable chip's name swaps its `<span>` for a focused `<input id="presetRenameInput">` (module-level `renamingPreset = { promptId, name }` tracks which chip, checked by `renderMain()` on every re-render), which commits on blur/Enter and discards on Escape. `commitRenamePreset()` guards with `if (!renamingPreset || renamingPreset.promptId !== id || renamingPreset.name !== oldName) return;` — the same guard mytasks' `commitRenameTask()` uses — because Escape's `cancelRenamePreset()` clears the state and re-renders (removing the input) *before* the blur event it indirectly triggers fires `commitRenamePreset()`; without the guard, that stale blur would silently resurrect the rename. A collision with another preset's name (case-insensitive) is rejected with a toast rather than silently, since — unlike `updateName()`'s live-as-you-type rejection — the user has already committed the edit by blurring/pressing Enter, so silence here would look like data loss. The single-click-applies / double-click-renames combination on the same chip text means a rename also fires `applyPreset()` twice first (the two clicks a dblclick is built from) — harmless since applying a preset is idempotent, and the same tradeoff mytasks accepts for its equivalent single/double-click-overloaded UI elements.

### Undo / redo

Per-prompt undo stacks are kept in `undoStacks` (a `Map<id, { past, future }>`). `updateTemplate` pushes to the stack on a debounce. `undoTemplate` / `redoTemplate` walk the stack and call `applyTemplateUndo`. The undo/redo buttons in the UI are disabled when the respective stack is empty.

### File sync

`save()` writes to both `localStorage` and, if a `fileHandle` is set, the linked JSON file via the File System Access API. The handle is persisted across page loads in IndexedDB (`promptlab-fs`). `fileSyncWrite` / `fileSyncRead` handle the async file I/O. The sync indicator in the topbar shows the linked filename.

### Look: one scheme (Glass), light and dark

The app has **one look**, ported from mytasks: Apple "Liquid Glass" / Mail-style. There is no scheme picker, no `colorScheme` state and no theme modal — they were removed when Glass was adopted, and `save()` no longer writes `colorScheme` (an old file that still has one is simply ignored). Appearance lives in one **Appearance popover** (the "aA" button in the topbar's tool group, `#uiScaleMenu`, `renderUiScaleMenu()`), ported from mytasks, with two `.view-switch` pills:

- **Theme** is `themePref` (`'light' | 'dark' | 'auto'`, default **auto**) → `currentTheme` (the resolved value `data-theme` shows), via `applyTheme()`/`setThemeMode()`. Auto follows the system *live* (a `prefers-color-scheme` change listener), not just at load. It is a **per-device preference (`promptlab-theme` in localStorage) and deliberately not in the saved blob or the linked file**: each device should follow its own system, and a synced file must not push one device's choice onto another (`load()` ignores a legacy `theme`). The sun/moon/half-circle icons are inline SVGs (`ICON_SUN`/`ICON_MOON`/`ICON_AUTO`) in the SF Symbols idiom — don't swap in the heavy Font Awesome ones (the mytasks owner disliked them).
- **Text size** offers only **Medium (100%) and Large (115%)** (`UI_SCALE_STEPS`), shown as a small and a large "A" (each segment's `glyph` is its font size; the name is the tooltip). `uiScale` is applied as a CSS `zoom` on `<html>` (Chromium/Safari; a no-op in Firefox). `clampUiScale()` snaps any stored/imported value to the nearest stop. Unlike the theme it *is* saved in the blob (`uiScale`) and applied from a linked file by `applyAppearanceFromData()`; the per-device `promptlab-uiscale` key lets the first paint avoid a flash.

- `<html data-scheme="glass">` is set in the markup and is only a styling hook: every Glass selector is written `html[data-scheme="glass"] …`. Don't rewrite them to bare `html …` — that would lower their specificity and change which rules beat the base ones.
- **The chrome is glass, the content is flat.** Topbar and sidebar are translucent and blur a graphite wallpaper (`--wall`, on `body`); the topbar and editor-header controls are capsules; the editor (`.main`) is opaque and neutral. The Glass section is near the end of the stylesheet (before `#fileInput`).
- Content is flattened by **scoping variables**, not per-element overrides: `.main` and `.modal` redefine `--bg/--bg-2/--bg-3/--glass-*/--border*` to opaque values (light and dark). When adding a Glass rule, reach for those variables rather than hard-coding colors. The light and dark Glass blocks must define the **same** variables (the light block would otherwise beat the bare `html[data-theme="dark"]` block for any variable only it sets).
- `backdrop-filter` can't see through a parent that has its own, so only body-level surfaces (topbar, sidebar, modals, toast) blur; menus/popovers inside the topbar or content use the near-opaque `--glass-strong`.
- `:root` carries the fonts, the three accents Glass doesn't define (`--coral-*`, `--pink-*`, `--star*` — category colors and the favourite star), `--sel-bg` and the focus-ring colors, each with a dark counterpart in the bare `html[data-theme="dark"]` block.
- **Selection** is Mail's solid accent: the open prompt (`.prompt-item.active`) is a solid `--sel-bg` fill with white text (the `--text*` variables are re-pointed on the row; the inline category stripe is overridden with `!important`). Menu items (`.split-btn-menu-item`, `.cat-drop-item`) hover the same blue.
- **One focus style** (Mail's colours): inputs/textareas get a 3px `--focus-ring` band + `--focus-edge` border via `:focus-visible` with `!important`; buttons/chips/pills get the same colour as an outline. Selects never show the browser's blue outline.
- **Corner radii**: topbar/header controls are capsules; content uses `--radius` (10px), sidebar rows `--glass-r-row` (8px), cards `--radius-lg` (14px), menus/modals `--glass-r-menu` (16px). Change the look by editing those variables, not rules.
- **Select arrows**: Glass draws a thin chevron (`appearance:none` + a data-URI background, one per theme since a data-URI can't read CSS variables). That rule must stay *after* every Glass rule that uses the `background` shorthand.
- **Topbar** (same shape as mytasks'): the brand is the Home button (`goHome()`); then one status chip for the linked file (`fileSyncChipHtml`/`onFileSyncChipClick` — amber *Link file* opens the Link/Create modal, green *Linked* asks before unlinking, red *Reconnect*), a divider, and one icon-only capsule group (`.tool-group.topbar-tools`, `.tool-btn`) with Categories, Data (export/import/backups menu), Appearance (text size + theme) and Help (guide/shortcuts/about menu). Every button has a tooltip; the two menus reuse `.split-btn-menu` and close on an outside click. The old split "Link file ▾" button, the filename readout and the separate unlink icon are gone.
- **Sidebar filter is a source list** (Mail/Notes style, replaces the old chips): *All Prompts*, *Favorites*, then a collapsible *Categories* section with a dot, name and count per row (`renderFilterStrip()`, `.src-row`). The selected row is a soft grey fill (mytasks' nav-row style), not solid blue, so it never competes with the solid-blue open prompt below it; clicking the selected category again clears the filter (`onCatRowClick`). The section collapses via its header (`catsCollapsed`, per-device `promptlab-cats-collapsed`); while collapsed the active category row still shows so the current filter is never invisible. The manage-categories button sits on that header. Prompt rows in the list carry no category stripe (the thin coloured bar was removed — it read as visual noise and looked detached on the rounded blue selected row); a prompt's category shows in the editor header's pill and is filterable from the source list.
- **Keyboard navigation switches prompts directly**: ↑/↓ (also while the search field has focus, but not in other inputs or the template editor) call `stepPrompt(±1)`, which opens the previous/next prompt in the current filtered list at once — there is no separate focus ring or Enter step (the old `sidebarFocusIdx`/`.kb-focus` are gone). The ends stop rather than wrap; with no open prompt in the list, ↓ opens the first and ↑ the last. `select(id, true)` skips `collapseSidebarIfNarrow()` so stepping doesn't close the floating narrow-window sidebar.
- **Variables panel rows are quiet**: no stripe down each row, the name chip sizes to its name (`.var-name{justify-self:start}`), and the per-row action (remove variable) is an `.icon-btn` in `.var-actions` that appears on row hover/focus (always visible on touch via `@media (hover:none)`). Removing a single option is a small ✕ (`.opt-x`) inside the pill's right end, like the preset chips' — whose slot is **always reserved** and only faded in on hover/focus (a slot that grew on hover made a pill at the end of a row wrap to the next line, leave the pointer, shrink and wrap back — a flicker; the pill's right padding is trimmed to pay for most of the slot) — which calls `deleteOption(id, key, option)` — it replaced the old row-level "remove the *selected* option" trash button. The last option can't be removed, and removing the selected one selects the first remaining; locked prompts render no badge. "+ Option" is a plain muted link (`.btn-add-opt`), and Save preset is a quiet pill (`.btn-quiet`).
- **Instruction (checklist) rows** match the option pills: flat rows with no box, a round checkbox with a Font Awesome check (like mytasks' round checkboxes), a soft teal tint when checked, and Edit/Remove as quiet `.icon-btn` icons (`.instr-act`, pen and ✕) shown only on row hover/focus (always on touch). The ✕ turns red on hover. The old text glyphs ✎/✕ and the always-red ✕ are gone.
- **Button hover** darkens the fill (`color-mix` of the text colour into `--bg-3`/`--bg-2`) instead of growing a drop shadow; the header buttons have their own higher-specificity hover rule because `.main-header .btn` sets a background that would otherwise win. Primary buttons brighten slightly (`filter: brightness(1.07)`, with a short transition) and darken when pressed — no shadow.
- **Editor header actions** are grouped like mytasks' selection toolbar: prompt name, the category pill (`.cat-drop-btn`), then one icon-only capsule group (`.tool-group.header-tools`: Favorite, Lock, Sync, Clone | Delete — each with a tooltip, a hairline `.tool-sep` before the destructive one), then the primary *Copy prompt* button on its own. `#headerStarBtn` is a `.tool-btn` that `toggleFav()` re-skins in place (`.starred` turns the star amber); the Lock button wears `.tool-btn.on` (amber) while the prompt is read-only. On a locked prompt Sync and Delete are not rendered, as before.
- **Collapsible sidebar** (ported from mytasks): the sidebar-panel button at the left of the topbar (`#sidebarToggle`) and **Cmd/Ctrl+B** flip `sidebarCollapsed` (per-device `promptlab-sidebar-collapsed`), applied as `html.sidebar-collapsed`. With no saved choice it starts collapsed at ≤800px, where the sidebar floats over the content; selecting a prompt there closes it again *without* saving (`collapseSidebarIfNarrow()`, called from `select()`), so a phone-sized window never changes the wide-window preference. The collapse CSS sits near the end of the stylesheet so it wins ties with the Glass `.sidebar` rules.
- **Type scale and borders**: five text sizes, anchored on the topbar (brand 23px, controls 13px, icons 15px), plus the 18px titles. **12px** meta (section labels, counts, list previews, footer, tags, keycaps, diffs); **13px** controls (every button — `.btn` and `.btn-sm` are the same size — pills, chips, menu labels, the search field, the category pill); **14px** things you read or pick (list rows, card headers, inputs, dialog body); **15px** what you write and read (template editor, preview and its highlights); **18px** editor and dialog titles. There is no 11px text any more; the only off-scale sizes left are deliberate — the small/large "A" glyphs of the Appearance button (11/17px, the "aA" icon) and icon sizes. Hairline borders are 1px. The overrides live in one block at the very end of the stylesheet so they win at equal specificity — change sizes there, not in the earlier base rules; inline `style="font-size:…"` in the JS markup should follow the same scale. No `--shadow` on hover (no glow).
- `prefers-reduced-transparency`, `prefers-contrast` and browsers without `backdrop-filter` get solid chrome and a flat wallpaper.

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
| `setThemeMode(mode)` / `applyTheme()` | Pick light/dark/auto (per-device) and resolve it onto `data-theme` |
| `setUiScale(pct)` / `clampUiScale(v)` | Pick Medium/Large text size; snap any value to a real stop |
| `applyAppearanceFromData(d)` | Apply `uiScale` from a linked-file payload |
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
