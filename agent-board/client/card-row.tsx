import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import { formatElapsed } from "../shared/day";
import { Chip, PulseDot, sourceGlyph, statusColor } from "./ui";
import type { AgentEntry } from "./agent-directory";

/**
 * The 26pt card row: source glyph, mono key, medium title, read-only tracker
 * badge, live agent chip, chevron. Long-press enters the tap-to-place reorder
 * flow, which works identically on desktop and phone.
 */

export interface CardRowProps {
  theme: PluginTheme;
  card: BoardCard;
  agent: AgentEntry | null;
  runStartedAt: number | null;
  now: number;
  active: boolean;
  onPress(): void;
  onLongPress?(): void;
  onOpenAgent?(): void;
}

export function CardRow({
  theme,
  card,
  agent,
  runStartedAt,
  now,
  active,
  onPress,
  onLongPress,
  onOpenAgent,
}: CardRowProps) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        minHeight: 26,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: active ? theme.colors.surface1 : "transparent",
        borderWidth: active ? 1 : 0,
        borderColor: theme.colors.accent,
      },
      key: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontFamily: "Menlo",
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "500" as const,
        flexShrink: 1,
      },
      spacer: { flex: 1 },
    }),
    [theme, active],
  );

  const keyText = card.source === "jira" ? card.jiraKey : card.source === "github" ? `${card.github?.repo}#${card.github?.number}` : null;
  const chip = liveChip(theme, card, agent, runStartedAt, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={sourceGlyph(card.source)} size={14} color={theme.colors.foregroundMuted} />
      {keyText ? <Text style={styles.key}>{keyText}</Text> : null}
      <Text style={styles.title} numberOfLines={1}>
        {card.title}
      </Text>
      <View style={styles.spacer} />
      {card.jiraStatus ? (
        <Chip theme={theme} text={card.jiraStatus} color={theme.colors.foregroundMuted} />
      ) : null}
      {chip}
      {agent && onOpenAgent ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open agent" onPress={onOpenAgent} hitSlop={6}>
          <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : (
        <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
      )}
    </Pressable>
  );
}

function liveChip(
  theme: PluginTheme,
  card: BoardCard,
  agent: AgentEntry | null,
  runStartedAt: number | null,
  now: number,
) {
  if (!agent) return null;
  if (agent.requiresAttention) {
    const label = agent.attentionReason === "permission" ? "Needs you" : agent.attentionReason === "error" ? "Errored" : "Finished";
    return <Chip theme={theme} text={label} color={statusColor(theme, agent.attentionReason ?? "finished")} />;
  }
  if (agent.status === "running" || agent.status === "initializing") {
    const elapsed = runStartedAt ? formatElapsed(runStartedAt, now) : "just now";
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <PulseDot color={theme.colors.accent} />
        <Chip theme={theme} text={elapsed} color={theme.colors.accent} />
      </View>
    );
  }
  return null;
}