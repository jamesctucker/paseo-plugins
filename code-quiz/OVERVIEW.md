# Code Quiz

Code Quiz adds a sidebar row that opens a screen listing the repositories under `work/` in your garage checkout. Pick a repo, optionally choose a focus, and the plugin launches an OpenCode teacher agent in the garage workspace. Each repo offers preset focuses for new-engineer onboarding (critical paths, terminology and acronyms, architecture, data flow), or you can type your own. Repo-specific focuses can be added in `shared/focuses.ts`.

The teacher agent runs the garage's `teach` skill: it reads the repo's code as the primary resource, quizzes you to calibrate what you already know, then builds short HTML lessons and reference sheets under `learning/<repo>/` that persist across sessions.

## How it works

The screen talks to a daemon-side handler that scans `work/` for repositories and creates the agent through the Paseo SDK. The agent's working directory is the garage root so the teach skill can read `work/` and write `learning/`.

## Setup

Requires the OpenCode provider on the daemon host and a garage checkout with the `teach` skill installed (the garage ships it under `.opencode/skills/`). Teacher agents launch with OpenRouter's DeepSeek V4.1 Flash (`openrouter/deepseek/deepseek-v4.1-flash`); switch models in the composer afterward if you want a different one.
