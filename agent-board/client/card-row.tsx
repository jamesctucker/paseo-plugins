import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import { formatElapsed } from "../shared/day";
import { Chip, PulseDot, SourceTag, agentLabel, monoFont, sourceGlyph, statusColor } from "./ui";
import type { AgentEntry } from "./agent-directory";

/**
 * A card on the Today list: one meta line (source glyph and tag, mono key,
 * tracker badge, live chip, chevron) over a full-width title. The key always
 * truncates to a single line, so titles align down the list regardless of
 * identifier length. Long-press (or the hover grip on desktop) enters the
 * tap-to-place reorder flow; the chevron always means detail and the live
 * chip is the agent shortcut.
 */

export interface CardRowProps {
  theme: PluginTheme;
  card: BoardCard;
  agent: AgentEntry | null;
  runStartedAt: number | null;
  now: number;
  active: boolean;
  compact: boolean;
  /** Rendered under a group header: the header carries the key and status. */
  grouped?: boolean;
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
  compact,
  grouped,
  onPress,
  onLongPress,
  onOpenAgent,
}: CardRowProps) {
  const [hovered, setHovered] = useState(false);
  const styles = useMemo(
    () => ({
      card: {
        marginHorizontal: 8,
        marginVertical: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 6,
        borderRadius: 10,
        backgroundColor: active ? theme.colors.surface2 : theme.colors.surface1,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
      },
      meta: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      key: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontFamily: monoFont,
        flexShrink: 1,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "500" as const,
      },
      spacer: { flex: 1 },
    }),
    [theme, active],
  );

  const keyText = grouped
    ? null
    : card.source === "github"
      ? `${card.github?.repo}#${card.github?.number}`
      : (card.jiraKey ?? null);
  const chipBody = liveChip(theme, card, agent, runStartedAt, now);
  const chip = agent && onOpenAgent && chipBody ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Open agent" onPress={onOpenAgent} hitSlop={6}>
      {chipBody}
    </Pressable>
  ) : (
    chipBody
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.title}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.meta}>
        {!compact && onLongPress && (hovered || active) ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Reorder card" onPress={onLongPress} hitSlop={4}>
            <Icon name="GripVertical" size={12} color={theme.colors.foregroundMuted} />
          </Pressable>
        ) : null}
        <Icon name={sourceGlyph(card.source)} size={14} color={theme.colors.foregroundMuted} />
        <SourceTag theme={theme} source={card.source} />
        {card.source === "linear" ? (
          // The rote/creative doctrine lives on the card; unrouted is shown
          // so a missing Route tag reads as a nudge, not an absence.
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{card.route ?? "unrouted"}</Text>
        ) : null}
        {keyText ? (
          <Text style={styles.key} numberOfLines={1}>
            {keyText}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        {!grouped && card.jiraStatus ? (
          // Long tracker statuses ("Developer Review") are the meta line's
          // most expendable element, so they ellipsize before anything else.
          <Chip theme={theme} text={card.jiraStatus} color={theme.colors.foregroundMuted} style={{ flexShrink: 1 }} />
        ) : null}
        {chip}
        <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {card.title}
      </Text>
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
    return <Chip theme={theme} text={agentLabel(agent)} color={statusColor(theme, agent.attentionReason ?? "finished")} />;
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
