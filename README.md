# paseo-plugins

Local [Paseo](https://paseo.sh/) plugins, one per folder.

## Plugins

| Plugin | Description |
|--------|-------------|
| [`sub-repo-changes/`](sub-repo-changes/) | "Sub-Repo Changes" Explorer panel: lists git changes across the workspace root **and** nested repos (e.g. `work/mrets`), which Paseo's native diff viewer misses. Clicking a file opens a main-tab File diff view with a line-number gutter and persistent line comments. Ships a composer attachment source ("Changed file") for attaching diffs to agent chats. |

## Install

From a local checkout:

```bash
paseo plugin install /absolute/path/to/paseo-plugins/sub-repo-changes
```

From GitHub directly (no package install needed — plugins only use host-provided modules and Node builtins):

```bash
paseo plugin add jamesctucker/paseo-plugins --path sub-repo-changes
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## Development loop

```bash
cd sub-repo-changes
npm install          # first time only — typecheck deps
npm run typecheck
paseo plugin reload sub-repo-changes
paseo plugin logs sub-repo-changes
```
