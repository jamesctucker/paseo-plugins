import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PullRequest } from "../shared/review-requests";
import { useReviewRequests } from "./use-review-requests";

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function PullRequestRow({ pr, theme, compact }: { pr: PullRequest; theme: PluginTheme; compact: boolean }) {
  const styles = useMemo(
    () => ({
      row: {
        paddingVertical: 10,
        paddingHorizontal: compact ? 4 : 8,
        borderRadius: 8,
        gap: 2,
      },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, compact],
  );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${pr.repo} number ${pr.number}: ${pr.title}`}
      onPress={() => void openExternalUrl(pr.url)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.row,
        (hovered || pressed) && { backgroundColor: theme.colors.surface1 },
      ]}
    >
      <Text style={styles.title} numberOfLines={2}>
        {pr.title}
        {pr.isDraft ? " (draft)" : ""}
      </Text>
      <Text style={styles.meta}>
        {pr.repo}#{pr.number} · @{pr.author}
        {pr.assigned && !pr.reviewRequested ? " · assigned to you" : ""} ·{" "}
        {relativeTime(pr.updatedAt)}
      </Text>
    </Pressable>
  );
}

export function ReviewList({ theme, compact }: { theme: PluginTheme; compact: boolean }) {
  const query = useReviewRequests();
  const styles = useMemo(
    () => ({
      status: { color: theme.colors.foregroundMuted, fontSize: 13, padding: 8 },
      error: { color: theme.colors.statusDanger, fontSize: 13, padding: 8 },
    }),
    [theme],
  );

  if (query.isPending) {
    return <Text style={styles.status}>Checking GitHub…</Text>;
  }
  if (query.isError) {
    return (
      <Text style={styles.error}>
        {query.error instanceof Error ? query.error.message : "Could not load review requests."}
      </Text>
    );
  }
  if (query.data.prs.length === 0) {
    return <Text style={styles.status}>Nothing waiting on your review.</Text>;
  }
  return (
    <View style={{ gap: 2 }}>
      {query.data.prs.map((pr) => (
        <PullRequestRow key={pr.url} pr={pr} theme={theme} compact={compact} />
      ))}
    </View>
  );
}
