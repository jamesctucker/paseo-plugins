import {
  type PluginWorkspacePanelProps,
  useRpc,
  useWorkspace,
} from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { type ChangedFile, type RepoSummary, listRepos } from "./diff.shared";
import { type Colors, useColors } from "./panel-ui.client";
import {
  type DiffSelection,
  getDiffSelection,
  selectDiffFile,
  subscribeDiffSelection,
} from "./store.shared";

const STATUS_LETTER: Record<ChangedFile["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
  unmerged: "U",
};

function FileRow({ file, selected, onPress, colors, compact }: {
  file: ChangedFile;
  selected: boolean;
  onPress: () => void;
  colors: Colors;
  compact: boolean;
}) {
  const letter = STATUS_LETTER[file.status];
  const letterColor =
    file.status === "deleted"
      ? colors.danger
      : file.status === "added" || file.status === "untracked"
        ? colors.success
        : colors.accent;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: compact ? 6 : 4,
          paddingHorizontal: 8,
          borderRadius: 6,
          backgroundColor: selected ? colors.surface2 : "transparent",
        }}
      >
        <Text
          style={{
            color: letterColor,
            fontFamily: "monospace",
            fontSize: 12,
            width: 14,
            textAlign: "center",
            fontWeight: "600",
          }}
        >
          {letter}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.foreground, fontSize: 12, flexShrink: 1, fontFamily: "monospace" }}
        >
          {file.path}
        </Text>
        <View style={{ flex: 1 }} />
        {file.untracked ? (
          <Text style={{ color: colors.muted, fontSize: 11 }}>untracked</Text>
        ) : (
          <>
            {file.additions != null && (
              <Text style={{ color: colors.success, fontSize: 11, fontFamily: "monospace" }}>
                +{file.additions}
              </Text>
            )}
            {file.deletions != null && (
              <Text style={{ color: colors.danger, fontSize: 11, fontFamily: "monospace" }}>
                -{file.deletions}
              </Text>
            )}
          </>
        )}
      </View>
    </Pressable>
  );
}

function RepoSection({
  repo,
  expanded,
  onToggle,
  selection,
  onSelect,
  colors,
  compact,
}: {
  repo: RepoSummary;
  expanded: boolean;
  onToggle: () => void;
  selection: DiffSelection | null;
  onSelect: (file: DiffSelection) => void;
  colors: Colors;
  compact: boolean;
}) {
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onToggle}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: compact ? 8 : 6,
            paddingHorizontal: 8,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>{expanded ? "▾" : "▸"}</Text>
          <Text
            style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", flexShrink: 1 }}
            numberOfLines={1}
          >
            {repo.relPath === "." ? "(workspace root)" : repo.relPath}
          </Text>
          {repo.branch.length > 0 && (
            <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
              {repo.branch}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={{ color: colors.muted, fontSize: 11 }}>{repo.files.length}</Text>
          {(repo.additions > 0 || repo.deletions > 0) && (
            <Text style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace" }}>
              {repo.additions > 0 ? `+${repo.additions} ` : ""}
              {repo.deletions > 0 ? `-${repo.deletions}` : ""}
            </Text>
          )}
        </View>
      </Pressable>
      {expanded && (
        <View style={{ paddingLeft: 8 }}>
          {repo.files.map((file) => (
            <FileRow
              key={`${repo.absPath}:${file.path}`}
              file={file}
              compact={compact}
              colors={colors}
              selected={
                selection?.repoPath === repo.absPath && selection.filePath === file.path
              }
              onPress={() =>
                onSelect({
                  repoPath: repo.absPath,
                  repoRelPath: repo.relPath,
                  filePath: file.path,
                  untracked: file.untracked,
                })
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

function RepoList({
  repos,
  selection,
  onSelect,
  colors,
  compact,
}: {
  repos: RepoSummary[];
  selection: DiffSelection | null;
  onSelect: (file: DiffSelection) => void;
  colors: Colors;
  compact: boolean;
}) {
  const dirty = repos.filter((repo) => repo.files.length > 0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (repos.length === 0) {
    return (
      <Text style={{ color: colors.muted, padding: 12 }}>
        No git repositories found under this workspace (searched up to 4 levels deep).
      </Text>
    );
  }
  if (dirty.length === 0) {
    return (
      <Text style={{ color: colors.muted, padding: 12 }}>
        All {repos.length} {repos.length === 1 ? "repository is" : "repositories are"} clean —
        including every nested repo.
      </Text>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }}>
      {dirty.map((repo) => (
        <RepoSection
          key={repo.absPath}
          repo={repo}
          compact={compact}
          colors={colors}
          selection={selection}
          onSelect={onSelect}
          expanded={!collapsed[repo.absPath]}
          onToggle={() =>
            setCollapsed((prev) => ({ ...prev, [repo.absPath]: !prev[repo.absPath] }))
          }
        />
      ))}
      {repos.length > dirty.length && (
        <Text style={{ color: colors.muted, fontSize: 11, padding: 8 }}>
          {repos.length - dirty.length} clean {repos.length - dirty.length === 1 ? "repo" : "repos"}{" "}
          hidden
        </Text>
      )}
    </ScrollView>
  );
}

export function NestedDiffPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, ({ directory }) => ({ directory }));
  const colors = useColors(theme);
  const compact = layout.compact;
  const list = useRpc(listRepos);
  const selection = useSyncExternalStore(subscribeDiffSelection, () =>
    getDiffSelection(workspaceId),
  );

  const reposQuery = useQuery({
    queryKey: ["nested-diff-repos", workspace?.directory],
    queryFn: () => list({ rootPath: workspace?.directory ?? "" }),
    enabled: Boolean(workspace?.directory),
    refetchInterval: 5000,
  });

  const repos = reposQuery.data?.repos ?? [];
  const dirtyCount = repos.filter((repo) => repo.files.length > 0).length;
  const totalChanges = repos.reduce((sum, repo) => sum + repo.files.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: compact ? 12 : 16,
          paddingVertical: compact ? 8 : 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: compact ? 15 : 16, fontWeight: "600" }}>
          Sub-repo diffs
        </Text>
        <View style={{ flex: 1 }} />
        {reposQuery.data && (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {totalChanges} {totalChanges === 1 ? "change" : "changes"} in {dirtyCount}/{repos.length}{" "}
            {repos.length === 1 ? "repo" : "repos"}
          </Text>
        )}
        <Pressable accessibilityRole="button" onPress={() => void reposQuery.refetch()}>
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>Refresh</Text>
        </Pressable>
      </View>

      {!workspace?.directory ? (
        <Text style={{ color: colors.muted, padding: 16 }}>Workspace is unavailable.</Text>
      ) : reposQuery.isPending ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Scanning for git repositories…</Text>
        </View>
      ) : reposQuery.isError ? (
        <Text style={{ color: colors.danger, padding: 12 }}>
          Scan failed:{" "}
          {reposQuery.error instanceof Error ? reposQuery.error.message : String(reposQuery.error)}
        </Text>
      ) : (
        <RepoList
          repos={repos}
          selection={selection}
          onSelect={(file) => selectDiffFile(workspaceId, file)}
          colors={colors}
          compact={compact}
        />
      )}
    </View>
  );
}
