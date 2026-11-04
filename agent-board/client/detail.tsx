import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink, Markdown } from "@getpaseo/plugin/client/ui";
import { formatElapsed } from "../shared/day";
import { useAgentDirectory, useTicker } from "./agent-directory";
import { useBoardDoc } from "./board-doc";
import { SpawnSheet } from "./spawn-sheet";
import { GroupLabel, Chip, sourceGlyph } from "./ui";
import { Icon } from "@getpaseo/plugin/client/ui";

/**
 * Card detail: the issue body, mirrored tracker status, run history, and the
 * card's primary action, Run. Archive and Delete cover the paper ritual's
 * strike-out; move up/down is the accessible reorder.
 */

export interface CardDetailScreenProps extends PluginScreenProps {}

export function CardDetailScreen({ theme, params, navigation }: CardDetailScreenProps) {
  const board = useBoardDoc();
  const { agents } = useAgentDirectory();
  const now = useTicker();
  const [spawnOpen, setSpawnOpen] = useState(false);

  const cards = board.values.cards;
  const index = cards.findIndex((card) => card.id === params.cardId);
  const card = index >= 0 ? cards[index] : null;
  const agent = useMemo(() => {
    if (!card) return null;
    const run = card.runs[card.runs.length - 1];
    return run ? (agents.get(run.agentId) ?? null) : null;
  }, [card, agents]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>This card is no longer on the board.</Text>
      </View>
    );
  }

  function save(next: typeof cards) {
    void board.saveCards(next);
  }

  const runStartedAt = card.runs.length > 0 ? Date.parse(card.runs[card.runs.length - 1].startedAt) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={sourceGlyph(card.source)} size={14} color={theme.colors.foregroundMuted} />
          {card.jiraKey ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: "Menlo" }}>{card.jiraKey}</Text>
          ) : null}
          {card.jiraStatus ? <Chip theme={theme} text={card.jiraStatus} color={theme.colors.foregroundMuted} /> : null}
          <View style={{ flex: 1 }} />
          {agent && (agent.status === "running" || agent.status === "initializing") ? (
            <Chip
              theme={theme}
              text={runStartedAt ? formatElapsed(runStartedAt, now) : "running"}
              color={theme.colors.accent}
            />
          ) : null}
        </View>

        <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "600" }}>{card.title}</Text>

        {card.jiraUrl ? (
          <ExternalLink href={card.jiraUrl} accessibilityLabel="Open issue in Jira">
            <Text style={{ color: theme.colors.accent, fontSize: 12 }}>Open in Jira</Text>
          </ExternalLink>
        ) : null}

        {card.body ? <Markdown>{card.body}</Markdown> : null}

        {card.runs.length > 0 ? (
          <View style={{ gap: 4 }}>
            <GroupLabel theme={theme} text="Runs" />
            {card.runs
              .slice()
              .reverse()
              .map((run, runIndex) => {
                const runAgent = agents.get(run.agentId);
                const label = runAgent
                  ? `${runAgent.status}${runAgent.attentionReason ? `, ${runAgent.attentionReason}` : ""}`
                  : "gone";
                return (
                  <Pressable
                    key={run.agentId}
                    accessibilityRole="button"
                    accessibilityLabel="Open agent"
                    onPress={() => navigation?.openAgent({ agentId: run.agentId })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                      {new Date(run.startedAt).toLocaleString()}
                    </Text>
                    {runIndex === 0 ? (
                      <Text style={{ color: theme.colors.accent, fontSize: 10 }}>latest</Text>
                    ) : null}
                  </Pressable>
                );
              })}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run this card"
          onPress={() => setSpawnOpen(true)}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>Run</Text>
        </Pressable>
        {index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move card up"
            onPress={() => {
              const next = [...cards];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              save(next);
            }}
            style={{ backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Up</Text>
          </Pressable>
        ) : null}
        {index < cards.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move card down"
            onPress={() => {
              const next = [...cards];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              save(next);
            }}
            style={{ backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Down</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={card.archivedAt ? "Restore card to Today" : "Archive card"}
          onPress={() => {
            const next = cards.map((entry) =>
              entry.id === card.id
                ? { ...entry, archivedAt: card.archivedAt ? null : new Date().toISOString() }
                : entry,
            );
            save(next);
          }}
          style={{ backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{card.archivedAt ? "Restore" : "Archive"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete card"
          onPress={() => save(cards.filter((entry) => entry.id !== card.id))}
          style={{ paddingVertical: 7, paddingHorizontal: 8 }}
        >
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>Delete</Text>
        </Pressable>
      </View>

      <SpawnSheet
        theme={theme}
        card={card}
        open={spawnOpen}
        onOpenChange={setSpawnOpen}
        onSpawned={(cardId, run) => {
          const next = cards.map((entry) => (entry.id === cardId ? { ...entry, runs: [...entry.runs, run] } : entry));
          save(next);
        }}
      />
    </View>
  );
}