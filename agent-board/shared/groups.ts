import type { BoardCard } from "./settings";

/**
 * Task-card grouping (brief amendment 2026-11-05). Every card is a task; cards
 * sharing a tracker key render flat but grouped under a derived issue header.
 * Groups are derived from the card array, never stored: group order is the
 * position of a group's first card, task order is array order within the
 * group. Prompt cards never group — each is a singleton without a header.
 */

export interface CardGroup {
  /** Shared tracker identity (jiraKey or `repo#number`); null for prompts. */
  key: string | null;
  /** Denormalized parent-issue title for the header; falls back to the key. */
  issueTitle: string;
  /** Mirrored tracker status, shown once on the header instead of per card. */
  status: string;
  cards: BoardCard[];
}

/** The identity tasks group under: tracker key, pull reference, or null. */
export function cardKey(card: BoardCard): string | null {
  if (card.jiraKey) return card.jiraKey;
  if (card.github) return `${card.github.repo}#${card.github.number}`;
  return null;
}

/**
 * Bucket visible cards into ordered groups. Group order follows each group's
 * first card; cards keep their relative order inside the group. Adjacency is
 * not required — the group is a render-time derivation, so a stray task
 * cannot scatter its issue.
 */
export function buildGroups(cards: readonly BoardCard[]): CardGroup[] {
  const byKey = new Map<string, CardGroup>();
  const groups: CardGroup[] = [];
  for (const card of cards) {
    const key = cardKey(card);
    if (key === null) {
      groups.push({ key: null, issueTitle: card.title, status: "", cards: [card] });
      continue;
    }
    let group = byKey.get(key);
    if (!group) {
      group = { key, issueTitle: card.issueTitle ?? key, status: card.jiraStatus ?? "", cards: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    // Prefer the first sibling that actually carries the metadata.
    if (group.issueTitle === key && card.issueTitle) group.issueTitle = card.issueTitle;
    if (!group.status && card.jiraStatus) group.status = card.jiraStatus;
    group.cards.push(card);
  }
  return groups;
}

/**
 * Whether a group renders its header. A lone whole-issue task (title is the
 * issue title) would render the same text twice, so it stays a plain card;
 * anything else gets the key + issue-title anchor.
 */
export function showHeader(group: CardGroup): boolean {
  if (group.key === null) return false;
  if (group.cards.length > 1) return true;
  return group.cards[0].title !== group.issueTitle;
}

/** One card per (key, task title): the task-model dedupe rule. Live cards only. */
export function isDuplicate(cards: readonly BoardCard[], key: string, title: string): boolean {
  const wanted = title.trim().toLowerCase();
  return cards.some(
    (card) => !card.archivedAt && cardKey(card) === key && card.title.trim().toLowerCase() === wanted,
  );
}

/** New siblings land at their group's end; ungrouped cards append. */
export function insertAtGroupEnd(cards: readonly BoardCard[], card: BoardCard): BoardCard[] {
  const key = cardKey(card);
  const next = [...cards];
  if (key === null) {
    next.push(card);
    return next;
  }
  let lastSibling = -1;
  for (let i = 0; i < next.length; i++) {
    if (!next[i].archivedAt && cardKey(next[i]) === key) lastSibling = i;
  }
  // No live sibling: there is no group to join, so the card simply appends.
  if (lastSibling === -1) next.push(card);
  else next.splice(lastSibling + 1, 0, card);
  return next;
}

/**
 * A task title for display under its group header. The header already carries
 * the key, so a title that literally starts with "KEY: " (users type what
 * they know into the add-task field) sheds the redundant prefix; anything
 * left over that trims to nothing keeps the original.
 */
export function taskDisplayTitle(card: BoardCard, key: string): string {
  const prefix = `${key}:`;
  if (!card.title.toUpperCase().startsWith(prefix.toUpperCase())) return card.title;
  return card.title.slice(prefix.length).trim() || card.title;
}

/**
 * A new task card under the same tracker identity as `source`. Fields are
 * copied one by one, never spread: the board doc crosses an RPC boundary
 * validated as z.json(), and an explicit `github: undefined` on a Jira card
 * is not valid JSON — one undefined property rejects the entire write.
 */
export function siblingTaskCard(source: BoardCard, title: string, id: string, createdAt: string): BoardCard {
  const card: BoardCard = {
    id,
    source: source.source,
    title,
    body: "",
    day: source.day,
    createdAt,
    archivedAt: null,
    runs: [],
  };
  if (source.issueTitle !== undefined) card.issueTitle = source.issueTitle;
  if (source.jiraKey !== undefined) card.jiraKey = source.jiraKey;
  if (source.jiraUrl !== undefined) card.jiraUrl = source.jiraUrl;
  if (source.jiraStatus !== undefined) card.jiraStatus = source.jiraStatus;
  if (source.github !== undefined) card.github = source.github;
  return card;
}

/**
 * Tap-to-place placement. `visible` is the ordered Today rows (the same list
 * the UI indexes); `targetIndex` is the tapped row. Placing within the moving
 * card's own group reorders just that task; placing onto another group moves
 * the whole group as a unit, landing where the target group starts. Tapping
 * the picked-up row itself is a no-op.
 */
export function placeCard(
  cards: readonly BoardCard[],
  visible: readonly BoardCard[],
  movingId: string,
  targetIndex: number,
): BoardCard[] {
  const moving = cards.find((card) => card.id === movingId);
  if (!moving) return [...cards];
  const target = targetIndex < visible.length ? visible[targetIndex] : null;
  if (target && target.id === movingId) return [...cards];
  const movingKey = cardKey(moving);

  if (movingKey === null || (target && cardKey(target) === movingKey)) {
    // Singletons and within-group moves: one card, anchored on the tapped
    // row's identity so archived cards elsewhere cannot shift the slot.
    const rest = cards.filter((card) => card.id !== movingId);
    const anchor = target ? rest.findIndex((card) => card.id === target.id) : rest.length;
    const next = [...rest];
    next.splice(anchor < 0 ? rest.length : anchor, 0, moving);
    return next;
  }

  // Onto another group: the whole group moves as a unit, task order kept.
  const unit = cards.filter((card) => cardKey(card) === movingKey);
  const others = cards.filter((card) => cardKey(card) !== movingKey);
  const anchorId = target ? others.find((card) => cardKey(card) === cardKey(target))?.id : null;
  const at = anchorId ? others.findIndex((card) => card.id === anchorId) : others.length;
  const next = [...others];
  next.splice(at < 0 ? others.length : at, 0, ...unit);
  return next;
}
