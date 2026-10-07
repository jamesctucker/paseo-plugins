import {
  type PluginWorkspacePanelProps,
  useRpc,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { type ChangedFile, type RepoSummary, listRepos } from "../shared/diff";
import { type Colors, useColors } from "./panel-ui";
import {
  type DiffSelection,
  getDiffSelection,
  selectDiffFile,
  subscribeDiffSelection,
} from "../shared/store";

const STATUS_LETTER: Record<ChangedFile["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
  unmerged: "U",
};

function letterColor(status: ChangedFile["status"], colors: Colors): string {
  if (status === "deleted") return colors.danger;
  if (status === "added" || status === "untracked") return colors.success;
  return colors.accent;
}

/** Split a git path into the row's identity (basename) and its context (directory). */
function splitPath(filePath: string): { base: string; dir: string | null } {
  const trimmed = filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return { base: trimmed, dir: null };
  return { base: trimmed.slice(slash + 1), dir: trimmed.slice(0, slash) };
}

/**
 * Keep the first segments and the immediate parent, cutting the middle. Rows
 * in the same long directory stay distinguishable; end-truncation made them
 * identical.
 */
function squashPath(dir: string, max = 42): string {
  if (dir.length <= max) return dir;
  const segments = dir.split("/");
  const last = segments[segments.length - 1];
  let head = segments[0];
  for (const segment of segments.slice(1, -1)) {
    const candidate = `${head}/${segment}`;
    if (`${candidate}/…/${last}`.length > max) break;
    head = candidate;
  }
  return `${head}/…/${last}`;
}

function CountBadge({ label, colors }: { label: string; colors: Colors }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface2,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

function FileRow({ file, selected, onPress, colors, compact }: {
  file: ChangedFile;
  selected: boolean;
  onPress: () => void;
  colors: Colors;
  compact: boolean;
}) {
  const { base, dir } = splitPath(file.path);
  const statParts = [
    file.additions ? `+${file.additions}` : "",
    file.deletions ? `-${file.deletions}` : "",
  ].filter(Boolean);
  const stats = !file.untracked && statParts.length > 0 ? `, ${statParts.join(" ")}` : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${base}${dir ? `, in ${dir}` : ""}, ${file.status}${stats}`}
      onPress={onPress}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: compact ? 10 : 8,
          paddingHorizontal: 10,
          borderRadius: 6,
          borderLeftWidth: 2,
          borderLeftColor: selected ? colors.accent : "transparent",
          backgroundColor: selected ? colors.surface2 : "transparent",
        }}
      >
        <Text
          style={{
            color: letterColor(file.status, colors),
            fontFamily: "monospace",
            fontSize: 12,
            width: 14,
            textAlign: "center",
            fontWeight: "600",
          }}
        >
          {STATUS_LETTER[file.status]}
        </Text>
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: 13, fontWeight: "500" }}
          >
            {base}
          </Text>
          {dir != null && (
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>
              {squashPath(dir)}
            </Text>
          )}
        </View>
        {!file.untracked && (
          <View style={{ flexDirection: "row", gap: 6, minWidth: 72, justifyContent: "flex-end" }}>
            {file.additions != null && file.additions > 0 && (
              <Text style={{ color: colors.success, fontSize: 11, fontFamily: "monospace" }}>
                +{file.additions}
              </Text>
            )}
            {file.deletions != null && file.deletions > 0 && (
              <Text style={{ color: colors.danger, fontSize: 11, fontFamily: "monospace" }}>
                -{file.deletions}
              </Text>
            )}
          </View>
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
  // Tracked changes are the reason the panel exists; untracked files stay one
  // tap away but out of the scan path.
  const tracked = repo.files.filter((file) => !file.untracked);
  const untracked = repo.files.filter((file) => file.untracked);
  const [showUntracked, setShowUntracked] = useState(false);

  const renderRow = (file: ChangedFile) => (
    <FileRow
      key={`${repo.absPath}:${file.path}`}
      file={file}
      compact={compact}
      colors={colors}
      selected={selection?.repoPath === repo.absPath && selection.filePath === file.path}
      onPress={() =>
        onSelect({
          repoPath: repo.absPath,
          repoRelPath: repo.relPath,
          filePath: file.path,
          untracked: file.untracked,
        })
      }
    />
  );

  return (
    <View
      style={{
        backgroundColor: colors.surface1,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${repo.relPath === "." ? "workspace root" : repo.relPath}${
          repo.branch ? `, branch ${repo.branch}` : ""
        }, ${repo.files.length} changed files, ${expanded ? "collapse" : "expand"}`}
        onPress={onToggle}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: compact ? 12 : 10,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12, width: 12 }}>
            {expanded ? "▾" : "▸"}
          </Text>
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
          <CountBadge label={String(repo.files.length)} colors={colors} />
          {(repo.additions > 0 || repo.deletions > 0) && (
            <Text style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace" }}>
              {repo.additions > 0 ? `+${repo.additions} ` : ""}
              {repo.deletions > 0 ? `-${repo.deletions}` : ""}
            </Text>
          )}
        </View>
      </Pressable>
      {expanded && (
        <View style={{ paddingHorizontal: 4, paddingBottom: 6, gap: 1 }}>
          {tracked.map(renderRow)}
          {untracked.length > 0 && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${showUntracked ? "Hide" : "Show"} ${untracked.length} untracked files`}
                onPress={() => setShowUntracked((prev) => !prev)}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: compact ? 10 : 8,
                    paddingHorizontal: 10,
                    marginTop: 2,
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12, width: 14, textAlign: "center" }}>
                    {showUntracked ? "▾" : "▸"}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {untracked.length} untracked {untracked.length === 1 ? "file" : "files"}
                  </Text>
                </View>
              </Pressable>
              {showUntracked && untracked.map(renderRow)}
            </>
          )}
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
  // Root stays pinned; after that, the busiest repo is the most likely target.
  const dirty = repos
    .filter((repo) => repo.files.length > 0)
    .sort((a, b) => {
      if (a.relPath === ".") return -1;
      if (b.relPath === ".") return 1;
      return b.files.length - a.files.length || a.relPath.localeCompare(b.relPath);
    });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (repos.length === 0) {
    return (
      <Text style={{ color: colors.muted, padding: 16, fontSize: 13 }}>
        No git repositories found under this workspace (searched up to 4 levels deep).
      </Text>
    );
  }
  if (dirty.length === 0) {
    return (
      <Text style={{ color: colors.muted, padding: 16, fontSize: 13 }}>
        All {repos.length} {repos.length === 1 ? "repository is" : "repositories are"} clean —
        including every nested repo.
      </Text>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: compact ? 10 : 12, gap: 8 }}
    >
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
        <Text
          style={{
            color: colors.muted,
            fontSize: 11,
            textAlign: "center",
            paddingVertical: 4,
          }}
        >
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
    queryKey: ["nested-changes-repos", workspace?.directory],
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
          paddingVertical: compact ? 10 : 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: compact ? 15 : 16, fontWeight: "600" }}>
          Nested Changes
        </Text>
        {reposQuery.data && (
          <CountBadge
            label={`${totalChanges} changes · ${dirtyCount}/${repos.length} repos`}
            colors={colors}
          />
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          onPress={() => void reposQuery.refetch()}
        >
          <View
            style={{
              backgroundColor: colors.surface2,
              borderRadius: 8,
              padding: 6,
            }}
          >
            <Icon name="RefreshCw" size={14} color={colors.accent} />
          </View>
        </Pressable>
      </View>

      {!workspace?.directory ? (
        <Text style={{ color: colors.muted, padding: 16, fontSize: 13 }}>
          Workspace is unavailable.
        </Text>
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
