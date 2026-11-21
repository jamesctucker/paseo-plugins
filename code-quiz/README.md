# Code Quiz

A [Paseo](https://paseo.sh/) plugin that turns the repos you have checked out into a quiz.

Adds a sidebar row that opens a repo picker. Pick a repo, optionally choose a focus (critical paths, terminology, architecture, data flow) or type your own topic, and the plugin launches a teacher agent that quizzes you on the code, then turns your answers into persistent HTML lessons and reference sheets.

## Install

```bash
paseo plugin add git:jamesctucker/paseo-plugins:code-quiz
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## Requirements

This plugin is built around a specific workspace layout — a checkout named `the-garage` with:

- `work/` — the repos to be quizzed on
- `learning/` — where lessons and reference sheets persist
- a `teach` skill under `.opencode/skills/` that the teacher agent runs

The daemon finds the checkout by that name among its open workspaces (falling back to `~/the-garage`). If your checkout is named differently, rename it or point the daemon at a workspace with the same layout. Also required: the OpenCode provider on the daemon host.

## How it works

- Lists repos by scanning `work/` one level deep (dot-directories and `.git` folders skipped)
- Launches the teacher through the Paseo SDK, preferring OpenRouter's DeepSeek V4.1 Flash and falling back to the host's first available OpenCode model
- The teacher's working directory is the workspace root, so it reads `work/` and writes `learning/` — the plugin itself only creates the agent and never writes to your repos
- The repo name is validated against `^[A-Za-z0-9][A-Za-z0-9._-]*$`, so a crafted request cannot traverse out of `work/`

## Development

```bash
npm install
npm run typecheck
```

## License

[MIT](../LICENSE)
