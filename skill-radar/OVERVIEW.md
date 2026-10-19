# Skill Radar

Skill Radar shows which of your agent skills fit the work in front of you. You know the skills exist, but in the middle of a session it is easy to forget the right one. Skill Radar ranks them against the conversation you just had, then makes the name one click away.

## How it works

It reads the last five user messages from the agent tab you are looking at, sends them together with the skill catalog to a decision model, and ranks the catalog by probability. The Explorer panel shows the top matches and the full catalog. The composer pill appears when the best match is at least 70 percent.

Classification runs five seconds after a message settles, so typing does not trigger a request. A repeated classification of the same conversation comes from a one minute cache.

## Setup

Skill Radar needs Paseo 0.12 or later and an OpenRouter account.

It reads `OPENROUTER_API_KEY` from the daemon environment. If that is unset, it falls back to the OpenRouter login that OpenCode already stores in `~/.local/share/opencode/auth.json`. You can also set `SKILL_RADAR_MODEL` to a different decision model. The default is `cloudflare/clef-flash`.

Skills are read from `~/the-garage/.opencode/skills` and `~/.agents/skills`. Set `SKILL_RADAR_GARAGE_ROOT` to move the workspace root, or `SKILL_RADAR_SKILL_ROOTS` to a colon separated list of directories. The first root counts as workspace skills and the rest as global.

## What you get

The panel follows the focused agent, so switching agent tabs switches the suggestions. It has two sections. Relevant now shows ranked matches with confidence scores and the first "Use when" phrase from each description. All skills is a collapsible category list of the whole catalog. Clicking any row copies the skill name. A short toast confirms the copy. When a description is too long for its row, hovering or long pressing reveals the full text.

The composer pill sits next to Tasks and Subagents on each agent. It shows the top skill when confidence is at least 70 percent, copies the name on press, and disappears after 30 seconds or when new context arrives. The pill is the only thing that interrupts: a dismissed warning banner and low confidence matches stay in the panel.

## Limits

Classification uses only user messages. Assistant replies, tool calls, and file paths are not sent, so a conversation that turns on code the agent wrote may need a sentence from you to classify well.

When OpenRouter is unreachable, the panel says so and keeps the catalog usable. A skill shows the `auto` badge only when its frontmatter sets `auto: true`; those rows are dimmed because the agent reaches for them on its own.
