import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { githubListRpc } from "../shared/contracts";
import { monoFont } from "./ui";
import type { IssueSummary } from "../shared/tracker";

/**
 * Add-from-GitHub sheet: open PRs assigned to the user. Skeleton rows while
 * loading so the sheet never flickers empty, and an inline auth banner that
 * opens the token config. Mirrors the Jira sheet's structure.
 */

export interface GitHubSheetProps {
  theme: PluginTheme;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPick(pr: IssueSummary): void;
  onOpenSettings(): void;
}

export function GitHubSheet({ theme, open, onOpenChange, onPick, onOpenSettings }: GitHubSheetProps) {
  const listPrs = useRpc(githubListRpc);
  const [items, setItems] = useState<IssueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: found } = await listPrs({});
      setItems(found);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    // listPrs identity is stable per installation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && items === null && !loading && error === null) void load();
  }, [open, items, loading, error, load]);

  return (
    <Modal
      title="Add from GitHub"
      icon={<Icon name="GitPullRequest" size={16} color={theme.colors.foreground} />}
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
                accessibilityLabel="Open token config"
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
              No open pull requests assigned to or created by you.
            </Text>
          ) : (
            (items ?? []).map((pr) => (
              <Pressable
                key={pr.id}
                accessibilityRole="button"
                accessibilityLabel={pr.title}
                onPress={() => {
                  onPick(pr);
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
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: monoFont }}>
                  {pr.identifier}
                </Text>
                <Text
                  style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500", flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {pr.title}
                </Text>
                <View style={{ flex: 1 }} />
                {pr.status ? (
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{pr.status}</Text>
                ) : null}
              </Pressable>
            ))
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh GitHub list" onPress={() => void load()} style={{ padding: 8 }}>
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
      <View style={{ width: 72, height: 10, borderRadius: 5, backgroundColor: theme.colors.surface2 }} />
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
