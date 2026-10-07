# Nested Changes

A [Paseo](https://paseo.sh/) plugin that surfaces uncommitted changes in **every** git repository under your workspace root, including the nested repos Paseo's built-in changes view can't see.

If your workspace is a folder of checkouts (a `work/` directory, a monorepo with submodules, a vault with repos inside it), the built-in panel shows you the root repo and stops. Nested Changes scans up to four levels deep and puts every dirty repo in one Explorer panel.

<!-- Screenshot: save a capture of the Explorer panel as docs/images/explorer-panel.png -->

## What you get

- **Explorer panel ("Nested Changes")**: every dirty repo as a card with branch, change count, and +/− stats. Tracked changes first; untracked files collapsed behind a per-repo disclosure. Refreshes every 5 seconds.
- **File diff viewer**: click any file to open its diff in a main tab, with old/new line-number gutters.
- **Line comments**: click a diff line to attach a review note (old or new side). Comments persist locally across sessions.
- **Composer attachment source ("Changed file")**: attach a changed file's diff directly to an agent prompt.
- **Noise filtering**: `.DS_Store`, `Thumbs.db`, and `.playwright-mcp/` tool caches never reach the panel.

Read-only by design: no staging, committing, or discarding.

## Install

From GitHub (no build step; the plugin only uses host-provided modules and Node builtins):

```bash
paseo plugin add git:jamesctucker/paseo-plugins:nested-changes
```

Or from a local checkout of this repo:

```bash
paseo plugin install /absolute/path/to/paseo-plugins/nested-changes
```

Requires git on the daemon host's PATH, Paseo 0.8.0+, and the daemon-wide **Enable plugins** switch (Settings → Plugins).

## Develop

```bash
cd nested-changes
npm install          # first time only, for typecheck/test deps
npm run typecheck
npm test             # vitest: parser unit tests + real-git integration tests
paseo plugin reload nested-changes
paseo plugin logs nested-changes
```

## How it works

Daemon-side handlers run `git status --porcelain` and `git diff` in each discovered repo; the panel polls them via plugin RPC. Line comments are stored on the daemon host at `~/.paseo/nested-changes-comments.json` (they're local review notes, never written to your repos). The plugin makes no network calls. Diffs are capped at 512 KB per file.

## License

[MIT](../LICENSE)
