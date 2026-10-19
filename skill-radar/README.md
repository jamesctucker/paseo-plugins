# Skill Radar

A Paseo plugin that ranks your agent skills against the conversation you just had. Built from `artifacts/40-skill-radar-design-brief.md`.

## Install

```bash
paseo plugin install /absolute/path/to/skill-radar
# or from Git
paseo plugin add git:jamesctucker/paseo-plugins:skill-radar
```

Requires Paseo 0.12 or later, and the global plugins switch enabled on the daemon.

## Setup

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | OpenRouter credential | falls back to `~/.local/share/opencode/auth.json` |
| `SKILL_RADAR_MODEL` | Decision model | `cloudflare/clef-flash` |
| `SKILL_RADAR_GARAGE_ROOT` | Workspace root holding `.opencode/skills` | `~/the-garage` |
| `SKILL_RADAR_SKILL_ROOTS` | Colon separated roots; first is workspace | unset |

The model call uses OpenRouter's `POST /api/alpha/decisions` endpoint. Clef is a decision model and rejects `chat/completions`.

## What it contributes

| Surface | Behavior |
|---------|----------|
| Explorer panel (right side) | Ranked "Relevant now" suggestions and a collapsible catalog of every skill |
| Composer pill | Top skill at or above 70 percent confidence, per agent |
| Command Center | "Open Skill Radar" |

Clicking a skill row or the pill copies the skill name.

## Development

```bash
npm install
npm run typecheck
paseo plugin reload skill-radar
paseo plugin logs skill-radar
```

Server code scans skill directories and calls OpenRouter. Client code observes agent timelines, debounces five seconds, and owns the Explorer panel and composer pill. The last five user messages are the only context sent.

The server logs one line per classification so `paseo plugin logs` shows what the model returned:
`Skill Radar: classify ok → diagnose 75%, code-review 2%`.
