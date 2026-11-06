# paseo-plugins

[Paseo](https://paseo.sh/) plugins, one per folder.

## Plugins

| Plugin | Description |
|--------|-------------|
| [`agent-board/`](agent-board/) | "Agent Board" daily execution board: today's cards from Jira, GitHub, Linear, or plain prompts on the left, the agents they spawned on the right. Running a card opens a short form (workspace, editable prompt, model, thinking level) and the card then mirrors its agent's live state. Read-only toward every tracker. |
| [`code-quiz/`](code-quiz/) | "Code Quiz" sidebar screen: lists the repos under a workspace's `work/` directory and launches a teacher agent that quizzes you on one, then writes persistent lessons and reference sheets. Built around a specific workspace layout (a `teach` skill plus `work/` and `learning/` directories). |
| [`nested-changes/`](nested-changes/) | "Nested Changes" Explorer panel: lists git changes across the workspace root **and** nested repos (e.g. a `work/` directory of checkouts), which Paseo's native diff viewer misses. Clicking a file opens a main-tab diff view with a line-number gutter and persistent line comments. Ships a composer attachment source ("Changed file") for attaching diffs to agent chats. |
| [`skill-radar/`](skill-radar/) | "Skill Radar" sidebar screen: ranks the workspace's agent skills against the last five user messages using a Cloudflare Clef decision model, shows confidence-scored suggestions plus a collapsible catalog, and adds a composer pill when the best match clears 70%. One click copies the skill name. |
| [`review-queue/`](review-queue/) | "Review Queue" sidebar panel: lists the open GitHub pull requests waiting on your review (via `gh`), with a waiting-count badge on the row, a popover list, and a full-screen view. Clicking a PR opens it on GitHub. |

## Install

From GitHub directly (no build step — plugins only use host-provided modules and Node builtins):

```bash
paseo plugin add git:jamesctucker/paseo-plugins:agent-board
paseo plugin add git:jamesctucker/paseo-plugins:code-quiz
paseo plugin add git:jamesctucker/paseo-plugins:nested-changes
paseo plugin add git:jamesctucker/paseo-plugins:skill-radar
paseo plugin add git:jamesctucker/paseo-plugins:review-queue
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## License

[MIT](LICENSE)
