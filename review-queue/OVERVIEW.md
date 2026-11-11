# Review Queue

Review Queue adds a sidebar row that lists the open GitHub pull requests waiting on you: ones where your review is requested, and ones assigned to you (draft PRs cannot have review requests on GitHub, so the assigned search is what surfaces them). Pressing the row opens a popover with each pull request's title, repository, author, and last update time; pressing a pull request opens it on GitHub. When the pull request's repository has a local checkout under the garage's `work/` directory, a "New review workspace" action creates a Paseo worktree workspace that checks out the pull request, titled after the author and pull request, and starts an agent in it (OpenCode running Kimi K3 via OpenRouter at high reasoning) with a prompt to follow the garage's code-review skill on the checked-out pull request. A badge on the row shows how many are waiting, and a full-screen view is available from the popover. The list refreshes every minute.

A "Review workspaces" section at the bottom lists the workspaces the plugin created, tags each as done once its pull request has left the queue, and offers an archive action (with a confirm press) for cleaning them up.

## Setup

The GitHub CLI (`gh`) must be installed and authenticated (`gh auth login`) on the machine running the Paseo daemon.

## Reads and sends

- Runs `gh search prs --review-requested=@me` and `gh search prs --assignee=@me` on the daemon host, using your `gh` credentials, and reads the results. Nothing is sent anywhere else.
