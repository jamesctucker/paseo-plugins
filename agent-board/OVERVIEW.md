# Agent Board

Agent Board is a daily execution board for one person. The left pane holds today's committed work, pulled from Jira, GitHub, or Linear, or written as prompt cards. The right pane shows the agents those cards spawned, grouped into Running and Review. It is an execution surface, not a tracker mirror and not a planning app.

Every card is a task. When one issue fans out to several agents, each task gets its own card, and cards that share an issue render together under a small issue header. Add tasks from a card's detail screen, or with quick-add syntax like `PROJ-142: fix the retry logic`. Tasks archive one by one; a group action closes out the whole issue.

It complements a paper bullet journal instead of replacing it. You pull the day's commitments onto the board each morning, run a card as an agent, and review what finished. The board holds only what is live; the backlog stays in the trackers.

Review opens with a "Waiting on you" group: the standing list of things only you can clear. Chain stalls surface from your Linear projects (a creative next-up reads "Yours", a rote one "Resumable"), archiving a card whose issue is not Done in its tracker parks a quiet reminder until it moves, pull requests waiting on your review or carrying change requests appear, and quick-add `! text` writes a manual reminder for everything no machine can detect. Automatic gates clear themselves when the tracker state moves; manual gates clear when you check them off. The sidebar row folds all of this into its needs-you count.

## How it works

The board keeps its own local document on the daemon (cards, day stamps, card to agent links). Jira, GitHub, and Linear are read through search, list, and get adapters behind one interface, so keys and pull references resolve to cards and bodies seed the agent prompt. The board never writes back to a tracker; status appears as a read-only badge on the card.

The integrations live in a channel dock at the board's right edge: one icon per channel opens its sheet (assigned Jira issues, open pull requests assigned to, created by, or awaiting review from you, or your assigned Linear issues). On phone layouts the channels are buttons in the Today header instead.

Running a card opens a short form: workspace, prompt, model, and thinking level, with one Run button at the bottom. The workspace defaults to your most recent one; its picker also offers a repo path (checked before anything is created) or, for GitHub pull request cards, a fresh worktree checked out at the pull request. The prompt is pre-seeded with the issue context, so you can shape the first message before anything runs. Each tracker spawns on its own model lane (a work model for Jira, a personal model for Linear, a fallback for everything else), configured in settings. The form can override the model and, when the model offers levels, its thinking level for that one run. On desktop, Cmd+Enter runs. Linear cards carry their `Route:` doctrine line as a badge, and running a creative or unrouted card asks once first. The card then mirrors its agent's live state, including elapsed time, and finished agents land in Review for a verdict.

A Linear card's detail screen shows its chain: every issue in its Linear project with state, in delegation order, so the resume point is one tap away.

Each morning the board offers to carry over unfinished cards from yesterday, the same migration ritual a paper journal uses. Archived cards appear under a quiet Done this week divider and age out after seven days. The Today header counts what you finished today, and an emptied list reads as a cleared day rather than a blank morning.

## Setup

Open Settings, Plugins, Agent Board to configure:

- **Site domain**: your Atlassian site domain, for example `acme`, or a full host when self-hosted.
- **Email and API token**: an Atlassian API token for that account. The token stays on the daemon.
- **Assigned JQL**: optional override of the default assigned-to-me list.
- **GitHub personal access token**: a token with repo scope. The token stays on the daemon.
- **Linear API key**: a Linear personal API key. The key stays on the daemon.
- **Spawn providers**: the `provider/model` per lane: one for Jira cards (the work lane), one for Linear cards (the personal lane), and a fallback for prompt and GitHub cards, for example `opencode/deepseek/deepseek-flash`.

Requires Paseo 0.15.0 or later on the daemon. Works on desktop and mobile clients.

## Capabilities and limits

- Quick-add accepts a Jira or Linear key (`PROJ-142`, `ENG-5`), a GitHub pull reference (`owner/repo#123` or a pull URL), or plain text as a prompt card. Append a colon and a task name (`PROJ-142: fix the retry logic`) to add a named task under the issue. Bare keys try Jira first, then Linear; pull references resolve to the real PR title when the GitHub channel is configured. Prefix with `!` to write a manual "Waiting on you" reminder instead of a card.
- Gates read fresh tracker state when the board opens, when a card archives, and on refresh. They need the matching channel configured; an unconfigured or unreachable channel simply contributes no gates.
- Chain gates and the chain section come from Linear projects: the project is the chain and blocked-by relations give the order. Jira has no equivalent yet.
- The composer attachment sources `Attach a Jira issue`, `Attach a GitHub PR`, and `Attach a Linear issue` resolve through the same search adapters, so a snapshot can ride any prompt.
- Reordering is long-press then tap a position (a grip handle appears on hover on desktop).
- The board reads and writes its own document and reads the trackers through the configured tokens. It never mutates a tracker and does not sync board state between daemons.