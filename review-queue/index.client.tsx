import type {
  PluginClientContext,
  PluginPopoverProps,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ReviewList } from "./client/review-list";
import { ReviewWorkspaces } from "./client/review-workspaces";
import { SummaryStrip } from "./client/summary-strip";
import { useReviewRequests } from "./client/use-review-requests";

function useQueueKeys(): Set<string> {
  const query = useReviewRequests();
  return useMemo(
    () => new Set((query.data?.prs ?? []).map((pr) => `${pr.repo}#${pr.number}`)),
    [query.data],
  );
}

function ReviewQueuePopover({ theme, layout, openScreen }: PluginPopoverProps) {
  const queueKeys = useQueueKeys();
  const styles = useMemo(
    () => ({
      footerText: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme],
  );
  return (
    <ScrollView
      style={{ maxHeight: layout.compact ? 400 : 460 }}
      contentContainerStyle={{ padding: 16, gap: 20 }}
    >
      <View style={{ gap: 8 }}>
        <SummaryStrip theme={theme} />
        <ReviewList theme={theme} compact={layout.compact} />
      </View>
      <ReviewWorkspaces theme={theme} queueKeys={queueKeys} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open review queue screen"
        onPress={() => openScreen({ screenId: "review-queue" })}
      >
        <Text style={styles.footerText}>Open full view</Text>
      </Pressable>
    </ScrollView>
  );
}

function ReviewQueueScreen({ theme, layout }: PluginScreenProps) {
  const queueKeys = useQueueKeys();
  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
    }),
    [theme, layout.compact],
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <SummaryStrip theme={theme} />
        <ReviewList theme={theme} compact={layout.compact} />
      </View>
      <ReviewWorkspaces theme={theme} queueKeys={queueKeys} />
    </ScrollView>
  );
}

function ReviewQueueItem({ theme, openPopover }: PluginSidebarItemProps) {
  const query = useReviewRequests();
  const count = query.data?.prs.length ?? 0;
  const badge = useMemo(
    () => ({ color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" as const }),
    [theme],
  );
  return (
    <SidebarRow
      icon="GitPullRequestArrow"
      trailing={count > 0 ? <Text style={badge}>{count}</Text> : undefined}
      onPress={() => openPopover(ReviewQueuePopover)}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "review-queue", title: "Review queue", Component: ReviewQueueScreen });
  client.addSidebarHeaderItem({ id: "review-queue", title: "Review queue", Component: ReviewQueueItem });
  return () => {};
}
