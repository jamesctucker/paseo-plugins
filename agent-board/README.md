# Agent Board

A [Paseo](https://paseo.sh) plugin: a daily execution board for one person. Today's committed
work on the left (Jira mirror + local prompt cards), live agents on the right. Complements a
paper bullet journal; it never replaces the tracker or the plan.

- **Today list**: transcribed each morning. Quick-add accepts a Jira key (`PROJ-142`), a GitHub
  pull reference (`owner/repo#123`), or plain text as a prompt card. Unfinished cards from
  yesterday get a one-tap carry-over prompt.
- **Live rail**: board-spawned agents only, Running above Review, with a pulse + elapsed chip.
  Nothing running reads as two quiet words.
- **Run loop**: card → source picker (existing workspace / repo path / PR worktree via
  SDK-native `checkoutSource`) with a **pre-seeded, editable prompt** — the human layer before
  anything runs — then workspace + agent whose first message is that text → the card mirrors
  the agent's state. Finished agents land in Review; Open jumps to the agent in Paseo.
- **Zero write-back**: Jira status is a read-only badge. The board never mutates the tracker.
- **Attachment source**: `Attach a Jira issue` in the composer resolves through the same search
  adapter the board uses.

Board data (cards, day stamps, card→agent links) persists in a daemon-side settings document, so
it survives restarts and reloads. The Jira adapter (`search`/`list`/`get`) is behind a plain
adapter interface; Linear is a planned second adapter.

## Install

```bash
paseo plugin install github:jamesctucker/paseo-plugins --ref main
```

Or install from a local checkout:

```bash
paseo plugin install /absolute/path/to/paseo-plugins/agent-board
```

## Setup

Settings → Plugins → Agent Board:

- **Site domain**: `acme` or a full host when self-hosted
- **Email + API token**: Atlassian API token (Basic auth); stays daemon-side
- **Assigned JQL**: optional override of `assignee = currentUser() AND resolution = Unresolved`
- **Spawn provider**: `provider/model` for new agents (default `opencode/deepseek/deepseek-flash`)

## Develop

```bash
cd agent-board
npm install
npm run typecheck   # before every reload
npm test           # vitest, pure modules only
paseo plugin reload agent-board
```

Requires Paseo `>=0.15.0`. Design brief: `artifacts/45-agent-board-design.md` (workspace-local).
MIT licensed; see `../LICENSE`.