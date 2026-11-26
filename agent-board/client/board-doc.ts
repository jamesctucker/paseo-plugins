import { useCallback, useRef } from "react";
import { settingsRpc } from "@getpaseo/plugin";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { SettingsState } from "@getpaseo/plugin/client";
import { boardDoc, type BoardCard, type BoardValues } from "../shared/settings";
import { localDay } from "../shared/day";
import { rollover, weekStart } from "../shared/week";
import { declineKey } from "../shared/links";
import type { AgentEntry } from "./agent-directory";

/**
 * One board-document reader shared by the board and card-detail screens. Keeps
 * the last good values around so an offline host still renders the cached board
 * instead of an empty frame.
 *
 * Writes go through the settings RPC directly rather than useSettings.save:
 * the host answers {saved | conflict | invalid, error} and the SDK's boolean
 * flattening throws the reason away. The rejection reason rides the promise —
 * returning it through React state would hand callers the stale render's null.
 */

const boardReadRpc = settingsRpc("board").read;
const boardWriteRpc = settingsRpc("board").write;

export interface BoardDoc {
  values: BoardValues;
  revision: string;
  loading: boolean;
  offline: boolean;
  /** Null when saved; the host's rejection reason otherwise. */
  saveValues(next: BoardValues): Promise<string | null>;
  saveCards(cards: BoardCard[]): Promise<string | null>;
  /**
   * Apply a transform to the live card list. Two gestures inside one
   * settings-propagation window, the note autosave, or another client can move
   * the doc between render and write; on a write conflict the transform is
   * re-applied to the freshly read doc and retried, so concurrent writes no
   * longer drop the later action. Transforms must be pure (they can run more
   * than once) and should key on card ids, not closure state.
   */
  updateCards(transform: (cards: BoardCard[]) => BoardCard[]): Promise<string | null>;
  /** Answer the weekly rollover; null when saved, the host's rejection reason otherwise. */
  answerRollover(choice: "monday" | "backlog" | "leave"): Promise<string | null>;
  dismissAttention(agentId: string, stamp: string): Promise<boolean>;
  addManualGate(text: string): Promise<string | null>;
  removeManualGate(id: string): Promise<string | null>;
  /** Write an issue-keyed note; empty text removes it. */
  saveNote(key: string, text: string): Promise<string | null>;
  clearDoneNag(key: string): Promise<string | null>;
  /** Attach an agent the board didn't start as the card's latest run. */
  linkAgent(cardId: string, agent: AgentEntry): Promise<string | null>;
  declineLink(cardId: string, agentId: string): Promise<string | null>;
}

/** Conflict-rebase attempts before giving up and surfacing the reason. */
const WRITE_ATTEMPTS = 3;

