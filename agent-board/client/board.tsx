import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions, type TextInput } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { boardCapabilitiesRpc, boardStopRpc, githubGetRpc, issueSearchRpc, linearSearchRpc } from "../shared/contracts";
import { newCardId, type BoardCard } from "../shared/settings";
import { clearedToday, doneThisWeek, doneTodayCount, localDay, staleCards } from "../shared/day";
import { parseQuickAdd } from "../shared/tracker";
import { buildGroups, insertAtGroupEnd, isDuplicate, placeCard, showHeader, type CardGroup } from "../shared/groups";
import { useAgentDirectory, useTicker, useWorkspaceTitles, type AgentEntry } from "./agent-directory";
import { useBoardDoc } from "./board-doc";
import { agentMatchText, linkSuggestions } from "../shared/links";
import { useGates } from "./gates";
import { CardRow } from "./card-row";
import { ChannelDock, type Channel } from "./dock";
import { Rail, type PermissionResponse } from "./rail";
import { QuickAdd } from "./quick-add";
import { JiraSheet } from "./jira-sheet";
import { GitHubSheet } from "./github-sheet";
import { LinearSheet } from "./linear-sheet";
import { Chip, GroupLabel, monoFont, useReduceMotion } from "./ui";

/**
 * The board: Today list on the left (~60%), live rail on the right, and a
 * narrow channel dock at the far edge where the integrations live. Three
 * width tiers, because the host's compact flag only covers phones: wide
 * desktop gets a 340pt rail, mid windows shrink the rail before Today, and
 * narrow windows stack like compact — one scroll (Today, Running, Review,
 * the quiet Done-this-week divider) with quick-add pinned at the foot and
 * the channels as header buttons. Cards render from the cached document
 * even while the host is unreachable.
 */

export interface BoardScreenProps extends PluginScreenProps {
  onOpenSettings(): void;
  onOpenCard(cardId: string): void;
}

