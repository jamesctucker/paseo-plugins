import { useCallback } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { issueListRpc, issueSearchRpc } from "../shared/contracts";
import { TrackerPicker, type TrackerPickerProps } from "./tracker-picker";

/**
 * The Jira channel: the assigned-to-me list, minus finished work. Search covers
 * anything the token can see, so an issue outside the default JQL is still one
 * keystroke away.
 */

export type JiraSheetProps = Pick<
  TrackerPickerProps,
  "theme" | "open" | "onOpenChange" | "onPick" | "onOpenSettings" | "onBoard"
>;

export function JiraSheet(props: JiraSheetProps) {
  const listIssues = useRpc(issueListRpc);
  const searchIssues = useRpc(issueSearchRpc);
  const list = useCallback(async () => (await listIssues({})).items, [listIssues]);
  const search = useCallback(async (query: string) => (await searchIssues({ query })).items, [searchIssues]);

  return (
    <TrackerPicker
      {...props}
      title="Add from Jira"
      icon="CircleDot"
      searchPlaceholder="Search by key or text"
      emptyMessage="Nothing assigned to you in Jira."
      list={list}
      search={search}
    />
  );
}
