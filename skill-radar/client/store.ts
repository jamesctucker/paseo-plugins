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
  workspaceId: string | null;
  updatedAt: number;
}

export interface RadarSnapshot {
  states: Record<string, AgentRadarState>;
  bannerDismissed: boolean;
}

const EMPTY: AgentRadarState = { status: "idle", matches: [], reason: null, workspaceId: null, updatedAt: 0 };

let states = new Map<string, AgentRadarState>();
let bannerDismissed = false;
let snapshot: RadarSnapshot = build();
const listeners = new Set<() => void>();

function build(): RadarSnapshot {
  return {
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

export function patchAgentState(agentId: string, patch: Partial<AgentRadarState>, workspaceId?: string) {
  const current = states.get(agentId) ?? EMPTY;
  states.set(agentId, {
    ...current,
    ...patch,
    workspaceId: workspaceId ?? current.workspaceId,
    updatedAt: Date.now(),
  });
  emit();
}

export function dismissBanner() {
  if (bannerDismissed) return;
  bannerDismissed = true;
  emit();
}

/**
 * The Explorer panel is workspace-scoped, so it follows the most recently active agent in
 * that workspace rather than whichever agent happened to classify last anywhere.
 */
export function stateForWorkspace(snapshot: RadarSnapshot, workspaceId: string): AgentRadarState | null {
  let best: AgentRadarState | null = null;
  for (const state of Object.values(snapshot.states)) {
    if (state.workspaceId !== workspaceId) continue;
    if (!best || state.updatedAt > best.updatedAt) best = state;
  }
  return best;
}

export function forgetAgent(agentId: string) {
  if (!states.delete(agentId)) return;
  emit();
}

export function resetRadar() {
  states = new Map();
  bannerDismissed = false;
  emit();
}