export function useBoardDoc(): BoardDoc {
  const settings = useSettings(boardDoc);
  const paseo = usePaseo();
  const writeBoard = useRpc(boardWriteRpc);
  const readBoard = useRpc(boardReadRpc);
  const lastGood = useRef<BoardValues>({
    cards: [],
    rolloverAnsweredWeek: "",
    cardNotes: {},
    dismissedAttention: {},
    manualGates: {},
    clearedDoneNags: {},
    declinedLinks: {},
  });

  const state = settings as SettingsState<typeof boardDoc.schema>;
  const ready = state.status === "ready";
  if (ready) lastGood.current = state.values;
  const values = ready ? state.values : lastGood.current;
  const revision = ready ? state.revision : "";
  const offline = state.status === "error" || state.status === "loading";

  const saveValues = useCallback(
    async (next: BoardValues): Promise<string | null> => {
      if (!ready) return "Board is not connected";
      try {
        const result = await writeBoard({ revision, values: next });
        if (result.status === "saved") return null;
        // A conflict means the doc moved after this screen last read it (e.g.
        // the migration at plugin reload). Re-sync immediately so the next
        // attempt saves against the fresh revision instead of failing again.
        if (result.status === "conflict") void settings.reload();
        return result.error;
      } catch (cause) {
        return cause instanceof Error ? cause.message : String(cause);
      }
    },
    // revision changes are the doc version we save against; writeBoard identity is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, revision],
  );

  /**
   * Rebase-and-retry core for every board mutation. The first attempt builds
   * on the values this screen rendered; a conflict re-reads the live doc and
   * re-applies the transform to it, so a concurrent write neither blocks this
   * action nor gets clobbered by it. saveValues stays single-shot: a fully
   * precomputed doc cannot be rebased, which is exactly why racing callers use
   * updateCards and the keyed mutators instead.
   */
  const mutate = useCallback(
    async (transform: (current: BoardValues) => BoardValues): Promise<string | null> => {
      if (!ready) return "Board is not connected";
      let current = values;
      let currentRevision = revision;
      for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
        let result;
        try {
          result = await writeBoard({ revision: currentRevision, values: transform(current) });
        } catch (cause) {
          return cause instanceof Error ? cause.message : String(cause);
        }
        if (result.status === "saved") return null;
        if (result.status === "invalid") return result.error;
        let fresh;
        try {
          fresh = await readBoard({});
        } catch (cause) {
          return cause instanceof Error ? cause.message : String(cause);
        }
        if (fresh.status !== "ready") return fresh.error;
        current = fresh.values as BoardValues;
        currentRevision = fresh.revision;
      }
      return "The board kept changing while saving; try again";
    },
    // values/revision are the rebase starting point; the RPC identities are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, values, revision, readBoard],
  );

  const saveCards = useCallback(
    async (cards: BoardCard[]) => saveValues({ ...values, cards }),
    // values captured per render is intended: card edits build on the latest read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const updateCards = useCallback(
    async (transform: (cards: BoardCard[]) => BoardCard[]) =>
      mutate((current) => ({ ...current, cards: transform(current.cards) })),
    [mutate],
  );

  // Marking the week answered rides the same write as the move, so a prompt
  // can never be dismissed without its cards going (or staying) where asked.
  const answerRollover = useCallback(
    async (choice: "monday" | "backlog" | "leave") => {
      const today = localDay(new Date());
      return mutate((current) => ({
        ...current,
        cards: rollover(current.cards, choice, today),
        rolloverAnsweredWeek: weekStart(today),
      }));
    },
    [mutate],
  );

  const dismissAttention = useCallback(
    async (agentId: string, stamp: string) => {
      const reason = await mutate((current) => ({
        ...current,
        dismissedAttention: { ...current.dismissedAttention, [agentId]: stamp },
      }));
      return reason === null;
    },
    [mutate],
  );

  const addManualGate = useCallback(
    async (text: string) =>
      mutate((current) => ({
        ...current,
        manualGates: {
          ...current.manualGates,
          [`gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`]: {
            text,
            createdAt: new Date().toISOString(),
          },
        },
      })),
    [mutate],
  );

  const removeManualGate = useCallback(
    async (id: string) =>
      mutate((current) => {
        const manualGates = { ...current.manualGates };
        delete manualGates[id];
        return { ...current, manualGates };
      }),
    [mutate],
  );

  const clearDoneNag = useCallback(
    async (key: string) =>
      mutate((current) => ({
        ...current,
        clearedDoneNags: { ...current.clearedDoneNags, [key]: new Date().toISOString() },
      })),
    [mutate],
  );

  const saveNote = useCallback(
    async (key: string, text: string) => {
      const trimmed = text.trim();
      return mutate((current) => {
        const cardNotes = { ...current.cardNotes };
        if (trimmed) cardNotes[key] = { text: trimmed, updatedAt: new Date().toISOString() };
        else delete cardNotes[key];
        return { ...current, cardNotes };
      });
    },
    [mutate],
  );

  const linkAgent = useCallback(
    async (cardId: string, agent: AgentEntry) => {
      // The live directory usually carries the workspace; an older daemon's
      // feed may not, so ask the agent itself before giving up.
      let workspaceId = agent.workspaceId;
      if (!workspaceId) {
        try {
          const handle = paseo.agents.ref(agent.id);
          await handle.refresh();
          workspaceId = handle.workspaceId;
        } catch {
          // Falls through to the error below.
        }
      }
      if (!workspaceId) return "Couldn't find that agent's workspace";
      const run = { agentId: agent.id, workspaceId, startedAt: agent.createdAt };
      return updateCards((cards) =>
        cards.map((card) => (card.id === cardId ? { ...card, runs: [...card.runs, run] } : card)),
      );
    },
    [updateCards, paseo],
  );

  const declineLink = useCallback(
    async (cardId: string, agentId: string) =>
      mutate((current) => ({
        ...current,
        declinedLinks: { ...current.declinedLinks, [declineKey(cardId, agentId)]: new Date().toISOString() },
      })),
    [mutate],
  );

  return {
    values,
    revision,
    loading: state.status === "loading",
    offline,
    saveValues,
    saveCards,
    updateCards,
    answerRollover,
    dismissAttention,
    addManualGate,
    removeManualGate,
    saveNote,
    clearDoneNag,
    linkAgent,
    declineLink,
  };
}
