import type { PluginContext } from "@getpaseo/plugin";
import {
  addComment,
  changedFiles,
  getFileDiff,
  listComments,
  listRepos,
  removeComment,
  searchChangedFiles,
} from "./diff.shared";
import { DiffViewerPanel } from "./diff-viewer.client";
import { contributeDiffClient } from "./entrypoint.client";
import {
  handleAddComment,
  handleFileDiff,
  handleListComments,
  handleListRepos,
  handleRemoveComment,
  handleSearchChangedFiles,
} from "./handlers.server";
import { NestedDiffPanel } from "./panel.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(listRepos, handleListRepos);
  plugin.handle(getFileDiff, handleFileDiff);
  plugin.handle(listComments, handleListComments);
  plugin.handle(addComment, handleAddComment);
  plugin.handle(removeComment, handleRemoveComment);
  plugin.handle(searchChangedFiles, handleSearchChangedFiles);

  plugin.addWorkspacePanel({
    id: "changes",
    title: "Sub-Repo Changes",
    icon: "GitCompareArrows",
    context: "workspace",
    locations: ["explorer"],
    Component: NestedDiffPanel,
  });

  plugin.addWorkspacePanel({
    id: "diff-viewer",
    title: "File diff",
    icon: "FileDiff",
    context: "workspace",
    locations: ["workspace"],
    Component: DiffViewerPanel,
  });

  plugin.addCommandCenterItem({
    id: "open-changes",
    title: "Open Sub-Repo Changes",
    icon: "GitCompareArrows",
    keywords: ["git", "diff", "changes", "nested", "subrepo"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("changes", { location: "explorer" });
    },
  });

  plugin.addCommandCenterItem({
    id: "open-diff-viewer",
    title: "Open file diff",
    icon: "FileDiff",
    keywords: ["git", "diff"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("diff-viewer");
    },
  });

  plugin.addAttachmentSource(changedFiles);
  plugin.addClientSide(contributeDiffClient);

  return () => {};
}
