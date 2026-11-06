# Review Queue

Review Queue adds a sidebar row that lists the open GitHub pull requests waiting on you: ones where your review is requested, and ones assigned to you (draft PRs cannot have review requests on GitHub, so the assigned search is what surfaces them). Pressing the row opens a popover with each pull request's title, repository, author, and last update time; pressing a pull request opens it on GitHub. A badge on the row shows how many are waiting, and a full-screen view is available from the popover. The list refreshes every minute.

## Setup

The GitHub CLI (`gh`) must be installed and authenticated (`gh auth login`) on the machine running the Paseo daemon.

## Reads and sends

- Runs `gh search prs --review-requested=@me` and `gh search prs --assignee=@me` on the daemon host, using your `gh` credentials, and reads the results. Nothing is sent anywhere else.
