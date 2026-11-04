import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Modal } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { issueListRpc } from "../shared/contracts";
import type { IssueSummary } from "../shared/tracker";

/**
 * Add-from-Jira sheet: the assigned-to-me list. Skeleton rows while loading so
 * the sheet never flickers empty, and an inline auth banner that opens the
 * token config.
 */

export interface JiraSheetProps {
  theme: PluginTheme;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPick(issue: IssueSummary): void;
  onOpenSettings(): void;
}

export function JiraSheet({ theme, open, onOpenChange, onPick, onOpenSettings }: JiraSheetProps) {
  const listIssues = useRpc(issueListRpc);
  const [items, setItems] = useState<IssueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: found } = await listIssues({});
      setItems(found);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    // listIssues identity is stable per installation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && items === null && !loading && error === null) void load();
  }, [open, items, loading, error, load]);

  return (
    <Modal
      title="Add from Jira"
      icon={<Text style={{ color: theme.colors.foreground, fontSize: 16 }}>＋</Text>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content>
        <View style={{ gap: 2, paddingVertical: 8 }}>
          {loading ? (
            <View>{[0, 1, 2, 3, 4].map((row) => SkeletonRow(theme, row))}</View>
          ) : error !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 8 }}>
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12, flexShrink: 1 }}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onOpenChange(false);
                  onOpenSettings();
                }}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Open token config</Text>
              </Pressable>
            </View>
          ) : (items ?? []).length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 8 }}>
              Nothing assigned to you.
            </Text>
          ) : (
            (items ?? []).map((issue) => (
              <Pressable
                key={issue.id}
                accessibilityRole="button"
                accessibilityLabel={issue.title}
                onPress={() => {
                  onPick(issue);
                  onOpenChange(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 7,
                  paddingHorizontal: 8,
                  borderRadius: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: "Menlo" }}>
                  {issue.identifier}
                </Text>
                <Text
                  style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500", flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {issue.title}
                </Text>
                <View style={{ flex: 1 }} />
                {issue.status ? (
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{issue.status}</Text>
                ) : null}
              </Pressable>
            ))
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh Jira list" onPress={() => void load()} style={{ padding: 8 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Refresh</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function SkeletonRow(theme: PluginTheme, key: number) {
  return (
    <View key={key} style={{ flexDirection: "row", gap: 8, paddingVertical: 8, paddingHorizontal: 8 }}>
      <View style={{ width: 52, height: 10, borderRadius: 5, backgroundColor: theme.colors.surface2 }} />
      <View
        style={{
          height: 10,
          borderRadius: 5,
          backgroundColor: theme.colors.surface2,
          flex: 1,
          maxWidth: 140 + key * 12,
        }}
      />
    </View>
  );
}