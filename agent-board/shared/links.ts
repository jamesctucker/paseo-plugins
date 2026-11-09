/**
 * Linking agents the board didn't start. A card's run record is all a link
 * is, so an agent spawned from chat or another plugin can join a card after
 * the fact. Suggestions come from the agent's or its workspace's title naming
 * the card's key or pull reference; they are offers, never automatic links, because a title
 * match is a guess.
 */

export interface LinkableAgent {
  id: string;
  title: string | null;
  status: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
  parentAgentId: string | null;
}

export interface LinkableCard {
  id: string;
  jiraKey?: string;
  github?: { repo: string; number: number };
  archivedAt: string | null;
  runs: readonly { agentId: string }[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Patterns that name this card in free text. A PR matches by full or short
 * repo reference or its URL; a tracker key matches as a whole token, so
 * PROJ-14 never claims a title about PROJ-142.
 */
function cardPatterns(card: LinkableCard): RegExp[] {
  if (card.github) {
    const { repo, number } = card.github;
    const name = repo.split("/").pop() ?? repo;
    const tail = `(?![0-9])`;
    return [
      new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(repo)}#${number}${tail}`, "i"),
      new RegExp(`(^|[^A-Za-z0-9_./-])${escapeRegExp(name)}#${number}${tail}`, "i"),
      new RegExp(`github\\.com/${escapeRegExp(repo)}/pull/${number}${tail}`, "i"),
    ];
  }
  if (card.jiraKey) return [new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(card.jiraKey)}(?![0-9])`, "i")];
  return [];
}

export function titleNamesCard(title: string | null | undefined, card: LinkableCard): boolean {
  if (!title) return false;
  return cardPatterns(card).some((pattern) => pattern.test(title));
}

/**
 * The text that ties an agent to a card: its own title, or its workspace's.
 * Workspaces are often named for the PR or issue while the agent keeps its
 * first-prompt title, so either can carry the reference.
 */
export function agentMatchText(
  agent: LinkableAgent,
  card: LinkableCard,
  workspaceTitles: ReadonlyMap<string, string>,
): string | null {
  if (titleNamesCard(agent.title, card)) return agent.title;
  const workspaceTitle = agent.workspaceId ? workspaceTitles.get(agent.workspaceId) : undefined;
  return titleNamesCard(workspaceTitle, card) ? (workspaceTitle ?? null) : null;
}

/** Every agent any card has ever run, so a linked agent is never re-offered. */
export function everLinkedAgentIds(cards: readonly LinkableCard[]): Set<string> {
  const ids = new Set<string>();
  for (const card of cards) for (const run of card.runs) ids.add(run.agentId);
  return ids;
}

export function declineKey(cardId: string, agentId: string): string {
  return `${cardId}:${agentId}`;
}

const isLive = (agent: LinkableAgent | undefined) => agent?.status === "running" || agent?.status === "initializing";

/**
 * Card id → agents worth offering, most recently active first. Skips archived
 * cards, cards whose latest run is still live (a second agent there is noise),
 * subagents (their parent is the thing to link), closed agents, agents any
 * card already holds, and pairs James declined.
 */
export function linkSuggestions<A extends LinkableAgent>(
  cards: readonly LinkableCard[],
  agents: ReadonlyMap<string, A>,
  declined: Readonly<Record<string, string>>,
  workspaceTitles: ReadonlyMap<string, string>,
): Map<string, A[]> {
  const taken = everLinkedAgentIds(cards);
  const candidates = [...agents.values()]
    .filter((agent) => !taken.has(agent.id) && !agent.parentAgentId && agent.status !== "closed")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const suggestions = new Map<string, A[]>();
  if (candidates.length === 0) return suggestions;
  for (const card of cards) {
    if (card.archivedAt) continue;
    const latest = card.runs[card.runs.length - 1];
    if (latest && isLive(agents.get(latest.agentId))) continue;
    const matches = candidates.filter(
      (agent) => !declined[declineKey(card.id, agent.id)] && agentMatchText(agent, card, workspaceTitles) !== null,
    );
    if (matches.length > 0) suggestions.set(card.id, matches);
  }
  return suggestions;
}

/**
 * The manual picker's order: agents naming the card first, then everything
 * else unlinked by recency. Subagents and already-linked agents stay out.
 */
export function linkPickerAgents<A extends LinkableAgent>(
  card: LinkableCard,
  cards: readonly LinkableCard[],
  agents: ReadonlyMap<string, A>,
  workspaceTitles: ReadonlyMap<string, string>,
): { matches: A[]; others: A[] } {
  const taken = everLinkedAgentIds(cards);
  const pool = [...agents.values()]
    .filter((agent) => !taken.has(agent.id) && !agent.parentAgentId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const matches: A[] = [];
  const others: A[] = [];
  for (const agent of pool) (agentMatchText(agent, card, workspaceTitles) !== null ? matches : others).push(agent);
  return { matches, others };
}
