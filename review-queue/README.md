# Review Queue

A [Paseo](https://paseo.sh/) plugin that surfaces the GitHub pull requests waiting on your review.

Adds a sidebar row with a waiting-count badge. Pressing it opens a popover listing every open pull request where your review is requested or that is assigned to you, including drafts. Pressing a pull request opens it on GitHub.

When the pull request's repository has a local clone the daemon can see, **New review workspace** creates a worktree workspace that checks out the pull request and starts a review agent in it — provider, thinking level, and prompt are configurable in Settings. A review-workspaces section tracks the workspaces the plugin created, marks them done once the pull request leaves your queue, and offers one-press archiving.

## Install

```bash
paseo plugin add git:jamesctucker/paseo-plugins:review-queue
```

Requires the daemon-wide **Enable plugins** switch (Settings → Plugins).

## Requirements

- The GitHub CLI (`gh`) installed and authenticated on the machine running the Paseo daemon
- For "New review workspace": a local clone of the repository under a workspace's `work/` directory (or a workspace that is itself the clone), and a review-agent provider configured in the plugin's settings

## How it works

- Lists pull requests with `gh search prs --review-requested=@me` and `--assignee=@me`, validated with zod rather than trusting the CLI output shape
- Resolves local checkouts by name and verifies the clone's `git remote get-url origin` actually points at the pull request's repository, so same-named clones of different repositories are never used
- Never writes to a repository or tracker; only creates and archives its own worktree workspaces

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

[MIT](../LICENSE)
