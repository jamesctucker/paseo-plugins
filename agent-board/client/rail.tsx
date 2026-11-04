import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { BoardCard } from "../shared/settings";
import { formatElapsed } from "../shared/day";
import { GroupLabel, PulseDot, attentionColor } from "./ui";
import type { AgentEntry } from "./agent-directory";

/**
 * The live rail: board-linked agents only. Running above Review, so the day's
 * work-in-flight reads top-down. It deliberately does not mirror every agent on
 * the daemon; that is better-paseo's question.
 */

export interface RailProps {
  theme: PluginTheme;
  cards: BoardCard[];
  agents: Map<string, AgentEntry>;
  now: number;
  offline: boolean;
  onOpenAgent(agentId: string): void;
  onOpenCard(cardId: string): void;
}

interface RailRow {
  agent: AgentEntry;
  card: BoardCard;
  startedAt: number | null;
}

function railLabel(reason: string | null): string {
  if (reason === "permission") return "Needs you";
  if (reason === "error") return "Errored";
  return "Finished";
}

export function Rail({ theme, cards, agents, now, offline, onOpenAgent, onOpenCard }: RailProps) {
  const { running, review } = useMemo(() => {
    const running: RailRow[] = [];
    const review: RailRow[] = [];
    for (const card of cards) {
      const run = card.runs[card.runs.length - 1];
      if (!run) continue;
      const agent = agents.get(run.agentId);
      if (!agent) continue;
      const row = { agent, card, startedAt: Date.parse(run.startedAt) };
      if (agent.requiresAttention) review.push(row);
      else if (agent.status === "running" || agent.status === "initializing") running.push(row);
    }
    return { running, review };
  }, [cards, agents]);

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
      <GroupLabel theme={theme} text="Running" />
      {running.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingLeft: 2, paddingTop: 4 }}>
          Nothing running.
        </Text>
      ) : (
        running.map(({ agent, card, startedAt }) => (
          <RailRow
            key={agent.id}
            theme={theme}
            card={card}
            color={theme.colors.accent}
            pulse={true}
            elapsed={startedAt ? formatElapsed(startedAt, now) : null}
            onPress={() => onOpenAgent(agent.id)}
            onOpenCard={() => onOpenCard(card.id)}
          />
        ))
      )}
      {offline ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 11, paddingLeft: 2 }}>
          Host offline, times may be stale.
        </Text>
      ) : null}
      <View style={{ height: 14 }} />
      <GroupLabel theme={theme} text="Review" />
      {review.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingLeft: 2, paddingTop: 4 }}>
          Nothing to review.
        </Text>
      ) : (
        review.map(({ agent, card }) => (
          <RailRow
            key={agent.id}
            theme={theme}
            card={card}
            color={attentionColor(theme, agent.attentionReason)}
            label={railLabel(agent.attentionReason)}
            onPress={() => onOpenAgent(agent.id)}
            onOpenCard={() => onOpenCard(card.id)}
          />
        ))
      )}
    </View>
  );
}

function RailRow({
  theme,
  card,
  color,
  label,
  pulse,
  elapsed,
  onPress,
  onOpenCard,
}: {
  theme: PluginTheme;
  card: BoardCard;
  color: string;
  label?: string;
  pulse?: boolean;
  elapsed?: string | null;
  onPress(): void;
  onOpenCard(): void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={card.title} onPress={onPress} hitSlop={4}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
        {pulse ? (
          <PulseDot color={color} />
        ) : (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        )}
        {card.jiraKey ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: "Menlo" }}>{card.jiraKey}</Text>
        ) : null}
        <Text
          style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "500", flexShrink: 1 }}
          numberOfLines={1}
        >
          {card.title}
        </Text>
        <View style={{ flex: 1 }} />
        {label ? <Text style={{ color, fontSize: 11 }}>{label}</Text> : null}
        {elapsed ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{elapsed}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Open card" onPress={onOpenCard} hitSlop={6}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>card</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}