import { useCallback } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { githubListRpc, githubSearchRpc } from "../shared/contracts";
import { TrackerPicker, type TrackerPickerProps } from "./tracker-picker";

/** The GitHub channel: only pull requests, since a PR is what can seed a worktree checkout. */

export type GitHubSheetProps = Pick<
  TrackerPickerProps,
  "theme" | "open" | "onOpenChange" | "onPick" | "onOpenSettings" | "onBoard"
>;

export function GitHubSheet(props: GitHubSheetProps) {
  const listPrs = useRpc(githubListRpc);
  const searchPrs = useRpc(githubSearchRpc);
  const list = useCallback(async () => (await listPrs({})).items, [listPrs]);
  const search = useCallback(async (query: string) => (await searchPrs({ query })).items, [searchPrs]);

  return (
    <TrackerPicker
      {...props}
      title="Add from GitHub"
      icon="GitPullRequest"
      searchPlaceholder="Search by repo, number, or text"
      emptyMessage="No open pull requests assigned to or created by you."
      // `owner/repo#123` at 11pt mono needs about twice the Jira key column.
      keyColumnWidth={190}
      list={list}
      search={search}
    />
  );
}
