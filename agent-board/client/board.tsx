import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { boardCapabilitiesRpc, boardStopRpc, githubGetRpc, issueSearchRpc, linearSearchRpc } from "../shared/contracts";
import { newCardId, type BoardCard } from "../shared/settings";
import { localDay } from "../shared/day";
import { addDays, beforeThisWeek, columnCards, dayLabel, doneOn, liveInWeek, moveCardsToDay, nudgeCards, nudgedDay, weekDays, weekStart } from "../shared/week";
import { parseQuickAdd } from "../shared/tracker";
import { buildGroups, insertAtGroupEnd, isDuplicate, neighborIndex, placeCard, type CardGroup } from "../shared/groups";
import { recordArchive, type ArchiveUndo } from "../shared/undo";
import { ArchiveUndoBar, pushArchiveUndo, useArchiveUndo } from "./undo";
import { prSignalForCard } from "../shared/pr-signal";
import { useWorkspaceRuntimes } from "./workspace-runtime";
import { noteKey } from "../shared/notes";
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
import {
  ColumnBody,
  ColumnHeading,
  DayStrip,
  EmptyBoard,
  MoveBar,
  RolloverBanner,
  ToolbarButton,
  WeekGrid,
  WeekToolbar,
  type DropTarget,
  type RenderCardOptions,
} from "./week-board";

/**
 * The board: the week on the left, the live rail on the right, and a narrow
 * channel dock at the far edge where the integrations live.
 *
 * The week (amendment 2026-11-20) is a backlog column plus seven day
 * columns. Quick-add captures into the backlog; putting a card on a day is
 * the planning ritual, and it works three ways — pick a card up and tap a
 * column, slide it with the bar's buttons or the arrow keys, or select
 * several and move them together. Nothing moves between days on its own:
 * unfinished work stays where it was planned until the once-a-week rollover
 * prompt.
 *
 * Three width tiers, because the host's compact flag only covers phones:
 * wide desktop gets the grid and a 340pt rail, mid windows shrink the rail
 * before the grid, and below 720pt the board stacks — a chip strip stands in
 * for the columns, the chosen column renders as one list, and the rail
 * follows it. Cards render from the cached document even while the host is
 * unreachable.
 */

export interface BoardScreenProps extends PluginScreenProps {
  onOpenSettings(): void;
  onOpenCard(cardId: string): void;
}

