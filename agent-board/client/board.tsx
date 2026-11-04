import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { issueSearchRpc } from "../shared/contracts";
import { newCardId, type BoardCard } from "../shared/settings";
import { doneThisWeek, localDay, staleCards } from "../shared/day";
import { parseQuickAdd } from "../shared/tracker";
import { useAgentDirectory, useTicker, type AgentEntry } from "./agent-directory";
import { useBoardDoc } from "./board-doc";
import { CardRow } from "./card-row";
import { Rail } from "./rail";
import { QuickAdd } from "./quick-add";
import { JiraSheet } from "./jira-sheet";
import { GroupLabel } from "./ui";

/**
 * The board: Today list on the left (~60%), live rail on the right (~340pt).
 * Compact layouts stack Today, Running, Review, then a quiet Done-this-week
 * divider at the bottom. Cards render from the cached document even while the
 * host is unreachable.
 */

export interface BoardScreenProps extends PluginScreenProps {
  onOpenSettings(): void;
  onOpenCard(cardId: string): void;
}

export function BoardScreen({ theme, layout, navigation, onOpenSettings, onOpenCard }: BoardScreenProps) {
  const board = useBoardDoc();
  const searchIssues = useRpc(issueSearchRpc);
  const { agents, offline } = useAgentDirectory();
  const now = useTicker();

  const [jiraSheetOpen, setJiraSheetOpen] = useState(false);
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localDay(new Date());
  const cards = board.values.cards;

  const { todayCards, done, stale } = useMemo(
    () => ({
      todayCards: cards.filter((card) => !card.archivedAt && card.day >= today),
      done: doneThisWeek(cards, new Date()),
      stale: staleCards(cards, today),
    }),
    [cards, today],
  );

  const needMigration = stale.length > 0 && board.values.migrationAnsweredDay !== today;

  function openAgent(agentId: string) {
    navigation?.openAgent({ agentId });
  }

  async function addCardFromIssue(issue: { identifier: string; title: string; status: string; url: string }) {
    const card: BoardCard = {
      id: newCardId(),
      source: "jira",
      title: issue.title,
      body: "",
      jiraKey: issue.identifier,
      jiraUrl: issue.url,
      jiraStatus: issue.status,
      day: today,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      runs: [],
    };
    return board.saveCards([...cards, card]);
  }

  async function quickAdd(input: string): Promise<boolean> {
    const parsed = parseQuickAdd(input);
    setBusy(true);
    setError(null);
    try {
      if (parsed.kind === "jira") {
        const { items } = await searchIssues({ query: parsed.key });
        const match = items.find((item) => item.identifier.toUpperCase() === parsed.key.toUpperCase());
        if (!match) {
          setError(`No Jira issue found for ${parsed.key}`);
          return false;
        }
        return await addCardFromIssue(match);
      }
      const card: BoardCard =
        parsed.kind === "github"
          ? {
              id: newCardId(),
              source: "github",
              title: `${parsed.repo}#${parsed.number}`,
              body: "",
              github: { repo: parsed.repo, number: parsed.number },
              day: today,
              createdAt: new Date().toISOString(),
              archivedAt: null,
              runs: [],
            }
          : {
              id: newCardId(),
              source: "prompt",
              title: parsed.title,
              body: "",
              day: today,
              createdAt: new Date().toISOString(),
              archivedAt: null,
              runs: [],
            };
      return await board.saveCards([...cards, card]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function placeReorder(targetIndex: number) {
    const moving = cards.find((card) => card.id === reorderId);
    if (!moving) {
      setReorderId(null);
      return;
    }
    const rest = cards.filter((card) => card.id !== reorderId);
    rest.splice(Math.min(targetIndex, rest.length), 0, moving);
    setReorderId(null);
    void board.saveCards(rest);
  }

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const todayPane = (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 4,
          gap: 8,
        }}
      >
        <GroupLabel theme={theme} text="Today" />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{weekday}</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add from Jira"
          onPress={() => setJiraSheetOpen(true)}
          style={{
            backgroundColor: theme.colors.surface1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>Add from Jira</Text>
        </Pressable>
      </View>

      {needMigration ? <MigrationBanner theme={theme} count={stale.length} onAnswer={board.answerMigration} /> : null}
      {reorderId ? (
        <Text style={{ color: theme.colors.accent, fontSize: 11, paddingHorizontal: 14, paddingVertical: 4 }}>
          Moving, tap a position to place the card.
        </Text>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
        {todayCards.length === 0 && !needMigration ? (
          <EmptyToday theme={theme} onAddFromJira={() => setJiraSheetOpen(true)} />
        ) : (
          todayCards.map((card, index) => (
            <CardRow
              key={card.id}
              theme={theme}
              card={card}
              agent={latestAgent(card, agents)}
              runStartedAt={latestStart(card)}
              now={now}
              active={reorderId === card.id}
              onPress={() => {
                if (reorderId) placeReorder(index);
                else onOpenCard(card.id);
              }}
              onLongPress={() => setReorderId(reorderId === card.id ? null : card.id)}
              onOpenAgent={card.runs.length > 0 ? () => openAgent(card.runs[card.runs.length - 1].agentId) : undefined}
            />
          ))
        )}

        {done.length > 0 ? (
          <View style={{ marginTop: 10, paddingHorizontal: 12 }}>
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 8 }} />
            <GroupLabel theme={theme} text={`Done this week, ${done.length}`} />
            {done.map((card) => (
              <Pressable key={card.id} accessibilityRole="button" onPress={() => onOpenCard(card.id)} style={{ paddingVertical: 4 }}>
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
                  {card.jiraKey ? `${card.jiraKey} ` : ""}
                  {card.title}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <QuickAdd
        theme={theme}
        compact={layout.compact}
        busy={busy}
        error={error}
        onSubmit={quickAdd}
        onOpenSettings={onOpenSettings}
      />
    </View>
  );

  const rail = (
    <Rail
      theme={theme}
      cards={todayCards}
      agents={agents}
      now={now}
      offline={offline}
      onOpenAgent={openAgent}
      onOpenCard={onOpenCard}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0, flexDirection: layout.compact ? "column" : "row" }}>
      {todayPane}
      {layout.compact ? (
        <View style={{ paddingHorizontal: 12 }}>{rail}</View>
      ) : (
        <View style={{ width: 340, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>{rail}</View>
      )}
      <JiraSheet
        theme={theme}
        open={jiraSheetOpen}
        onOpenChange={setJiraSheetOpen}
        onPick={(issue) => void addCardFromIssue(issue)}
        onOpenSettings={onOpenSettings}
      />
    </View>
  );
}

function MigrationBanner({
  theme,
  count,
  onAnswer,
}: {
  theme: PluginTheme;
  count: number;
  onAnswer(carry: boolean): Promise<boolean>;
}) {
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 4,
        padding: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
        Carry over {count} unfinished from yesterday?
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Carry cards over"
          onPress={() => void onAnswer(true)}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>Carry over</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Drop unfinished cards" onPress={() => void onAnswer(false)} style={{ paddingVertical: 5, paddingHorizontal: 8 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Drop</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyToday({ theme, onAddFromJira }: { theme: PluginTheme; onAddFromJira(): void }) {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>What&apos;s today?</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        Pull the day&apos;s commitments in from Jira, or write a prompt card below.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add from Jira"
          onPress={onAddFromJira}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>Add from Jira</Text>
        </Pressable>
      </View>
    </View>
  );
}

function latestAgent(card: BoardCard, agents: Map<string, AgentEntry>): AgentEntry | null {
  const run = card.runs[card.runs.length - 1];
  return run ? (agents.get(run.agentId) ?? null) : null;
}

function latestStart(card: BoardCard): number | null {
  const run = card.runs[card.runs.length - 1];
  return run ? Date.parse(run.startedAt) : null;
}