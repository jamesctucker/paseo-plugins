import type { BoardCard } from "./settings";

/**
 * Undo window for archive (Workboard borrow, 2026-11-10). Archiving is the
 * board's one destructive gesture, and toasts can't carry an action button,
 * so the affordance is a feedback bar that lives for a few seconds after the
 * archive lands. The undo state is ephemeral by design: it never enters the
 * board document, so a reload simply costs you the window, never a write.
 *
 * One entry at a time. Rapid successive archives are intentional workflow, so
 * a new archive replaces the previous offer rather than queueing behind it.
 */

export const UNDO_WINDOW_MS = 8_000;

export interface ArchiveUndo {
  id: string;
  /** Each archived card as it stood after archiving, in pre-archive list order. */
  cards: BoardCard[];
  /** List index each snapshot occupied before archiving (same order as cards). */
  indexes: number[];
  expiresAt: number;
}

/**
 * Archive the given cards and capture what a reversal needs. Only live cards
 * are archived or snapshotted — an already-archived card changing stamp would
 * make its Done-nag look fresh. Returns undo: null when nothing was live.
 */
export function recordArchive(
  cards: readonly BoardCard[],
  ids: ReadonlySet<string>,
  stamp: string,
  now: number = Date.now(),
): { next: BoardCard[]; undo: ArchiveUndo | null } {
  const snapshots: BoardCard[] = [];
  const indexes: number[] = [];
  const next = cards.map((card, index) => {
    if (!ids.has(card.id) || card.archivedAt) return card;
    const archived = { ...card, archivedAt: stamp };
    snapshots.push(archived);
    indexes.push(index);
    return archived;
  });
  if (snapshots.length === 0) return { next, undo: null };
  return {
    next,
    undo: {
      id: `undo-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      cards: snapshots,
      indexes,
      expiresAt: now + UNDO_WINDOW_MS,
    },
  };
}

/**
 * Reverse a recorded archive against the current document. Cards still in the
 * doc un-archive in place (keeping any intervening edits); a card that
 * vanished mid-window is re-inserted at its original index.
 */
export function applyArchiveUndo(cards: readonly BoardCard[], undo: ArchiveUndo): BoardCard[] {
  const snapshotIds = new Set(undo.cards.map((card) => card.id));
  const next = cards.map((card) => (snapshotIds.has(card.id) ? { ...card, archivedAt: null } : card));
  const present = new Set(next.map((card) => card.id));
  const inserts = undo.cards
    .map((card, i) => ({ card, index: undo.indexes[i] }))
    .filter(({ card }) => !present.has(card.id))
    .sort((a, b) => a.index - b.index);
  for (const { card, index } of inserts) {
    next.splice(Math.min(index, next.length), 0, { ...card, archivedAt: null });
  }
  return next;
}

export function isUndoLive(undo: ArchiveUndo, now: number = Date.now()): boolean {
  return now < undo.expiresAt;
}

/**
 * The offer dies when the underlying cards move: a manual Restore, a delete,
 * or a doc reload that changed the archived stamp. Comparing the stamp (not
 * just presence) is what keeps a restored-then-rearchived card from being
 * un-archived by a stale offer.
 */
export function undoStillValid(cards: readonly BoardCard[], undo: ArchiveUndo): boolean {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return undo.cards.every((snap) => byId.get(snap.id)?.archivedAt === snap.archivedAt);
}

/** Bar copy: the single card's title, or the count for a group close-out. */
export function undoLabel(undo: ArchiveUndo): string {
  if (undo.cards.length === 1) return `Archived “${undo.cards[0].title}”`;
  return `Archived ${undo.cards.length} cards`;
}
