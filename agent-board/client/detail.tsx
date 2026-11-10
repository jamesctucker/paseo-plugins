import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { ExternalLink, Markdown } from "@getpaseo/plugin/client/ui";
import { formatElapsed, formatRelative, localDay } from "../shared/day";
import { cardKey, insertAtGroupEnd, isDuplicate, siblingTaskCard, taskDisplayTitle } from "../shared/groups";
import { nextUp, type ChainInfo } from "../shared/gates";
import { recordArchive, type ArchiveUndo } from "../shared/undo";
import { ArchiveUndoBar, pushArchiveUndo, useArchiveUndo } from "./undo";
import { prSignalForCard } from "../shared/pr-signal";
import { useWorkspaceRuntimes } from "./workspace-runtime";
import { newCardId, type BoardCard } from "../shared/settings";
import { githubGetRpc } from "../shared/contracts";
import { useRpc } from "@getpaseo/plugin/client";
import { useAgentDirectory, useTicker, useWorkspaceTitles, type AgentEntry } from "./agent-directory";
import { useBoardDoc } from "./board-doc";
import { useGates } from "./gates";
import { SpawnSheet } from "./spawn-sheet";
import { LinkSheet } from "./link-sheet";
import { GroupLabel, Chip, LinkRow, PulseDot, SourceTag, agentColor, agentLabel, monoFont, sourceGlyph } from "./ui";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";

/**
 * Card detail: the issue body, mirrored tracker status, sibling tasks under
 * the same issue, run history, and the card's one primary action, Run.
 * Archive and Delete cover the paper ritual's strike-out; reordering lives
 * on the board's tap-to-place, not here. For task cards this is the issue
 * control center: add a task, jump between siblings, archive the whole
 * issue. Content stays in a 600pt reading column — full-bleed at desktop
 * width reads as unfinished, not restrained.
 */

export interface CardDetailScreenProps extends PluginScreenProps {
  onOpenCard?(cardId: string): void;
  /** Where a completed delete lands; without it the screen shows the empty state. */
  onOpenBoard?(): void;
}

