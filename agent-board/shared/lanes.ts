/**
 * Lane bucketing for board-linked agents, shared by the rail, the sidebar
 * counts, and tests. Three disjoint buckets, matched in order: a permission
 * wait outranks running, and both outrank a bare attention flag.
 */

export type Lane = "needsYou" | "running" | "review";

export interface LaneAgent {
  id: string;
  status: string;
  requiresAttention: boolean;
  attentionReason: string | null;
  updatedAt: string;
}

export function laneOf(agent: LaneAgent): Lane | null {
  if (agent.attentionReason === "permission") return "needsYou";
  if (agent.status === "running" || agent.status === "initializing") return "running";
  if (agent.requiresAttention) return "review";
  return null;
}

/** The board links an agent through a card's latest run. */
export function linkedAgentIds(cards: readonly { runs: readonly { agentId: string }[] }[]): Set<string> {
  const ids = new Set<string>();
  for (const card of cards) {
    const run = card.runs[card.runs.length - 1];
    if (run) ids.add(run.agentId);
  }
  return ids;
}

export function laneCounts(
  cards: readonly { runs: readonly { agentId: string }[] }[],
  agents: ReadonlyMap<string, LaneAgent>,
): Record<Lane, number> {
  const counts: Record<Lane, number> = { needsYou: 0, running: 0, review: 0 };
  for (const id of linkedAgentIds(cards)) {
    const agent = agents.get(id);
    if (!agent) continue;
    const lane = laneOf(agent);
    if (lane) counts[lane] += 1;
  }
  return counts;
}

/**
 * A dismissed attention stays hidden until the agent's updatedAt moves past
 * the stamp recorded at dismissal — any later activity makes it reappear.
 */
export function isDismissed(agent: LaneAgent, dismissed: Readonly<Record<string, string>>): boolean {
  const stamp = dismissed[agent.id];
  return stamp !== undefined && stamp === agent.updatedAt;
}
