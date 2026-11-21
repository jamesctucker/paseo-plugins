# Code Quiz

Code Quiz adds a sidebar row that opens a screen listing every git repository under your open Paseo workspaces, including the workspace root itself when it is a repo. Pick a repo, optionally choose a focus, and the plugin launches an OpenCode teacher agent in that workspace. Each repo offers preset focuses for new-engineer onboarding (critical paths, terminology and acronyms, architecture, data flow), or you can type your own. Repo-specific focuses can be added in the plugin's focus table.

The teacher quizzes you on the repo's code to calibrate what you already know, then builds short HTML lessons and reference sheets under `learning/<repo>/` in the same workspace, persisting across sessions. It picks up where it left off if you return.

## How it works

The screen talks to a daemon-side handler that walks the open workspace roots (up to three levels deep, skipping `node_modules` and other vendored directories) and creates the agent through the Paseo SDK. The agent's working directory is the workspace the repo belongs to, so it reads the repo and writes lessons in place. Repo paths are discovered server-side and validated against the workspace root, so a crafted request cannot point the teacher outside a workspace.

## Setup

Requires the OpenCode provider on the daemon host. Teachers launch with OpenRouter's DeepSeek V4.1 Flash when it is in the catalog, and fall back to the host's first available OpenCode model otherwise; switch models in the composer after launch if you prefer another.
