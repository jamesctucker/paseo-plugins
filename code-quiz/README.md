# Code Quiz

A [Paseo](https://paseo.sh/) plugin that turns the repos in your workspaces into a quiz.

Adds a sidebar row that opens a repo picker listing every git repository under your open workspaces. Pick a repo, optionally choose a focus (critical paths, terminology, architecture, data flow) or type your own topic, and the plugin launches a teacher agent that quizzes you on the code, then turns your answers into persistent HTML lessons and reference sheets under `learning/<repo>/`.

## Install

```bash
paseo plugin add git:jamesctucker/paseo-plugins:code-quiz
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## Requirements

- The OpenCode provider on the daemon host (any model; the plugin prefers OpenRouter's DeepSeek V4.1 Flash and falls back to the first available)
- One or more open Paseo workspaces containing git repositories

## How it works

- Discovers repos by walking each open workspace root up to three levels deep, skipping `node_modules` and other vendored directories; the workspace root itself is offered when it is a repo, so a single-repo workspace works out of the box
- Launches the teacher through the Paseo SDK in the repo's workspace, with the teaching loop inlined in the prompt: calibrating quiz first, then lessons written under `learning/<repo>/`
- Repo paths are discovered server-side and validated (segment charset plus a realpath containment check against the workspace root), so a crafted request cannot point the teacher outside a workspace
- The plugin only creates the teacher agent; it never writes to your repos

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

[MIT](../LICENSE)
