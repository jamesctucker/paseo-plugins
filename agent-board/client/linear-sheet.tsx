import { useCallback } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { linearListRpc, linearSearchRpc } from "../shared/contracts";
import { TrackerPicker, type TrackerPickerProps } from "./tracker-picker";

/** The Linear channel: assigned issues, minus completed and canceled. */

export type LinearSheetProps = Pick<
  TrackerPickerProps,
  "theme" | "open" | "onOpenChange" | "onPick" | "onOpenSettings" | "onBoard"
>;

export function LinearSheet(props: LinearSheetProps) {
  const listIssues = useRpc(linearListRpc);
  const searchIssues = useRpc(linearSearchRpc);
  const list = useCallback(async () => (await listIssues({})).items, [listIssues]);
  const search = useCallback(async (query: string) => (await searchIssues({ query })).items, [searchIssues]);

  return (
    <TrackerPicker
      {...props}
      title="Add from Linear"
      icon="Layers"
      searchPlaceholder="Search by key or text"
      emptyMessage="Nothing assigned to you in Linear."
      list={list}
      search={search}
    />
  );
}
