/**
 * The board's one vocabulary for agent state. Raw enums ("running,
 * permission") are machine dumps; every surface that names an agent's state
 * goes through here so card rows, rail rows, and run history agree. Lives in
 * shared/ (not client/ui) so it stays unit-testable without the React Native
 * runtime.
 */

export interface AgentStateLike {
  status: string;
  attentionReason: string | null;
}

export function agentLabel(agent: AgentStateLike): string {
  if (agent.attentionReason === "permission") return "Needs you";
  if (agent.attentionReason === "error") return "Errored";
  if (agent.attentionReason) return "Finished";
  if (agent.status === "running" || agent.status === "initializing") return "Running";
  if (agent.status === "closed") return "Agent closed";
  return agent.status;
}