/** Past which a slide reads as "a week", in days. */
const WEEK_SLIDE = 7;

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
  const workspaceRuntimes = useWorkspaceRuntimes();
  const gatesApi = useGates(board);
  const { undo: archiveUndo, runUndo } = useArchiveUndo(board);
  const now = useTicker();
  const { width } = useWindowDimensions();
  // The host's compact flag only covers phones; a narrow desktop window hits
  // the same wall, so the board keeps its own breakpoint. Below it the rail
  // would eat the whole row (340 + 48 fixed against a flex board column).
  const stacked = layout.compact || width < 720;
  // Above the breakpoint the rail gives up width first: full 340pt on wide
  // screens, shrinking toward 240pt before the layout stacks.
  const railWidth = Math.max(240, Math.min(340, Math.round(width * 0.36)));

  const [openChannel, setOpenChannel] = useState<Channel | null>(null);
  /** The card picked up for a move (long-press, or the hover grip on desktop). */
  const [reorderId, setReorderId] = useState<string | null>(null);
  /** The hidden input that owns arrow/Escape keys while a card is in hand. */
  const moveKeysInput = useRef<TextInput | null>(null);
  /** Cards checked for a group move; a non-empty set is a selection session. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Taps toggle selection instead of opening detail (turned on by the toolbar or the first circle). */
  const [selectMode, setSelectMode] = useState(false);
  /** Monday of the visible week. Null follows today, so the view rolls over on its own. */
  const [viewWeek, setViewWeek] = useState<string | null>(null);
  /** The stacked layout's chosen column. Undefined follows today; null is the backlog. */
  const [stripDay, setStripDay] = useState<string | null | undefined>(undefined);
  /** The grid's measured width; 0 until the first layout pass. */
  const [boardWidth, setBoardWidth] = useState(0);
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
  /** Issue keys carrying a note, for the row marker. */
  const noteKeys = useMemo(() => new Set(Object.keys(board.values.cardNotes)), [board.values.cardNotes]);

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

  const week = viewWeek ?? weekStart(today);
  const days = useMemo(() => weekDays(week), [week]);
  /** Every live card, whichever column it is in: the rail follows agents from any day. */
  const live = useMemo(() => cards.filter((card) => !card.archivedAt), [cards]);
  const backlog = useMemo(() => columnCards(cards, null), [cards]);
  const byDay = useMemo(() => new Map(days.map((day) => [day, columnCards(cards, day)] as const)), [cards, days]);
  const doneByDay = useMemo(() => new Map(days.map((day) => [day, doneOn(cards, day)] as const)), [cards, days]);
  /** The rows each column shows, in render order: what tap-to-place indexes. */
  const rowsByColumn = useMemo(() => {
    const rows = new Map<string | null, BoardCard[]>([[null, buildGroups(backlog).flatMap((group) => group.cards)]]);
    for (const day of days) rows.set(day, buildGroups(byDay.get(day) ?? []).flatMap((group) => group.cards));
    return rows;
  }, [backlog, byDay, days]);

  const earlier = useMemo(() => beforeThisWeek(cards, today), [cards, today]);
  const needRollover = earlier.length > 0 && board.values.rolloverAnsweredWeek !== weekStart(today);
  const inHand = reorderId !== null || selected.size > 0;
  // A week you cannot see should not look empty: the arrows count its live cards.
  const prevWeekCount = liveInWeek(cards, addDays(week, -7));
  const nextWeekCount = liveInWeek(cards, addDays(week, 7));
  const firstRun = cards.length === 0;

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
    return saveOrExplain((current) => insertAtGroupEnd(current, card));
  }

  /**
   * A rejected write's reason rides the updateCards promise (conflict vs
   * schema-invalid vs bridge failure). Show it — the generic "try again"
   * hides the difference between a retryable conflict and a real bug.
   */
  async function saveOrExplain(
    change: (cards: BoardCard[]) => BoardCard[],
  ): Promise<boolean> {
    const reason = await board.updateCards(change);
    if (reason) setError(`Couldn't save — ${reason}`);
    return reason === null;
  }

  /**
   * New cards carry the day they're destined for: quick-add captures land in
   * the backlog (null, amendment 2026-11-20) and channel-sheet picks go
   * straight onto today.
   */
  function taskCardBase(day: string | null): Pick<BoardCard, "id" | "body" | "day" | "createdAt" | "archivedAt" | "runs"> {
    return {
      id: newCardId(),
      body: "",
      day,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      runs: [],
    };
  }

  async function addCardFromIssue(
    issue: { identifier: string; title: string; status: string; url: string; route?: "rote" | "creative" },
    source: "jira" | "linear",
    day: string | null,
  ) {
    // The sheet's pick is the whole-issue task: its title is the issue's.
    const card: BoardCard = {
      ...taskCardBase(day),
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

  /** Quick-add task: the issue is real, the task title is the user's. Lands in the backlog. */
  async function addTaskFromTracker(
    issue: { identifier: string; title: string; status: string; url: string; route?: "rote" | "creative" },
    source: "jira" | "linear",
    task: string | undefined,
  ) {
    if (!task) return addCardFromIssue(issue, source, null);
    const card: BoardCard = {
      ...taskCardBase(null),
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

  async function addCardFromPr(pr: { identifier: string; title: string; url: string }, day: string | null) {
    const ref = parseQuickAdd(pr.identifier);
    if (ref.kind !== "github") {
      setError(`Not a pull request reference: ${pr.identifier}`);
      return false;
    }
    const card: BoardCard = {
      ...taskCardBase(day),
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
            ...taskCardBase(null),
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
            ...taskCardBase(null),
            source: "github",
            title: parsed.task ?? pr.title,
            issueTitle: pr.title,
            github: { repo: parsed.repo, number: parsed.number },
          };
          return await addTaskCard(card, `${parsed.repo}#${parsed.number}`);
        } catch {
          const card: BoardCard = {
            ...taskCardBase(null),
            source: "github",
            title: parsed.task ?? `${parsed.repo}#${parsed.number}`,
            github: { repo: parsed.repo, number: parsed.number },
          };
          return await addTaskCard(card, `${parsed.repo}#${parsed.number}`);
        }
      }
      const card: BoardCard = { ...taskCardBase(null), source: "prompt", title: parsed.title };
      return await saveOrExplain((current) => [...current, card]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---- Placement ----------------------------------------------------------

  /** Pick a card up. A move and a selection are different hands, so one replaces the other. */
  function arm(cardId: string) {
    setSelected(new Set());
    setSelectMode(false);
    setReorderId(reorderId === cardId ? null : cardId);
  }

  function endSelection() {
    setSelected(new Set());
    setSelectMode(false);
  }

  function toggleSelect(cardId: string) {
    setReorderId(null);
    const next = new Set(selected);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    setSelected(next);
    // Unchecking the last card ends the session, so taps go back to opening detail.
    setSelectMode(next.size > 0);
  }

  function toggleSelectMode() {
    if (selectMode) endSelection();
    else {
      setReorderId(null);
      setSelectMode(true);
    }
  }

  function movedToast(count: number, day: string | null) {
    toast.show(`Moved ${count === 1 ? "card" : `${count} cards`} to ${day === null ? "the backlog" : dayLabel(day)}`);
  }

  /**
   * A tap inside a column while something is in hand. With a card picked
   * up, a row tap in its own column is a precise reorder and anything else
   * names the destination column. With a selection, the whole set moves.
   */
  function placeAt(day: string | null, rowIndex: number | null) {
    if (reorderId) {
      const moving = cards.find((card) => card.id === reorderId);
      setReorderId(null);
      if (!moving) return;
      if (moving.day === day && rowIndex !== null) {
        void saveOrExplain((current) => placeCard(current, rowsByColumn.get(day) ?? [], moving.id, rowIndex));
      } else {
        void saveOrExplain((current) => moveCardsToDay(current, new Set([moving.id]), day));
      }
      return;
    }
    if (selected.size === 0) return;
    const moving = selected;
    void saveOrExplain((current) => moveCardsToDay(current, moving, day)).then((saved) => {
      if (saved) movedToast(moving.size, day);
    });
    endSelection();
  }

  /**
   * Toolbar buttons steal focus from the hidden key-capture input, silently
   * killing arrows and Escape mid-move. Anything that keeps a card in hand
   * hands the keys back.
   */
  function regainMoveKeys() {
    if (reorderId) moveKeysInput.current?.focus();
  }

  /**
   * Slide what is in hand a fixed number of days: the following day, or
   * the following week. The view follows a card in hand across the week
   * boundary; a selection stays put and says where it went instead.
   */
  function slide(deltaDays: number) {
    regainMoveKeys();
    const moving = reorderId ? new Set([reorderId]) : selected;
    if (moving.size === 0) return;
    const landed = cards
      .filter((card) => moving.has(card.id) && !card.archivedAt)
      .map((card) => nudgedDay(card.day, deltaDays, today))
      .filter((day): day is string => day !== null);
    if (landed.length === 0) return;
    void saveOrExplain((current) => nudgeCards(current, moving, deltaDays, today)).then((saved) => {
      if (!saved) return;
      const away = landed.filter((day) => weekStart(day) !== week);
      if (reorderId) {
        if (away.length === landed.length) setViewWeek(weekStart(away[0]));
        return;
      }
      if (away.length > 0) {
        const where = away.length === landed.length ? dayLabel(landed[0]) : "another week";
        toast.show(`Moved ${moving.size === 1 ? "card" : `${moving.size} cards`} to ${where}`);
      }
      endSelection();
    });
  }

  function navigate(deltaWeeks: number) {
    regainMoveKeys();
    const next = addDays(week, deltaWeeks * 7);
    setViewWeek(next);
    // The stacked layout keeps its weekday when it flips weeks.
    setStripDay((current) => (typeof current === "string" ? addDays(current, deltaWeeks * 7) : next));
  }

  function showThisWeek() {
    regainMoveKeys();
    setViewWeek(null);
    setStripDay(undefined);
  }

  function pickStripDay(day: string | null) {
    // With something in hand the chips are drop targets, not navigation.
    if (inHand) placeAt(day, null);
    else setStripDay(day);
  }

  async function handleRollover(choice: "monday" | "backlog" | "leave") {
    const reason = await board.answerRollover(choice);
    if (reason) setError(`Couldn't save — ${reason}`);
  }

  // Keyboard (Workboard borrow): while a move is armed, up and down walk the
  // card one row at a time, left and right slide it a day, and Escape puts
  // it down. The move stays armed so repeated presses keep going; a tap or
  // Escape ends it. Desktop only — the capture input is not mounted where it
  // would pop a soft keyboard.
  function onMoveKey(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const key = event.nativeEvent.key;
    if (key === "Escape") {
      setReorderId(null);
      return;
    }
    if (!reorderId) return;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      slide(key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    const moving = cards.find((card) => card.id === reorderId);
    if (!moving) {
      setReorderId(null);
      return;
    }
    const rows = rowsByColumn.get(moving.day) ?? [];
    const target = neighborIndex(rows, moving.id, key === "ArrowUp" ? -1 : 1);
    if (target < 0 || target > rows.length) return;
    void saveOrExplain((current) => placeCard(current, rows, moving.id, target));
  }

  function archiveGroup(group: CardGroup) {
    const ids = new Set(group.cards.map((card) => card.id));
    const stamp = new Date().toISOString();
    // The transform runs once per rebase attempt; after resolution this holds
    // the undo from the attempt that actually landed.
    let landed: ArchiveUndo | null = null;
    void board
      .updateCards((current) => {
        const { next, undo } = recordArchive(current, ids, stamp);
        landed = undo;
        return next;
      })
      .then((reason) => {
        if (reason) setError(`Couldn't save — ${reason}`);
        else if (landed) pushArchiveUndo(landed);
      });
  }

  /** CI/review chips ride the latest run's workspace; unlinked cards stay PAT-only. */
  function hostPrSignal(card: BoardCard) {
    const workspaceId = card.runs[card.runs.length - 1]?.workspaceId;
    return prSignalForCard(card, workspaceId ? workspaceRuntimes.get(workspaceId)?.pullRequest : null);
  }

  /** One card, wherever it renders. What a tap does depends on what is in hand. */
  function renderCard(card: BoardCard, { dense, grouped }: RenderCardOptions) {
    return (
      <CardRow
        key={card.id}
        theme={theme}
        card={card}
        agent={latestAgent(card, agents)}
        runStartedAt={latestStart(card)}
        prSignal={hostPrSignal(card)}
        hasNote={noteKeys.has(noteKey(card))}
        now={now}
        active={reorderId === card.id}
        selected={selected.has(card.id)}
        // The backlog keeps its circles up with no session; elsewhere they come with one.
        showSelect={selectMode || card.day === null}
        onToggleSelect={() => toggleSelect(card.id)}
        dense={dense}
        compact={layout.compact}
        grouped={grouped}
        onPress={() => {
          if (reorderId) placeAt(card.day, rowsByColumn.get(card.day)?.indexOf(card) ?? null);
          else if (selectMode) toggleSelect(card.id);
          else onOpenCard(card.id);
        }}
        onLongPress={() => arm(card.id)}
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
  }

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

  const selectButton = (
    <ToolbarButton theme={theme} label={selectMode ? "Stop selecting" : "Select cards"} onPress={toggleSelectMode}>
      <Icon
        name="ListChecks"
        size={13}
        color={selectMode ? theme.colors.accent : theme.colors.foregroundMuted}
      />
      <Text style={{ color: selectMode ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 11 }}>
        {selectMode ? "Selecting" : "Select"}
      </Text>
    </ToolbarButton>
  );

  const movingCard = reorderId ? (cards.find((card) => card.id === reorderId) ?? null) : null;
  const slideActions = [
    { label: "Next day", onPress: () => slide(1) },
    { label: "Next week", onPress: () => slide(WEEK_SLIDE) },
  ];

  const notices = (
    <>
      {needRollover ? <RolloverBanner theme={theme} count={earlier.length} onAnswer={handleRollover} /> : null}
      {archiveUndo ? <ArchiveUndoBar theme={theme} undo={archiveUndo} onUndo={runUndo} /> : null}
      {movingCard ? (
        <MoveBar
          theme={theme}
          message={`Moving “${movingCard.title}”`}
          hint={stacked ? "Tap a day to place it." : "Tap a day to place it · ← → slide a day · ↑ ↓ reorder · Esc puts it down"}
          actions={movingCard.day === null ? slideActions : [...slideActions, { label: "Backlog", onPress: () => placeAt(null, null) }]}
          onCancel={() => setReorderId(null)}
          cancelLabel="Put down"
        />
      ) : null}
      {selected.size > 0 ? (
        <MoveBar
          theme={theme}
          message={`${selected.size} selected`}
          hint={stacked ? "Tap a day to move them." : "Tap a day to move them all."}
          actions={[...slideActions, { label: "Backlog", onPress: () => placeAt(null, null) }]}
          onCancel={endSelection}
          cancelLabel="Clear"
        />
      ) : null}
      {reorderId && !stacked ? (
        <TextInput
          ref={moveKeysInput}
          autoFocus
          value=""
          onChangeText={() => {}}
          onKeyPress={onMoveKey}
          accessibilityLabel="Arrow keys move the card, Escape puts it down"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
      ) : null}
    </>
  );

  const emptyBoard = (
    <EmptyBoard theme={theme} onAddFromChannel={() => setOpenChannel("jira")} onNewPrompt={() => quickAddInput.current?.focus()} />
  );

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
      cards={live}
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
        onPick={(issue) => addCardFromIssue(issue, "jira", today)}
        onOpenSettings={onOpenSettings}
      />
      <GitHubSheet
        theme={theme}
        open={openChannel === "github"}
        onOpenChange={(open) => setOpenChannel(open ? "github" : null)}
        onBoard={onBoardKeys}
        onPick={(pr) => addCardFromPr(pr, today)}
        onOpenSettings={onOpenSettings}
      />
      <LinearSheet
        theme={theme}
        open={openChannel === "linear"}
        onOpenChange={(open) => setOpenChannel(open ? "linear" : null)}
        onBoard={onBoardKeys}
        onPick={(issue) => addCardFromIssue(issue, "linear", today)}
        onOpenSettings={onOpenSettings}
      />
    </>
  );

  const toolbar = (
    <WeekToolbar
      theme={theme}
      week={week}
      today={today}
      prevCount={prevWeekCount}
      nextCount={nextWeekCount}
      onNavigate={navigate}
      onThisWeek={showThisWeek}
      trailing={
        <>
          {stacked ? channelButton("jira", "Jira") : null}
          {stacked ? channelButton("github", "GitHub") : null}
          {stacked ? channelButton("linear", "Linear") : null}
          {selectButton}
        </>
      }
    />
  );

  if (stacked) {
    const shownDay = stripDay === undefined ? today : stripDay;
    const shownLive = shownDay === null ? backlog : byDay.get(shownDay) ?? [];
    const shownDone = shownDay === null ? [] : doneByDay.get(shownDay) ?? [];
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {toolbar}
          {notices}
          {firstRun ? (
            emptyBoard
          ) : (
            <>
              <DayStrip
                theme={theme}
                week={week}
                today={today}
                selected={shownDay}
                backlogCount={backlog.length}
                onSelect={pickStripDay}
              />
              <ColumnHeading
                theme={theme}
                title={shownDay === null ? "Backlog" : shownDay === today ? "Today" : dayLabel(shownDay)}
                subtitle={shownDay === null && backlog.length > 0 ? `${backlog.length} parked` : shownDay === today ? dayLabel(today) : null}
                done={shownDone.length}
              />
              <ColumnBody
                theme={theme}
                day={shownDay}
                live={shownLive}
                done={shownDone}
                dense={false}
                droppable={inHand}
                cleared={shownDay === today && shownLive.length === 0 && shownDone.length > 0 ? { done: shownDone.length } : null}
                renderCard={renderCard}
                onArchiveAll={archiveGroup}
                onOpenCard={onOpenCard}
                onDrop={(day) => placeAt(day, null)}
              />
            </>
          )}
          {rail}
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
      <View style={{ flex: 1, minWidth: 0 }} onLayout={(event) => setBoardWidth(event.nativeEvent.layout.width)}>
        {toolbar}
        {notices}
        {firstRun ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            {emptyBoard}
          </ScrollView>
        ) : (
          <WeekGrid
            theme={theme}
            week={week}
            today={today}
            cards={cards}
            available={Math.max(boardWidth - 8, 0)}
            droppable={inHand}
            renderCard={renderCard}
            onArchiveAll={archiveGroup}
            onOpenCard={onOpenCard}
            onDrop={({ day, rowIndex }: DropTarget) => placeAt(day, rowIndex)}
          />
        )}
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

function latestAgent(card: BoardCard, agents: Map<string, AgentEntry>): AgentEntry | null {
  const run = card.runs[card.runs.length - 1];
  return run ? (agents.get(run.agentId) ?? null) : null;
}

function latestStart(card: BoardCard): number | null {
  const run = card.runs[card.runs.length - 1];
  return run ? Date.parse(run.startedAt) : null;
}
