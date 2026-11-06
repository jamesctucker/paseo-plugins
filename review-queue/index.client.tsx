import type {
  PluginClientContext,
  PluginPopoverProps,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { ReviewList } from "./client/review-list";
import { useReviewRequests } from "./client/use-review-requests";

function ReviewQueuePopover({ theme, layout, openScreen }: PluginPopoverProps) {
  const styles = useMemo(
    () => ({
      footer: { paddingTop: 4 },
      footerText: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme],
  );
  return (
    <ScrollView
      style={{ maxHeight: layout.compact ? 460 : 400 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
    >
      <ReviewList theme={theme} compact={layout.compact} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open review queue screen"
        onPress={() => openScreen({ screenId: "review-queue" })}
        style={styles.footer}
      >
        <Text style={styles.footerText}>Open full view</Text>
      </Pressable>
    </ScrollView>
  );
}

function ReviewQueueScreen({ theme, layout }: PluginScreenProps) {
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
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: 8 }}>
      <ReviewList theme={theme} compact={layout.compact} />
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
