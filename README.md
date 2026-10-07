# paseo-plugins

[Paseo](https://paseo.sh/) plugins, one per folder.

## Plugins

| Plugin | Description |
|--------|-------------|
| [`nested-changes/`](nested-changes/) | "Nested Changes" Explorer panel: lists git changes across the workspace root **and** nested repos (e.g. `work/mrets`), which Paseo's native diff viewer misses. Clicking a file opens a main-tab diff view with a line-number gutter and persistent line comments. Ships a composer attachment source ("Changed file") for attaching diffs to agent chats. |

## Install

From GitHub directly (no build step — plugins only use host-provided modules and Node builtins):

```bash
paseo plugin add git:jamesctucker/paseo-plugins:nested-changes
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## License

[MIT](LICENSE)