export function BoardScreen({ theme, layout, navigation, onOpenSettings, onOpenCard }: BoardScreenProps) {
  const board = useBoardDoc();
  const searchIssues = useRpc(issueSearchRpc);
  const searchLinear = useRpc(linearSearchRpc);
  const getPr = useRpc(githubGetRpc);
  const stopAgent = useRpc(boardStopRpc);
  const getCapabilities = useRpc(boardCapabilitiesRpc);
  const paseo = usePaseo();
  const toast = useToast();
  const { agents, offline } = useAgentDirectory();
  const gatesApi = useGates(board);
  const now = useTicker();
  const { width } = useWindowDimensions();
  // The host's compact flag only covers phones; a narrow desktop window hits
  // the same wall, so the board keeps its own breakpoint. Below it the rail
  // would eat the whole row (340 + 48 fixed against a flex Today column).
  const stacked = layout.compact || width < 720;
  // Above the breakpoint the rail gives up width first: full 340pt on wide
  // screens, shrinking toward 240pt before the layout stacks.
  const railWidth = Math.max(240, Math.min(340, Math.round(width * 0.36)));

  const [openChannel, setOpenChannel] = useState<Channel | null>(null);
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canStop, setCanStop] = useState(false);
  const [stoppingIds, setStoppingIds] = useState<ReadonlySet<string>>(new Set());
  const quickAddInput = useRef<TextInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCapabilities({})
      .then(({ canStop: value }) => {
        if (!cancelled) setCanStop(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // getCapabilities identity is stable per installation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop is fire-and-forget: the agent subscription carries the row out of
  // Running. The pending set only drives the row's spinner until then.
  useEffect(() => {
    setStoppingIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        const agent = agents.get(id);
        if (agent && (agent.status === "running" || agent.status === "initializing")) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [agents]);

  async function handleStop(agentId: string) {
    setStoppingIds((prev) => new Set(prev).add(agentId));
    try {
      await stopAgent({ agentId });
    } catch (cause) {
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    }
  }

  async function handleRespondPermission(agentId: string, requestId: string, response: PermissionResponse) {
    try {
      await paseo.agents.ref(agentId).respondToPermission({ requestId, response });
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    }
  }

  const today = localDay(new Date());
  const cards = board.values.cards;

  /**
   * Keys already on the board, so a channel sheet can show them as inert
   * instead of letting a tap discover the duplicate. Archived cards are out:
   * the dedupe rule treats them as absent, so they can come back.
   */
  const onBoardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const card of cards) {
      if (card.archivedAt) continue;
      if (card.jiraKey) keys.add(card.jiraKey);
      if (card.github) keys.add(`${card.github.repo}#${card.github.number}`);
    }
    return keys;
  }, [cards]);

  const workspaceTitles = useWorkspaceTitles(agents);
  const suggestions = useMemo(
    () => linkSuggestions(cards, agents, board.values.declinedLinks, workspaceTitles),
    [cards, agents, board.values.declinedLinks, workspaceTitles],
  );

  async function linkSuggested(card: BoardCard, agent: AgentEntry) {
    const reason = await board.linkAgent(card.id, agent);
    if (reason) toast.show(`Couldn't link — ${reason}`, { variant: "error" });
    else toast.show(`Linked to ${card.jiraKey ?? (card.github ? `#${card.github.number}` : card.title)}`, { variant: "success" });
  }

  const { todayCards, done, stale, doneToday } = useMemo(
    () => ({
      todayCards: cards.filter((card) => !card.archivedAt && card.day >= today),
      done: doneThisWeek(cards, new Date()),
      stale: staleCards(cards, today),
      doneToday: doneTodayCount(cards, today),
    }),
    [cards, today],
  );

  const needMigration = stale.length > 0 && board.values.migrationAnsweredDay !== today;

  // The Done-nag asks once: a toast when a not-Done issue first parks, never
  // again — the standing lane item does the reminding after that. Gates that
  // already exist at first paint are marked seen without toasting.
  const seenNags = useRef<Set<string> | null>(null);
  useEffect(() => {
    const nags = gatesApi.gates.filter((gate) => gate.kind === "done-nag");
    if (seenNags.current === null) {
      seenNags.current = new Set(nags.map((gate) => gate.id));
      return;
    }
    for (const nag of nags) {
      if (seenNags.current.has(nag.id)) continue;
      seenNags.current.add(nag.id);
      if (nag.kind === "done-nag") {
        toast.show(`${nag.key} is still ${nag.status} — parked in Waiting on you until it's Done.`);
      }
    }
  }, [gatesApi.gates, toast]);

  function openAgent(agentId: string) {
    navigation?.openAgent({ agentId });
  }

  /** One task card per (key, title); new siblings land at their group's end. */
  async function addTaskCard(card: BoardCard, key: string): Promise<boolean> {
    if (isDuplicate(cards, key, card.title)) {
      setError(`${key} task "${card.title}" is already on the board`);
      return false;
    }
    return saveOrExplain(insertAtGroupEnd(cards, card));
  }

  /**
   * A rejected write's reason rides the saveCards promise (conflict vs
   * schema-invalid vs bridge failure). Show it — the generic "try again"
   * hides the difference between a retryable conflict and a real bug.
   */
  async function saveOrExplain(next: BoardCard[]): Promise<boolean> {
    const reason = await board.saveCards(next);
    if (reason) setError(`Couldn't save — ${reason}`);
    return reason === null;
  }

  function taskCardBase(): Pick<BoardCard, "id" | "body" | "day" | "createdAt" | "archivedAt" | "runs"> {
    return {
      id: newCardId(),
      body: "",
      day: today,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      runs: [],
    };
  }

  async function addCardFromIssue(
    issue: { identifier: string; title: string; status: string; url: string; route?: "rote" | "creative" },
    source: "jira" | "linear",
  ) {
    // The sheet's pick is the whole-issue task: its title is the issue's.
    const card: BoardCard = {
      ...taskCardBase(),
      source,
      title: issue.title,
      issueTitle: issue.title,
      jiraKey: issue.identifier,
      jiraUrl: issue.url,
      jiraStatus: issue.status,
      // Explicit undefined is not valid JSON across the settings boundary.
      ...(issue.route ? { route: issue.route } : {}),
    };
    return addTaskCard(card, issue.identifier);
  }

  /** Quick-add task: the issue is real, the task title is the user's. */
  async function addTaskFromTracker(
    issue: { identifier: string; title: string; status: string; url: string; route?: "rote" | "creative" },
    source: "jira" | "linear",
    task: string | undefined,
  ) {
    if (!task) return addCardFromIssue(issue, source);
    const card: BoardCard = {
      ...taskCardBase(),
      source,
      title: task,
      issueTitle: issue.title,
      jiraKey: issue.identifier,
      jiraUrl: issue.url,
      jiraStatus: issue.status,
      ...(issue.route ? { route: issue.route } : {}),
    };
    return addTaskCard(card, issue.identifier);
  }

  async function addCardFromPr(pr: { identifier: string; title: string; url: string }) {
    const ref = parseQuickAdd(pr.identifier);
    if (ref.kind !== "github") {
      setError(`Not a pull request reference: ${pr.identifier}`);
      return false;
    }
    const card: BoardCard = {
      ...taskCardBase(),
      source: "github",
      title: pr.title,
      issueTitle: pr.title,
      github: { repo: ref.repo, number: ref.number },
    };
    return addTaskCard(card, `${ref.repo}#${ref.number}`);
  }

  async function quickAdd(input: string): Promise<boolean> {
    const parsed = parseQuickAdd(input);
    setBusy(true);
    setError(null);
    try {
      if (parsed.kind === "gate") {
        // `! text` — a manual gate for what no machine can detect.
        const reason = await board.addManualGate(parsed.text);
        if (reason) {
          setError(`Couldn't save — ${reason}`);
          return false;
        }
        return true;
      }
      if (parsed.kind === "jira") {
        // A bare key could live in either tracker: Jira first, Linear on a
        // miss (an unconfigured channel throws, which just means no match).
        let unreachable = false;
        try {
          const { items } = await searchIssues({ query: parsed.key });
          const match = items.find((item) => item.identifier.toUpperCase() === parsed.key.toUpperCase());
          if (match) return await addTaskFromTracker(match, "jira", parsed.task);
        } catch {
          unreachable = true;
        }
        try {
          const { items: linearItems } = await searchLinear({ query: parsed.key });
          const linearMatch = linearItems.find((item) => item.identifier.toUpperCase() === parsed.key.toUpperCase());
          if (linearMatch) return await addTaskFromTracker(linearMatch, "linear", parsed.task);
        } catch {
          unreachable = true;
        }
        // Task syntax with unreachable trackers still earns a card — the key
        // and task title are real even if the issue lookup is not. Bare keys
        // keep the typo guard.
        if (parsed.task && unreachable) {
          const card: BoardCard = {
            ...taskCardBase(),
            source: "jira",
            title: parsed.task,
            jiraKey: parsed.key,
          };
          return await addTaskCard(card, parsed.key);
        }
        setError(`No Jira or Linear issue found for ${parsed.key}`);
        return false;
      }
      if (parsed.kind === "github") {
        // Enrich the ref with the real PR title when the adapter answers; a
        // bare ref card is still useful when the channel is not configured.
        try {
          const pr = await getPr({ key: `${parsed.repo}#${parsed.number}` });
          const card: BoardCard = {
            ...taskCardBase(),
            source: "github",
            title: parsed.task ?? pr.title,
            issueTitle: pr.title,
            github: { repo: parsed.repo, number: parsed.number },
          };
          return await addTaskCard(card, `${parsed.repo}#${parsed.number}`);
        } catch {
          const card: BoardCard = {
            ...taskCardBase(),
            source: "github",
            title: parsed.task ?? `${parsed.repo}#${parsed.number}`,
            github: { repo: parsed.repo, number: parsed.number },
          };
          return await addTaskCard(card, `${parsed.repo}#${parsed.number}`);
        }
      }
      const card: BoardCard = { ...taskCardBase(), source: "prompt", title: parsed.title };
      return await saveOrExplain([...cards, card]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => buildGroups(todayCards), [todayCards]);
  // The row order the user sees: groups flatten back to a single list whose
  // indexes are what tap-to-place targets.
  const visibleCards = useMemo(() => groups.flatMap((group) => group.cards), [groups]);

  function placeReorder(targetIndex: number) {
    if (!reorderId) return;
    const next = placeCard(cards, visibleCards, reorderId, targetIndex);
    setReorderId(null);
    void saveOrExplain(next);
  }

  function archiveGroup(group: CardGroup) {
    const ids = new Set(group.cards.map((card) => card.id));
    const stamp = new Date().toISOString();
    void saveOrExplain(cards.map((card) => (ids.has(card.id) ? { ...card, archivedAt: stamp } : card)));
  }

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const channelButton = (channel: Channel, label: string) => (
    <Pressable
      key={channel}
      accessibilityRole="button"
      accessibilityLabel={`Add from ${label}`}
      onPress={() => setOpenChannel(channel)}
      style={{
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  const todayHeader = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 4,
        gap: 8,
      }}
    >
      <GroupLabel theme={theme} text="Today" />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
        {weekday}
      </Text>
      {/* The day's wins stay on screen while the list shrinks; archiving
          otherwise reads as things disappearing, not things getting done. */}
      {doneToday > 0 && todayCards.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Icon name="Check" size={11} color={theme.colors.statusSuccess} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{doneToday} done</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {/* Wide desktop's channel entry is the dock; stacked layouts have none. */}
      {stacked ? channelButton("jira", "Jira") : null}
      {stacked ? channelButton("github", "GitHub") : null}
      {stacked ? channelButton("linear", "Linear") : null}
    </View>
  );

  const notices = (
    <>
      {needMigration ? <MigrationBanner theme={theme} count={stale.length} onAnswer={board.answerMigration} /> : null}
      {reorderId ? (
        <Text style={{ color: theme.colors.accent, fontSize: 11, paddingHorizontal: 14, paddingVertical: 4 }}>
          Moving, tap a position to place the card.
        </Text>
      ) : null}
    </>
  );

  const todayList =
    todayCards.length === 0 && !needMigration ? (
      <EmptyToday
        theme={theme}
        cleared={clearedToday(cards, today)}
        doneToday={doneToday}
        onAddFromJira={() => setOpenChannel("jira")}
        onNewPrompt={() => quickAddInput.current?.focus()}
      />
    ) : (
      (() => {
        // Row indexes count the flattened visible order, which is what
        // tap-to-place targets — headers are not rows.
        let rowIndex = 0;
        return groups.map((group) => {
          const header = showHeader(group);
          const rows = group.cards.map((card) => {
            const index = rowIndex++;
            return (
              <CardRow
                key={card.id}
                theme={theme}
                card={card}
                agent={latestAgent(card, agents)}
                runStartedAt={latestStart(card)}
                now={now}
                active={reorderId === card.id}
                compact={layout.compact}
                grouped={header}
                onPress={() => {
                  if (reorderId) placeReorder(index);
                  else onOpenCard(card.id);
                }}
                onLongPress={() => setReorderId(reorderId === card.id ? null : card.id)}
                onOpenAgent={card.runs.length > 0 ? () => openAgent(card.runs[card.runs.length - 1].agentId) : undefined}
                suggestion={(() => {
                  const agent = suggestions.get(card.id)?.[0];
                  return agent ? (agentMatchText(agent, card, workspaceTitles) ?? agent.title ?? "Untitled agent") : null;
                })()}
                onLinkSuggestion={() => {
                  const agent = suggestions.get(card.id)?.[0];
                  return agent ? linkSuggested(card, agent) : Promise.resolve();
                }}
                onDeclineSuggestion={() => {
                  const agent = suggestions.get(card.id)?.[0];
                  if (!agent) return;
                  void board.declineLink(card.id, agent.id).then((reason) => {
                    if (reason) toast.show(`Couldn't save — ${reason}`, { variant: "error" });
                  });
                }}
              />
            );
          });
          return (
            <View key={group.key ?? group.cards[0].id}>
              {header ? (
                <GroupHeader theme={theme} group={group} onArchiveAll={() => archiveGroup(group)} />
              ) : null}
              {rows}
            </View>
          );
        });
      })()
    );

  const doneSection =
    done.length > 0 ? (
      <View style={{ marginTop: 10, paddingHorizontal: 12 }}>
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 8 }} />
        <GroupLabel theme={theme} text={`Done this week · ${done.length}`} />
        {done.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={card.title}
            onPress={() => onOpenCard(card.id)}
            style={{ paddingVertical: 4 }}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
              {card.jiraKey ? `${card.jiraKey} ` : ""}
              {card.title}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const quickAddField = (
    <QuickAdd
      theme={theme}
      compact={stacked}
      busy={busy}
      error={error}
      onSubmit={quickAdd}
      onOpenSettings={onOpenSettings}
      inputRef={quickAddInput}
    />
  );

  const rail = (
    <Rail
      theme={theme}
      cards={todayCards}
      agents={agents}
      now={now}
      offline={offline}
      dismissed={board.values.dismissedAttention}
      canStop={canStop}
      stoppingIds={stoppingIds}
      gates={gatesApi.gates}
      onOpenAgent={openAgent}
      onOpenCard={onOpenCard}
      onStop={(agentId) => void handleStop(agentId)}
      onDismiss={(agentId, stamp) => void board.dismissAttention(agentId, stamp)}
      onRespondPermission={(agentId, requestId, response) => void handleRespondPermission(agentId, requestId, response)}
      onCompleteManualGate={(id) =>
        board.removeManualGate(id).then((reason) => {
          if (reason) setError(`Couldn't save — ${reason}`);
          return reason === null;
        })
      }
      onClearDoneNag={(key) => void board.clearDoneNag(key).then((reason) => reason && setError(`Couldn't save — ${reason}`))}
    />
  );

  const sheets = (
    <>
      <JiraSheet
        theme={theme}
        open={openChannel === "jira"}
        onOpenChange={(open) => setOpenChannel(open ? "jira" : null)}
        onBoard={onBoardKeys}
        onPick={(issue) => addCardFromIssue(issue, "jira")}
        onOpenSettings={onOpenSettings}
      />
      <GitHubSheet
        theme={theme}
        open={openChannel === "github"}
        onOpenChange={(open) => setOpenChannel(open ? "github" : null)}
        onBoard={onBoardKeys}
        onPick={(pr) => addCardFromPr(pr)}
        onOpenSettings={onOpenSettings}
      />
      <LinearSheet
        theme={theme}
        open={openChannel === "linear"}
        onOpenChange={(open) => setOpenChannel(open ? "linear" : null)}
        onBoard={onBoardKeys}
        onPick={(issue) => addCardFromIssue(issue, "linear")}
        onOpenSettings={onOpenSettings}
      />
    </>
  );

  if (stacked) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {todayHeader}
          {notices}
          {todayList}
          {rail}
          {doneSection}
        </ScrollView>
        {quickAddField}
        {sheets}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0, flexDirection: "row" }}>
      {/* minWidth: 0 so a narrow window shrinks this column instead of its
          children overflowing into the rail. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {todayHeader}
        {notices}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
          {todayList}
          {doneSection}
        </ScrollView>
        {quickAddField}
      </View>
      <View style={{ width: railWidth, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>{rail}</View>
      <ChannelDock
        theme={theme}
        active={openChannel}
        onOpen={(channel) => setOpenChannel(openChannel === channel ? null : channel)}
      />
      {sheets}
    </View>
  );
}

/**
 * The issue anchor above a task group: mono key, the denormalized issue
 * title, the mirrored status badge (one per issue, not per task), and the
 * close-out shortcut. Archiving is per-task otherwise; this is the group act.
 */
function GroupHeader({
  theme,
  group,
  onArchiveAll,
}: {
  theme: PluginTheme;
  group: CardGroup;
  onArchiveAll(): void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 2,
      }}
    >
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: monoFont, fontWeight: "600" }}>
        {group.key}
      </Text>
      {group.issueTitle !== group.key ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
          {group.issueTitle}
        </Text>
      ) : null}
      {group.status ? <Chip theme={theme} text={group.status} color={theme.colors.foregroundMuted} style={{ flexShrink: 1 }} /> : null}
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Archive all tasks for ${group.key}`}
        onPress={onArchiveAll}
        hitSlop={6}
      >
        <Icon name="Archive" size={13} color={theme.colors.foregroundMuted} />
      </Pressable>
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

function EmptyToday({
  theme,
  cleared,
  doneToday,
  onAddFromJira,
  onNewPrompt,
}: {
  theme: PluginTheme;
  /** Today's cards were all archived: a finished day, not a fresh morning. */
  cleared: boolean;
  doneToday: number;
  onAddFromJira(): void;
  onNewPrompt(): void;
}) {
  // Clearing the list is the board's one earned celebration: the check lands
  // with a single settle, then holds still. Never loops, never replays on
  // relayout (the mount is the moment).
  const reduceMotion = useReduceMotion();
  const settle = useRef(new Animated.Value(cleared && !reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (!cleared || reduceMotion) {
      settle.setValue(1);
      return;
    }
    const animation = Animated.spring(settle, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [settle, cleared, reduceMotion]);

  const beforeNoon = new Date().getHours() < 12;
  const clearedCopy = beforeNoon
    ? "Cleared before noon. The afternoon is yours; add more only if you want it."
    : "Everything on today's list is done. Add more only if the day isn't actually over.";

  return (
    <View style={{ padding: 24, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {cleared ? (
          <Animated.View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: theme.colors.statusSuccess,
              alignItems: "center",
              justifyContent: "center",
              opacity: settle,
              transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            }}
          >
            <Icon name="Check" size={13} color={theme.colors.surface0} />
          </Animated.View>
        ) : null}
        <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
          {cleared ? "Day's clear." : "What's today?"}
        </Text>
        {cleared && doneToday > 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            {doneToday} done
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {cleared ? clearedCopy : "Pull the day's commitments in from Jira, or write a prompt card below."}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add from Jira"
          onPress={onAddFromJira}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>Add from Jira</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New prompt card"
          onPress={onNewPrompt}
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
        >
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>New prompt card</Text>
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