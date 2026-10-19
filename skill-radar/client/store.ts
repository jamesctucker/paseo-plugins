import { useSyncExternalStore } from "react";

export type RadarStatus = "idle" | "analyzing" | "ready" | "unavailable";

export interface RadarMatch {
  name: string;
  confidence: number;
}

export interface AgentRadarState {
  status: RadarStatus;
  matches: RadarMatch[];
  reason: string | null;
  updatedAt: number;
}

export interface RadarSnapshot {
  /** The agent whose conversation drove the latest classification. */
  activeAgentId: string | null;
  states: Record<string, AgentRadarState>;
  bannerDismissed: boolean;
}

const EMPTY: AgentRadarState = { status: "idle", matches: [], reason: null, updatedAt: 0 };

let states = new Map<string, AgentRadarState>();
let activeAgentId: string | null = null;
let bannerDismissed = false;
let snapshot: RadarSnapshot = build();
const listeners = new Set<() => void>();

function build(): RadarSnapshot {
  return {
    activeAgentId,
    states: Object.fromEntries(states),
    bannerDismissed,
  };
}

function emit() {
  snapshot = build();
  for (const listener of listeners) listener();
}

export function getRadarSnapshot(): RadarSnapshot {
  return snapshot;
}

export function subscribeToRadar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRadar(): RadarSnapshot {
  return useSyncExternalStore(subscribeToRadar, getRadarSnapshot, getRadarSnapshot);
}

export function agentRadarState(id: string | null): AgentRadarState {
  if (!id) return EMPTY;
  return states.get(id) ?? EMPTY;
}

export function setAgentState(agentId: string, next: AgentRadarState) {
  states.set(agentId, next);
  emit();
}

export function patchAgentState(agentId: string, patch: Partial<AgentRadarState>) {
  const current = states.get(agentId) ?? EMPTY;
  states.set(agentId, { ...current, ...patch, updatedAt: Date.now() });
  emit();
}

export function setActiveAgent(agentId: string) {
  if (activeAgentId === agentId) return;
  activeAgentId = agentId;
  emit();
}

export function dismissBanner() {
  if (bannerDismissed) return;
  bannerDismissed = true;
  emit();
}

export function forgetAgent(agentId: string) {
  if (!states.delete(agentId)) return;
  if (activeAgentId === agentId) {
    activeAgentId = null;
  }
  emit();
}

export function resetRadar() {
  states = new Map();
  activeAgentId = null;
  bannerDismissed = false;
  emit();
}
