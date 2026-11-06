# Agent Board

A [Paseo](https://paseo.sh) plugin: a daily execution board for one person. Today's committed
work on the left (Jira mirror + local prompt cards), live agents on the right. Complements a
paper bullet journal; it never replaces the tracker or the plan.

- **Today list**: transcribed each morning. Quick-add accepts a Jira key (`PROJ-142`), a GitHub
  pull reference (`owner/repo#123`), or plain text as a prompt card. Unfinished cards from
  yesterday get a one-tap carry-over prompt.
- **Task cards**: every card is a task. One issue can fan out to several agents — add tasks from
  a card's detail screen or with `PROJ-142: fix the retry logic` in quick-add. Tasks sharing an
  issue render under an issue header (key, title, one status badge), reorder as a unit, archive
  one by one, and close out with a single archive-all.
- **Waiting on you**: Review opens with the standing list only you can clear — Linear chain
  stalls ("Yours" for a creative next-up, "Resumable" for a rote one), archived cards whose
  tracker issue still isn't Done, PRs awaiting your review or carrying change requests, and
  manual reminders from quick-add `! text`. Automatic gates self-clear when tracker state
  moves; the sidebar count folds them in.
- **Live rail**: board-spawned agents only, Running above Review, with a pulse + elapsed chip.
  Nothing running reads as two quiet words.
- **Run loop**: card → source picker (existing workspace / repo path / PR worktree via
  SDK-native `checkoutSource`) with a **pre-seeded, editable prompt** — the human layer before
  anything runs — then workspace + agent whose first message is that text → the card mirrors
  the agent's state. Each tracker spawns on its own model lane (work for Jira, personal for
  Linear), and creative or unrouted Linear cards ask once before spawning. Finished agents
  land in Review; Open jumps to the agent in Paseo.
- **Chains**: a Linear card's detail shows its whole chain — every issue in the project with
  state, in delegation order — so a stalled chain's resume point is one tap away.
- **Channel dock**: the integrations live as icons at the board's right edge (Jira, GitHub,
  Linear). Each opens its sheet — assigned Jira issues, open PRs assigned to or created by you,
  or your assigned Linear issues. On phone the channels are buttons in the Today header.
- **Zero write-back**: tracker status is a read-only badge. The board never mutates a tracker.
- **Attachment sources**: `Attach a Jira issue`, `Attach a GitHub PR`, and `Attach a Linear issue`
  in the composer resolve through the same search adapters the board uses.

Board data (cards, day stamps, card→agent links) persists in a daemon-side settings document, so
it survives restarts and reloads. The Jira, GitHub, and Linear adapters (`search`/`list`/`get`)
sit behind one plain adapter interface.

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
- **GitHub personal access token**: token with `repo` scope; stays daemon-side
- **Linear API key**: Linear personal API key; stays daemon-side
- **Spawn providers**: `provider/model` per lane — Jira cards (work lane, default
  `opencode/openrouter/moonshotai/kimi-k3`), Linear cards (personal lane), and a fallback for
  prompt and GitHub cards (default `opencode/deepseek/deepseek-flash`)

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