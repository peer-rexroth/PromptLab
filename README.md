# PromptLab

A local prompt management tool — store reusable AI prompts with fill-in variables, categories, and one-click copy. Single-file, zero-dependency, no server or account required; your data stays in the browser (or a JSON file you choose to sync).

## Getting started

Open [`promptlab.html`](promptlab.html) directly in a browser — that's the whole app, no build step and nothing to install.

To install it as a desktop app (offline support, its own window, dock/taskbar icon), run:

```
./start-promptlab.command
```

This serves the folder locally and opens it in Chrome or Edge (installing a PWA requires `http://`, not `file://` — and Safari doesn't support installing this kind of PWA on macOS). Look for the install icon in the address bar. `./stop-promptlab.command` stops the local server when you're done.

## Features

- **Variables** — templates support three placeholder types: `{{name}}` (pick one option), `[[name]]` (pick any number, rendered as a bullet list), and `((name))` (free text). Prefix with `\` to render a placeholder literally.
- **Categories & filtering** — organize prompts by category, favorite the ones you use often, and search by name or content.
- **Presets** — save named snapshots of your variable selections per prompt for quick reuse.
- **Version history** — every prompt keeps a rolling history of template edits, with inline diffs and one-click restore.
- **Locking** — mark a prompt read-only to protect it from accidental edits (the bundled prompts start locked).
- **File sync** — link a JSON file via the File System Access API to sync your library across sessions or share it between devices.
- **Local backups** — a rolling daily snapshot is kept automatically, restorable from Data → Backups.
- **Import/export** — back up or transfer your whole library as a `.json` file, in either merge or replace mode.

## Tests

```
./tests/run.sh
```

No install step — the suite runs via `osascript -l JavaScript` (JavaScriptCore), so it needs macOS. Pass a substring to run a subset: `./tests/run.sh presets`.

## License

[MIT](LICENSE)
