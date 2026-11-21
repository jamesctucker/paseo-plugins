# Review Queue

Review Queue adds a sidebar row that lists the open GitHub pull requests waiting on you: ones where your review is requested, and ones assigned to you (draft pull requests cannot have review requests on GitHub, so the assigned search is what surfaces them). Pressing the row opens a popover with each pull request's title, repository, author, and last update time; pressing a pull request opens it on GitHub. When the pull request's repository has a local checkout that the daemon can see (see Setup below), a "New review workspace" action creates a worktree workspace that checks out the pull request and starts a review agent in it. A badge on the row shows how many are waiting, and a full-screen view is available from the popover. The list refreshes every minute.

A "Review workspaces" section at the bottom lists the workspaces the plugin created, tags each as done once its pull request has left the queue, and offers an archive action (with a confirm press) for cleaning them up.

## Setup

The GitHub CLI (`gh`) must be installed and authenticated (`gh auth login`) on the machine running the Paseo daemon.

"New review workspace" needs a local clone of the pull request's repository. The plugin looks for it under the `work/` directory of any workspace the daemon has open (or a workspace that is itself the checkout), and checks that the clone's git origin actually points at the pull request's repository, so a same-named clone of a different repository is never used. The provider, thinking level, and prompt of the review agent are configured in Settings.

## Reads and sends

- Runs `gh search prs --review-requested=@me` and `gh search prs --assignee=@me` on the daemon host, using your `gh` credentials, and reads the results. Nothing is sent anywhere else.
- Reads `git remote get-url origin` in candidate checkouts to verify the repository. The plugin never writes to a repository, a tracker, or a workspace it did not create.
