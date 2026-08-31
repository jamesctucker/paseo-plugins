import {
  type PluginWorkspacePanelProps,
  useRpc,
} from "@getpaseo/plugin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useSyncExternalStore } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { addComment, getFileDiff, listComments, removeComment } from "./diff.shared";
import { DiffView, useColors } from "./panel-ui.client";
import {
  getDiffSelection,
  subscribeDiffSelection,
} from "./store.shared";

/**
 * Main-area tab that shows the diff of the file currently selected in the
 * Explorer list panel. Re-renders live as the selection changes.
 */
export function DiffViewerPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const colors = useColors(theme);
  const selection = useSyncExternalStore(subscribeDiffSelection, () =>
    getDiffSelection(workspaceId),
  );
  const queryClient = useQueryClient();
  const fetchDiff = useRpc(getFileDiff);
  const fetchComments = useRpc(listComments);
  const addCommentRpc = useRpc(addComment);
  const removeCommentRpc = useRpc(removeComment);

  const diffKey = useMemo(
    () => ["sub-repo-changes-file", selection?.repoPath, selection?.filePath] as const,
    [selection?.repoPath, selection?.filePath],
  );
  const commentsKey = useMemo(
    () => ["sub-repo-changes-comments", selection?.repoPath, selection?.filePath] as const,
    [selection?.repoPath, selection?.filePath],
  );

  const query = useQuery({
    queryKey: diffKey,
    queryFn: () =>
      fetchDiff({
        repoPath: selection!.repoPath,
        filePath: selection!.filePath,
        untracked: selection!.untracked,
      }),
    enabled: selection != null,
    refetchInterval: 5000,
  });

  const commentsQuery = useQuery({
    queryKey: commentsKey,
    queryFn: () => fetchComments({ repoPath: selection!.repoPath, filePath: selection!.filePath }),
    enabled: selection != null,
    refetchInterval: 15000,
  });

  const compact = layout.compact;

  if (!selection) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
          padding: 24,
          gap: 8,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
          No file selected
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>
          Pick a changed file in Sub-Repo Changes (Explorer).
        </Text>
      </View>
    );
  }

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
        <Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
          {selection.repoRelPath === "." ? "" : `${selection.repoRelPath} / `}
        </Text>
        <Text
          style={{
            color: colors.foreground,
            fontSize: compact ? 13 : 14,
            fontWeight: "600",
            fontFamily: "monospace",
            flexShrink: 2,
          }}
          numberOfLines={1}
        >
          {selection.filePath}
        </Text>
        {(commentsQuery.data?.comments.length ?? 0) > 0 && (
          <Text style={{ color: colors.accent, fontSize: 11 }}>
            {commentsQuery.data!.comments.length}{" "}
            {commentsQuery.data!.comments.length === 1 ? "comment" : "comments"}
          </Text>
        )}
      </View>
      {query.isPending ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Loading diff…</Text>
        </View>
      ) : query.isError ? (
        <Text style={{ color: colors.danger, padding: 12 }}>
          Failed to load diff:{" "}
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </Text>
      ) : (
        <DiffView
          diff={query.data.diff}
          truncated={query.data.truncated}
          binary={query.data.binary}
          colors={colors}
          comments={commentsQuery.data?.comments ?? []}
          onAddComment={(side, line, body) => {
            void addCommentRpc({
              repoPath: selection.repoPath,
              filePath: selection.filePath,
              side,
              line,
              body,
            }).then((result) => {
              queryClient.setQueryData(commentsKey, result);
            });
          }}
          onRemoveComment={(commentId) => {
            void removeCommentRpc({
              repoPath: selection.repoPath,
              filePath: selection.filePath,
              commentId,
            }).then((result) => {
              queryClient.setQueryData(commentsKey, result);
            });
          }}
        />
      )}
    </View>
  );
}
