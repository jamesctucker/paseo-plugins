# Code Quiz

Code Quiz adds a sidebar row that opens a screen listing the repositories under `work/` in a garage-style workspace. Pick a repo, optionally choose a focus, and the plugin launches an OpenCode teacher agent in that workspace. Each repo offers preset focuses for new-engineer onboarding (critical paths, terminology and acronyms, architecture, data flow), or you can type your own. Repo-specific focuses can be added in the plugin's focus table.

The teacher agent runs a `teach` skill: it reads the repo's code as the primary resource, quizzes you to calibrate what you already know, then builds short HTML lessons and reference sheets under `learning/<repo>/` that persist across sessions.

## How it works

The screen talks to a daemon-side handler that scans `work/` for repositories and creates the agent through the Paseo SDK. The agent's working directory is the workspace root so the teach skill can read `work/` and write `learning/`.

## Setup

This plugin targets a specific workspace layout: a checkout named `the-garage` with `work/` and `learning/` directories and a `teach` skill under `.opencode/skills/`. The daemon finds it by that name among the open workspaces (falling back to `~/the-garage`). If your checkout is named differently, rename it or point the daemon at a workspace with the same layout. You also need the OpenCode provider on the daemon host. Teachers launch with OpenRouter's DeepSeek V4.1 Flash when it is in the catalog, and fall back to the host's first available OpenCode model otherwise; switch models in the composer after launch if you prefer another.
