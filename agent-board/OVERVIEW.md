# Agent Board

Agent Board is a daily execution board for one person. The left pane holds today's committed work, pulled from Jira or written as prompt cards. The right pane shows the agents those cards spawned, grouped into Running and Review. It is an execution surface, not a tracker mirror and not a planning app.

It complements a paper bullet journal instead of replacing it. You pull the day's commitments onto the board each morning, run a card as an agent, and review what finished. The board holds only what is live; the backlog stays in Jira.

## How it works

The board keeps its own local document on the daemon (cards, day stamps, card to agent links). Jira is read through a search, list, and get adapter, so issue keys resolve to cards and issue bodies seed the agent prompt. The board never writes back to Jira; tracker status appears as a read-only badge on the card.

Running a card opens a source picker: an existing workspace, a repo path, or, for GitHub pull request cards, a fresh worktree checked out at the pull request. The picker also pre-seeds an editable prompt with the issue context, so you can shape the first message before anything runs. The card then mirrors its agent's live state, including elapsed time, and finished agents land in Review for a verdict.

Each morning the board offers to carry over unfinished cards from yesterday, the same migration ritual a paper journal uses. Archived cards appear under a quiet Done this week divider and age out after seven days.

## Setup

Open Settings, Plugins, Agent Board to configure:

- **Site domain**: your Atlassian site domain, for example `acme`, or a full host when self-hosted.
- **Email and API token**: an Atlassian API token for that account. The token stays on the daemon.
- **Assigned JQL**: optional override of the default assigned-to-me list.
- **Spawn provider**: the provider used when a card runs.

Requires Paseo 0.15.0 or later on the daemon. Works on desktop and mobile clients.

## Capabilities and limits

- Quick-add accepts a Jira key (`PROJ-142`), a GitHub pull reference (`owner/repo#123` or a pull URL), or plain text as a prompt card.
- The composer attachment source `Attach a Jira issue` resolves through the same search adapter, so an issue snapshot can ride any prompt.
- Reordering is long-press then tap a position on touch devices, with move up and down buttons in the card detail.
- The board reads and writes its own document and Jira through the configured token. It never mutates Jira and does not sync board state between daemons.
- Linear support is planned behind the same adapter interface; only the Jira adapter ships today.