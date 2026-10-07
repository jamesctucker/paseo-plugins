import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DiffViewerPanel } from "./client/diff-viewer";
import { NestedDiffPanel } from "./client/panel";
import { changedFiles } from "./shared/diff";
import { setDiffTabOpener } from "./shared/store";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "changes",
    title: "Sub-Repo Changes",
    icon: "GitCompareArrows",
    context: "workspace",
    locations: ["explorer"],
    Component: NestedDiffPanel,
  });

  client.addWorkspacePanel({
    id: "diff-viewer",
    title: "File diff",
    icon: "FileDiff",
    context: "workspace",
    locations: ["workspace"],
    Component: DiffViewerPanel,
  });

  client.addCommandCenterItem({
    id: "open-changes",
    title: "Open Sub-Repo Changes",
    icon: "GitCompareArrows",
    keywords: ["git", "diff", "changes", "nested", "subrepo"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("changes", { location: "explorer" });
    },
  });

  client.addCommandCenterItem({
    id: "open-diff-viewer",
    title: "Open file diff",
    icon: "FileDiff",
    keywords: ["git", "diff"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("diff-viewer");
    },
  });

  client.addAttachmentSource(changedFiles);

  // Lets list-panel file clicks open the diff viewer as a main-area tab.
  const removeOpener = setDiffTabOpener((workspaceId) => {
    client.openPanel("diff-viewer", { workspaceId });
  });

  return () => {
    removeOpener();
  };
}
