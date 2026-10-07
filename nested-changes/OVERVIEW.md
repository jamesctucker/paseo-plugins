# Nested Changes

Nested Changes lists uncommitted changes from every git repository in a workspace, including repositories nested inside the root one. Paseo's built-in changes view covers the workspace root only, so work in nested repos (for example a `work/` directory of separate checkouts) is invisible there. This plugin scans up to four directory levels deep and shows every dirty repo in one Explorer panel.

Selecting a file opens a diff viewer in the main tab area. You can attach line comments to either side of the diff for review notes, and a composer attachment source lets you attach a changed file's diff to an agent prompt.

## How it works

The plugin runs `git status` and `git diff` in each discovered repository and refreshes every five seconds while the panel is open. Untracked files are grouped behind a disclosure row per repository, and known junk (`.DS_Store`, `Thumbs.db`, `.playwright-mcp/` tool caches) is filtered out. Diffs are capped at 512 KB per file.

## Setup

Requires git on the daemon host's PATH and Paseo 0.8.0 or later. Works on macOS and Linux.

## Data and limits

- Reads: workspace directories on the daemon host, via git subprocesses.
- Writes: line comments to `~/.paseo/nested-changes-comments.json` on the daemon host. Comments are local review notes; they are not written to the repositories and do not sync anywhere.
- Network: none. The plugin makes no network calls.
- Limits: read-only (no staging, committing, or discarding). Repositories deeper than four levels are not discovered. Binary files show a placeholder instead of a diff. Comments are attached to line numbers, so they can drift when a file changes on disk.
