import { useCallback, useRef } from "react";
import { useSettings } from "@getpaseo/plugin/client";
import type { SettingsState } from "@getpaseo/plugin/client";
import { boardDoc, type BoardCard, type BoardValues } from "../shared/settings";
import { carryOver, dropStale, localDay } from "../shared/day";

/**
 * One board-document reader shared by the board and card-detail screens. Keeps
 * the last good values around so an offline host still renders the cached board
 * instead of an empty frame.
 */

export interface BoardDoc {
  values: BoardValues;
  revision: string;
  loading: boolean;
  offline: boolean;
  saveValues(next: BoardValues): Promise<boolean>;
  saveCards(cards: BoardCard[]): Promise<boolean>;
  answerMigration(carry: boolean): Promise<boolean>;
}

export function useBoardDoc(): BoardDoc {
  const settings = useSettings(boardDoc);
  const lastGood = useRef<BoardValues>({ cards: [], migrationAnsweredDay: "" });

  const state = settings as SettingsState<typeof boardDoc.schema>;
  const ready = state.status === "ready";
  if (ready) lastGood.current = state.values;
  const values = ready ? state.values : lastGood.current;
  const revision = ready ? state.revision : "";
  const offline = state.status === "error" || state.status === "loading";

  const saveValues = useCallback(
    async (next: BoardValues): Promise<boolean> => {
      if (!ready) return false;
      return settings.save(next, revision);
    },
    // revision changes are the doc version we save against; settings identity is stable
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
      return saveValues({ cards, migrationAnsweredDay: today });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, saveValues],
  );

  return { values, revision, loading: state.status === "loading", offline, saveValues, saveCards, answerMigration };
}