export function CardDetailScreen({ theme, params, navigation, onOpenCard, onOpenBoard }: CardDetailScreenProps) {
  const board = useBoardDoc();
  const gatesApi = useGates(board);
  const { undo: archiveUndo, runUndo } = useArchiveUndo(board);
  const workspaceRuntimes = useWorkspaceRuntimes();
  const getPr = useRpc(githubGetRpc);
  const { agents } = useAgentDirectory();
  const now = useTicker();
  const toast = useToast();
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteArmed, armDelete, disarmDelete] = useArmed();
  const [archiveArmed, armArchive, disarmArchive] = useArmed();
  const [archiveAllArmed, armArchiveAll, disarmArchiveAll] = useArmed();
  const [taskDraft, setTaskDraft] = useState("");
  const [runsExpanded, setRunsExpanded] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<string | null>(null);

  // This screen can stay mounted across sibling navigation: every piece of
  // card-scoped state resets on a card switch, or an armed delete on card A
  // plus one tap on card B deletes B.
  const cardId = params.cardId;
  useEffect(() => {
    disarmDelete();
    disarmArchive();
    disarmArchiveAll();
    setRunsExpanded(false);
    setLinkOpen(false);
    setTaskDraft("");
    // disarm identity is stable per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const cards = board.values.cards;
  const index = cards.findIndex((card) => card.id === params.cardId);
  const card = index >= 0 ? cards[index] : null;
  const agent = useMemo(() => {
    if (!card) return null;
    const run = card.runs[card.runs.length - 1];
    return run ? (agents.get(run.agentId) ?? null) : null;
  }, [card, agents]);
  const workspaceTitles = useWorkspaceTitles(agents, card?.runs.map((run) => run.workspaceId));

  // The chain this Linear card's project forms (amendment decision 1:
  // context, not content — the chain renders here, never on the board).
  const chain = card?.source === "linear" && card.jiraKey ? gatesApi.chainForKey(card.jiraKey) : null;

  // Host CI/review signal from the latest run's workspace, when that
  // workspace's branch PR is this card's PR.
  const hostSignal = card
    ? prSignalForCard(
        card,
        card.runs.length > 0
          ? workspaceRuntimes.get(card.runs[card.runs.length - 1].workspaceId)?.pullRequest
          : null,
      )
    : null;

  // The PR's review posture for the badge next to Open in GitHub: the host's
  // own polling answers first, and the PAT fetch covers cards with no linked
  // workspace. A failed fetch degrades to no badge, matching the enrichment
  // pattern elsewhere.
  useEffect(() => {
    setReviewDecision(hostSignal?.reviewDecision ?? null);
    if (!card?.github || hostSignal?.reviewDecision) return;
    const { repo, number } = card.github;
    let cancelled = false;
    getPr({ key: `${repo}#${number}` })
      .then((detail) => {
        if (!cancelled && detail.reviewDecision) setReviewDecision(detail.reviewDecision);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // getPr identity is stable per installation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, hostSignal?.reviewDecision]);

  // Siblings are the other live tasks under the same tracker key.
  const siblings = useMemo(() => {
    if (!card) return [];
    const key = cardKey(card);
    if (!key) return [];
    return cards.filter((entry) => entry.id !== card.id && !entry.archivedAt && cardKey(entry) === key);
  }, [cards, card]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>This card is no longer on the board.</Text>
      </View>
    );
  }

  function save(next: typeof cards) {
    // A rejected write's reason rides the saveCards promise; never swallow it.
    void board.saveCards(next).then((reason) => {
      if (reason) toast.show(`Couldn't save — ${reason}`, { variant: "error" });
    });
  }

  function addSiblingTask() {
    const title = taskDraft.trim();
    const key = card ? cardKey(card) : null;
    if (!card || !key || !title) return;
    if (isDuplicate(cards, key, title)) {
      toast.show(`${key} task "${title}" is already on the board`, { variant: "error" });
      return;
    }
    // Today's task, even from an archived card's detail: copying the source's
    // day would birth an instantly-stale card. The draft clears only after
    // the save lands — a rejected write must not eat the typed title.
    const sibling = { ...siblingTaskCard(card, title, newCardId(), new Date().toISOString()), day: localDay(new Date()) };
    void board.saveCards(insertAtGroupEnd(cards, sibling)).then((reason) => {
      if (reason) {
        toast.show(`Couldn't save — ${reason}`, { variant: "error" });
        return;
      }
      setTaskDraft("");
    });
  }

  /**
   * Archive, and mark the moment when it empties Today. The board's cleared
   * state celebrates on its own, but archiving from here keeps you on this
   * screen, so the last card of the day would otherwise land in silence.
   */
  function saveArchive(next: typeof cards, undo?: ArchiveUndo | null) {
    const today = localDay(new Date());
    const clearsDay = !next.some((entry) => !entry.archivedAt && entry.day >= today);
    void board.saveCards(next).then((reason) => {
      if (reason) {
        toast.show(`Couldn't save — ${reason}`, { variant: "error" });
        return;
      }
      // The undo offer rides the confirmed save — offering a reversal for an
      // archive that never landed would un-archive whatever wins the conflict.
      if (undo) pushArchiveUndo(undo);
      if (clearsDay) toast.show("That was the last one. Day's clear.", { variant: "success" });
    });
  }

  function archiveAll() {
    // `card` is non-null at render time, but hoisted closures don't inherit
    // the early-return narrowing.
    const key = card ? cardKey(card) : null;
    if (!key) return;
    const ids = new Set(cards.filter((entry) => cardKey(entry) === key).map((entry) => entry.id));
    const { next, undo } = recordArchive(cards, ids, new Date().toISOString());
    saveArchive(next, undo);
  }

  const runStartedAt = card.runs.length > 0 ? Date.parse(card.runs[card.runs.length - 1].startedAt) : null;
  // When the latest run is live the footer's primary becomes "Open agent".
  const liveAgentId =
    agent && (agent.status === "running" || agent.status === "initializing") && card.runs.length > 0
      ? card.runs[card.runs.length - 1].agentId
      : null;
  // The archive-all count must name what archiveAll actually shelves: live
  // cards only — the current card counts only when it isn't archived itself.
  const groupLiveCount = siblings.length + (card.archivedAt ? 0 : 1);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 600,
          alignSelf: "center",
        }}
      >
        {archiveUndo ? <ArchiveUndoBar theme={theme} undo={archiveUndo} onUndo={runUndo} /> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={sourceGlyph(card.source)} size={14} color={theme.colors.foregroundMuted} />
          <SourceTag theme={theme} source={card.source} />
          {cardKey(card) ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: monoFont }}>{cardKey(card)}</Text>
          ) : null}
          {card.jiraStatus ? <Chip theme={theme} text={card.jiraStatus} color={theme.colors.foregroundMuted} style={{ flexShrink: 1 }} /> : null}
          <View style={{ flex: 1 }} />
          {liveAgentId ? (
            // Same chip as card-row, same contract: it opens the agent.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open the running agent"
              onPress={() => navigation?.openAgent({ agentId: liveAgentId })}
              hitSlop={6}
            >
              <Chip
                theme={theme}
                text={runStartedAt ? formatElapsed(runStartedAt, now) : "running"}
                color={theme.colors.accent}
              />
            </Pressable>
          ) : null}
        </View>

        <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "600" }}>{card.title}</Text>

        {/* The issue's own name, denormalized on the card (brief amendment
            decision 8) so this screen stays the issue control center even
            after the whole-issue task is archived. */}
        {card.issueTitle && card.issueTitle !== card.title ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Issue: {card.issueTitle}</Text>
        ) : null}

        {/* Tracker links are navigation, not action: muted, one row, never
            competing with Run's accent. */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {card.jiraUrl ? (
            <ExternalLink
              href={card.jiraUrl}
              accessibilityLabel={card.source === "linear" ? "Open issue in Linear" : "Open issue in Jira"}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {card.source === "linear" ? "Open in Linear" : "Open in Jira"}
              </Text>
            </ExternalLink>
          ) : null}
          {card.github ? (
            <ExternalLink
              href={`https://github.com/${card.github.repo}/pull/${card.github.number}`}
              accessibilityLabel="Open pull request in GitHub"
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Open in GitHub</Text>
            </ExternalLink>
          ) : null}
          {hostSignal?.checksStatus ? (
            <Chip
              theme={theme}
              text={
                hostSignal.checksStatus === "success"
                  ? "CI passing"
                  : hostSignal.checksStatus === "failure"
                    ? `CI failing${hostSignal.failedChecks > 0 ? ` (${hostSignal.failedChecks})` : ""}`
                    : "CI pending"
              }
              color={
                hostSignal.checksStatus === "success"
                  ? theme.colors.statusSuccess
                  : hostSignal.checksStatus === "failure"
                    ? theme.colors.statusDanger
                    : theme.colors.foregroundMuted
              }
            />
          ) : null}
          {reviewDecision ? (
            <Chip
              theme={theme}
              text={
                reviewDecision === "changes_requested"
                  ? "Changes requested"
                  : reviewDecision === "approved"
                    ? "Approved"
                    : "Review pending"
              }
              color={
                reviewDecision === "changes_requested"
                  ? theme.colors.statusWarning
                  : reviewDecision === "approved"
                    ? theme.colors.statusSuccess
                    : theme.colors.foregroundMuted
              }
            />
          ) : null}
        </View>

        {card.body ? <Markdown>{card.body}</Markdown> : null}

        {cardKey(card) !== null ? (
          <View style={{ gap: 4 }}>
            <GroupLabel theme={theme} text={`Tasks under ${cardKey(card)}`} />
            {siblings.map((sibling) => {
              const siblingRun = sibling.runs[sibling.runs.length - 1];
              const siblingAgent = siblingRun ? agents.get(siblingRun.agentId) : null;
              const live = siblingAgent?.status === "running" || siblingAgent?.status === "initializing";
              // No idle dot: a bullet that can never be ticked is a checkbox
              // metaphor lying on an execution board. Attention gets words.
              return (
                <Pressable
                  key={sibling.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    taskDisplayTitle(sibling, cardKey(card) ?? "") +
                    (siblingAgent ? `, ${agentLabel(siblingAgent)}` : "")
                  }
                  onPress={() => onOpenCard?.(sibling.id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 5,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {live ? <PulseDot color={theme.colors.accent} /> : null}
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
                    {taskDisplayTitle(sibling, cardKey(card) ?? "")}
                  </Text>
                  {siblingAgent?.requiresAttention ? (
                    <Chip theme={theme} text={agentLabel(siblingAgent)} color={agentColor(theme, siblingAgent)} style={{ flexShrink: 1 }} />
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Icon name="ChevronRight" size={12} color={theme.colors.foregroundMuted} />
                </Pressable>
              );
            })}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 }}>
              <TextInput
                value={taskDraft}
                onChangeText={setTaskDraft}
                onSubmitEditing={addSiblingTask}
                placeholder="Add a task…"
                placeholderTextColor={theme.colors.foregroundMuted}
                accessibilityLabel="New task title"
                autoCorrect={false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: theme.colors.foreground,
                  backgroundColor: theme.colors.surface1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  fontSize: 12,
                }}
              />
              {/* Ghost, not accent: Run is this screen's one filled action. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add sibling task"
                onPress={addSiblingTask}
                disabled={taskDraft.trim().length === 0}
                style={{
                  backgroundColor: theme.colors.surface1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  opacity: taskDraft.trim().length === 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>Add</Text>
              </Pressable>
            </View>
            {siblings.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  archiveAllArmed ? `Confirm archive all tasks for ${cardKey(card)}` : `Archive all tasks for ${cardKey(card)}`
                }
                onPress={() => {
                  if (!archiveAllArmed) {
                    armArchiveAll();
                    return;
                  }
                  disarmArchiveAll();
                  archiveAll();
                }}
                hitSlop={4}
                style={{ paddingVertical: 4 }}
              >
                <Text
                  style={{
                    color: archiveAllArmed ? theme.colors.statusWarning : theme.colors.foregroundMuted,
                    fontSize: 11,
                    fontWeight: archiveAllArmed ? "600" : "400",
                  }}
                >
                  {archiveAllArmed ? `Tap again to archive ${groupLiveCount} tasks` : `Archive all ${groupLiveCount} tasks`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {chain ? <ChainSection theme={theme} chain={chain} /> : null}

        <View style={{ gap: 4 }}>
          <GroupLabel theme={theme} text="Runs" />
          {card.runs.length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              No runs yet — Run starts the first agent.
            </Text>
          ) : (
            <>
              {/* The latest run gets a full row; the audit trail behind it
                  collapses into one quiet line so dead history cannot
                  dominate the screen. "latest" is relative — a single run
                  earns no marker. */}
              <RunRow
                theme={theme}
                run={card.runs[card.runs.length - 1]}
                agent={agents.get(card.runs[card.runs.length - 1].agentId) ?? null}
                workspaceTitle={workspaceTitles.get(card.runs[card.runs.length - 1].workspaceId) ?? null}
                now={now}
                latest={card.runs.length > 1}
                onOpen={(agentId) => navigation?.openAgent({ agentId })}
              />
              {card.runs.length > 1 ? (
                <>
                  {runsExpanded
                    ? card.runs
                        .slice(0, -1)
                        .reverse()
                        .map((run) => (
                          <RunRow
                            key={run.agentId}
                            theme={theme}
                            run={run}
                            agent={agents.get(run.agentId) ?? null}
                            workspaceTitle={workspaceTitles.get(run.workspaceId) ?? null}
                            now={now}
                            onOpen={(agentId) => navigation?.openAgent({ agentId })}
                          />
                        ))
                    : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      runsExpanded
                        ? "Hide previous runs"
                        : `Show ${card.runs.length - 1} previous ${card.runs.length === 2 ? "run" : "runs"}`
                    }
                    onPress={() => setRunsExpanded(!runsExpanded)}
                    hitSlop={4}
                    style={{ paddingVertical: 3 }}
                  >
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                      {runsExpanded
                        ? "Hide previous runs"
                        : `${card.runs.length - 1} previous ${card.runs.length === 2 ? "run" : "runs"}`}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </>
          )}
          {/* Agents started from chat or another plugin can join the card
              after the fact; the board only knows what it is told. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Link an existing agent to this card"
            onPress={() => setLinkOpen(true)}
            hitSlop={4}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name="Link" size={11} color={theme.colors.foregroundMuted} />
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Link an existing agent…</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* The border spans the window; the actions align with the 600pt
          content column. Run is the one filled accent — and when the card's
          latest run is live, the footer admits it: Open agent takes the
          accent, Run demotes to a ghost "Run again". Reorder lives on the
          board, not here. */}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", maxWidth: 600, alignSelf: "center" }}>
          {liveAgentId ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the running agent"
                onPress={() => navigation?.openAgent({ agentId: liveAgentId })}
                style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
              >
                <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>Open agent</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Run this card again"
                onPress={() => setSpawnOpen(true)}
                style={{ backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Run again</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Run this card"
              onPress={() => setSpawnOpen(true)}
              style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
            >
              <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>Run</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={card.archivedAt ? "Restore card to Today" : "Archive card"}
            onPress={() => {
              // Archiving under a live agent gets the arm; Restore and quiet
              // archiving stay one tap.
              if (!card.archivedAt && liveAgentId && !archiveArmed) {
                armArchive();
                return;
              }
              disarmArchive();
              if (card.archivedAt) {
                save(cards.map((entry) => (entry.id === card.id ? { ...entry, archivedAt: null } : entry)));
              } else {
                const { next, undo } = recordArchive(cards, new Set([card.id]), new Date().toISOString());
                saveArchive(next, undo);
              }
            }}
            style={{
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: archiveArmed ? theme.colors.statusWarning : theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            <Text style={{ color: archiveArmed ? theme.colors.statusWarning : theme.colors.foreground, fontSize: 13, fontWeight: archiveArmed ? "600" : "400" }}>
              {card.archivedAt ? "Restore" : archiveArmed ? "Agent running — tap again" : "Archive"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deleteArmed ? "Confirm delete card" : "Delete card"}
            onPress={() => {
              if (!deleteArmed) {
                armDelete();
                return;
              }
              disarmDelete();
              // A completed delete is a success, not a missing card: leave
              // the detail screen for the board instead of stranding the
              // user on error-shaped copy.
              void board.saveCards(cards.filter((entry) => entry.id !== card.id)).then((reason) => {
                if (reason) {
                  toast.show(`Couldn't save — ${reason}`, { variant: "error" });
                  return;
                }
                onOpenBoard?.();
              });
            }}
            style={{
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: deleteArmed ? theme.colors.statusDanger : theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            <Text style={{ color: theme.colors.statusDanger, fontSize: 13, fontWeight: deleteArmed ? "600" : "400" }}>
              {/* Delete is a board gesture, not a lifecycle one — but the
                  armed copy must admit a live agent before it commits. */}
              {deleteArmed ? (liveAgentId ? "Agent is running — confirm delete" : "Confirm delete") : "Delete"}
            </Text>
          </Pressable>
        </View>
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
        onOpenAgent={(agentId) => navigation?.openAgent({ agentId })}
      />
      <LinkSheet
        theme={theme}
        card={card}
        cards={cards}
        agents={agents}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLink={async (picked) => {
          const reason = await board.linkAgent(card.id, picked);
          if (!reason) toast.show("Agent linked", { variant: "success" });
          return reason;
        }}
      />
    </View>
  );
}

/**
 * The chain a Linear card belongs to: every project issue in delegation
 * order with its state. Done issues strike through; the resume point names
 * whose move it is ("Yours" for creative/unrouted, "Resumable" for rote).
 */
function ChainSection({ theme, chain }: { theme: PluginTheme; chain: ChainInfo }) {
  const next = nextUp(chain);
  return (
    <View style={{ gap: 4 }}>
      <GroupLabel theme={theme} text={`Chain · ${chain.projectName}`} />
      {chain.issues.map((issue) => {
        const isNext = next?.key === issue.key;
        return (
          <LinkRow key={issue.key} href={issue.url} accessibilityLabel={`Open ${issue.key} in Linear`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: issue.done
                    ? theme.colors.statusSuccess
                    : isNext
                      ? theme.colors.statusWarning
                      : theme.colors.border,
                }}
              />
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: monoFont }}>{issue.key}</Text>
              <Text
                style={{
                  color: issue.done ? theme.colors.foregroundMuted : theme.colors.foreground,
                  fontSize: 12,
                  flexShrink: 1,
                  textDecorationLine: issue.done ? "line-through" : "none",
                }}
                numberOfLines={1}
              >
                {issue.title}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
                {issue.done ? "Done" : isNext ? (issue.route === "rote" ? "Resumable" : "Yours") : issue.status}
              </Text>
            </View>
          </LinkRow>
        );
      })}
    </View>
  );
}

/** Two-tap arm with a 3s disarm: one shared hook for delete, archive, and
    archive-all, so a stray tap minutes later can never finish the job. */
function useArmed(): [boolean, () => void, () => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return [armed, () => setArmed(true), () => setArmed(false)];
}

/**
 * One run in the history: a human label ("Agent closed", not "gone"), a
 * relative timestamp, and the same pressed physics as sibling rows. The
 * accessibility label names this specific run so rows are distinguishable
 * in a screen reader.
 */
function RunRow({
  theme,
  run,
  agent,
  workspaceTitle,
  now,
  latest,
  onOpen,
}: {
  theme: PluginTheme;
  run: BoardCard["runs"][number];
  agent: AgentEntry | null;
  workspaceTitle: string | null;
  now: number;
  latest?: boolean;
  onOpen(agentId: string): void;
}) {
  const started = Date.parse(run.startedAt);
  const when = formatRelative(started, now);
  const label = agent ? agentLabel(agent) : "archived";
  const color = agent ? agentColor(theme, agent) : theme.colors.foregroundMuted;
  const live = agent?.status === "running" || agent?.status === "initializing";
  // The name is what tells runs apart. An archived agent leaves the
  // directory and takes its name with it, so the row says that instead.
  const name = agent ? (agent.title ?? "Untitled agent") : "Archived agent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open agent ${name}${workspaceTitle ? ` in ${workspaceTitle}` : ""}, ${label}, ${when}`}
      onPress={() => onOpen(run.agentId)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 5,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{ color: agent ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 13, fontWeight: latest ? "600" : "500" }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {/* Agents are often titled by their first prompt; the workspace is
            usually the human-named thing. Skipped when it adds nothing. */}
        {workspaceTitle && workspaceTitle !== name ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon name="Folder" size={11} color={theme.colors.foregroundMuted} />
            <Text style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
              {workspaceTitle}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {agent ? <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text> : null}
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{when}</Text>
          {/* The latest row earns its tag: live gets the elapsed accent, closed
              gets a muted marker. A bare word on an identical row was a lie. */}
          {latest && live ? <Chip theme={theme} text={formatElapsed(started, now)} color={theme.colors.accent} /> : null}
          {latest && !live ? <Chip theme={theme} text="latest" color={theme.colors.foregroundMuted} /> : null}
        </View>
      </View>
      <Icon name="ChevronRight" size={12} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}