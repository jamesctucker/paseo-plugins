# paseo-plugins

[Paseo](https://paseo.sh/) plugins, one per folder.

## Plugins

| Plugin | Description |
|--------|-------------|
| [`agent-board/`](agent-board/) | "Agent Board" daily execution board: today's cards from Jira, GitHub, Linear, or plain prompts on the left, the agents they spawned on the right. Running a card opens a short form (workspace, editable prompt, model, thinking level) and the card then mirrors its agent's live state. Read-only toward every tracker. |
| [`code-quiz/`](code-quiz/) | "Code Quiz" sidebar screen: lists every git repo under your open workspaces and launches a teacher agent that quizzes you on one, then writes persistent lessons and reference sheets to `learning/<repo>/`. Works with any workspace layout; the teaching loop is inlined in the prompt, no skills required. |
| [`nested-changes/`](nested-changes/) | "Nested Changes" Explorer panel: lists git changes across the workspace root **and** nested repos (e.g. a `work/` directory of checkouts), which Paseo's native diff viewer misses. Clicking a file opens a main-tab diff view with a line-number gutter and persistent line comments. Ships a composer attachment source ("Changed file") for attaching diffs to agent chats. |
| [`macos-classic-theme/`](macos-classic-theme/) | "macOS Classic" themes: light and dark palettes for Settings → Appearance, ported from [huacnlee's macOS Classic Zed theme](https://github.com/huacnlee/zed-theme-macos-classic). Pure data, no server entry. |
| [`review-queue/`](review-queue/) | "Review Queue" sidebar panel: lists the open GitHub pull requests waiting on your review (via `gh`), with a waiting-count badge on the row, a popover list, and a full-screen view. Clicking a PR opens it on GitHub. |

## Install

From GitHub directly (no build step — plugins only use host-provided modules and Node builtins):

```bash
paseo plugin add git:jamesctucker/paseo-plugins:agent-board
paseo plugin add git:jamesctucker/paseo-plugins:code-quiz
paseo plugin add git:jamesctucker/paseo-plugins:macos-classic-theme
paseo plugin add git:jamesctucker/paseo-plugins:nested-changes
paseo plugin add git:jamesctucker/paseo-plugins:review-queue
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## License

[MIT](LICENSE)
