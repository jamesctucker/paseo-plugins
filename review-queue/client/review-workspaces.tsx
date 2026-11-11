import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { tagStyle } from "./review-list";

// Review workspaces are identified by the title the create button stamps on them.
const TITLE_PREFIX = "Code review for ";
const TITLE_KEY = /([\w.-]+\/[\w.-]+#\d+)$/;
// An armed destructive confirm that never stands down degrades into a two-click button.
const CONFIRM_TIMEOUT_MS = 4000;

type ArchiveState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "archiving" }
  | { status: "error"; message: string };

export function useReviewWorkspaces() {
  const paseo = usePaseo();
  return useQuery({
    queryKey: ["review-workspaces"],
    queryFn: async () => {
      const result = await paseo.workspaces.list({});
      return result.entries.filter((entry) => entry.title?.startsWith(TITLE_PREFIX));
    },
  });
}

function ReviewWorkspaceRow({
  id,
  title,
  reviewDone,
  theme,
}: {
  id: string;
  title: string;
  reviewDone: boolean;
  theme: PluginTheme;
}) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ArchiveState>({ status: "idle" });
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    },
    [],
  );

  async function archive() {
    if (state.status === "idle" || state.status === "error") {
      setState({ status: "confirming" });
      disarmTimer.current = setTimeout(() => setState({ status: "idle" }), CONFIRM_TIMEOUT_MS);
      return;
    }
    if (state.status !== "confirming") return;
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setState({ status: "archiving" });
    try {
      await paseo.workspaces.archive(id);
      await queryClient.invalidateQueries({ queryKey: ["review-workspaces"] });
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : "Could not archive the workspace.",
      });
    }
  }

  const confirming = state.status === "confirming";
  const actionLabel = confirming
    ? "Tap again to confirm"
    : state.status === "archiving"
      ? "Archiving…"
      : "Archive";
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{ color: theme.colors.foreground, fontSize: 13, flex: 1 }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {reviewDone ? <Text style={tagStyle(theme, theme.colors.statusSuccess)}>DONE</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            confirming ? `Confirm archive of workspace ${title}` : `Archive workspace ${title}`
          }
          onPress={() => void archive()}
          disabled={state.status === "archiving"}
          style={{
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              color: confirming ? theme.colors.statusDanger : theme.colors.foregroundMuted,
              fontSize: 12,
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      </View>
      {state.status === "error" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{state.message}</Text>
      ) : null}
    </View>
  );
}

export function ReviewWorkspaces({
  theme,
  queueKeys,
}: {
  theme: PluginTheme;
  queueKeys: Set<string>;
}) {
  const query = useReviewWorkspaces();
  const styles = useMemo(
    () => ({
      header: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: "600" as const,
        textTransform: "uppercase" as const,
      },
      divider: { height: 1, backgroundColor: theme.colors.border },
    }),
    [theme],
  );

  const workspaces = query.data ?? [];
  if (workspaces.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <View style={styles.divider} />
        <Text style={styles.header}>Review workspaces</Text>
      </View>
      {workspaces.map((workspace) => {
        const title = workspace.title ?? workspace.name;
        const key = TITLE_KEY.exec(title)?.[1];
        return (
          <ReviewWorkspaceRow
            key={workspace.id}
            id={workspace.id}
            title={title}
            reviewDone={key != null && !queueKeys.has(key)}
            theme={theme}
          />
        );
      })}
    </View>
  );
}
