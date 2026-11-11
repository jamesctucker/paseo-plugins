import { useCallback, useRef } from "react";
import { settingsRpc } from "@getpaseo/plugin";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { SettingsState } from "@getpaseo/plugin/client";
import { boardDoc, type BoardCard, type BoardValues } from "../shared/settings";
import { carryOver, dropStale, localDay } from "../shared/day";
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

const boardWriteRpc = settingsRpc("board").write;

export interface BoardDoc {
  values: BoardValues;
  revision: string;
  loading: boolean;
  offline: boolean;
  /** Null when saved; the host's rejection reason otherwise. */
  saveValues(next: BoardValues): Promise<string | null>;
  saveCards(cards: BoardCard[]): Promise<string | null>;
  answerMigration(carry: boolean): Promise<boolean>;
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

export function useBoardDoc(): BoardDoc {
  const settings = useSettings(boardDoc);
  const paseo = usePaseo();
  const writeBoard = useRpc(boardWriteRpc);
  const lastGood = useRef<BoardValues>({
    cards: [],
    migrationAnsweredDay: "",
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

  const saveCards = useCallback(
    async (cards: BoardCard[]) => saveValues({ ...values, cards }),
    // values captured per render is intended: card edits build on the latest read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const answerMigration = useCallback(
    async (carry: boolean) => {
      const today = localDay(new Date());
      const cards = carry ? carryOver(values.cards, today) : dropStale(values.cards, today);
      return (await saveValues({ ...values, cards, migrationAnsweredDay: today })) === null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const dismissAttention = useCallback(
    async (agentId: string, stamp: string) => {
      const reason = await saveValues({ ...values, dismissedAttention: { ...values.dismissedAttention, [agentId]: stamp } });
      return reason === null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const addManualGate = useCallback(
    async (text: string) =>
      saveValues({
        ...values,
        manualGates: {
          ...values.manualGates,
          [`gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`]: {
            text,
            createdAt: new Date().toISOString(),
          },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const removeManualGate = useCallback(
    async (id: string) => {
      const manualGates = { ...values.manualGates };
      delete manualGates[id];
      return saveValues({ ...values, manualGates });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const clearDoneNag = useCallback(
    async (key: string) =>
      saveValues({
        ...values,
        clearedDoneNags: { ...values.clearedDoneNags, [key]: new Date().toISOString() },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  const saveNote = useCallback(
    async (key: string, text: string) => {
      const cardNotes = { ...values.cardNotes };
      const trimmed = text.trim();
      if (trimmed) cardNotes[key] = { text: trimmed, updatedAt: new Date().toISOString() };
      else delete cardNotes[key];
      return saveValues({ ...values, cardNotes });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
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
      return saveValues({
        ...values,
        cards: values.cards.map((card) => (card.id === cardId ? { ...card, runs: [...card.runs, run] } : card)),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues, paseo],
  );

  const declineLink = useCallback(
    async (cardId: string, agentId: string) =>
      saveValues({
        ...values,
        declinedLinks: { ...values.declinedLinks, [declineKey(cardId, agentId)]: new Date().toISOString() },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  return {
    values,
    revision,
    loading: state.status === "loading",
    offline,
    saveValues,
    saveCards,
    answerMigration,
    dismissAttention,
    addManualGate,
    removeManualGate,
    saveNote,
    clearDoneNag,
    linkAgent,
    declineLink,
  };
}