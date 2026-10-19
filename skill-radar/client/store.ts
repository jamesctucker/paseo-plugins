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
  /** Agent display names, keyed by agent ID. Titles can change while a watcher lives. */
  labels: Record<string, string>;
  bannerDismissed: boolean;
}

const EMPTY: AgentRadarState = { status: "idle", matches: [], reason: null, workspaceId: null, updatedAt: 0 };

let states = new Map<string, AgentRadarState>();
let labels = new Map<string, string>();
let bannerDismissed = false;
let snapshot: RadarSnapshot = build();
const listeners = new Set<() => void>();

function build(): RadarSnapshot {
  return {
    states: Object.fromEntries(states),
    labels: Object.fromEntries(labels),
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

export function setAgentLabel(agentId: string, title: string) {
  if (labels.get(agentId) === title) return;
  labels.set(agentId, title);
  emit();
}

export function forgetAgent(agentId: string) {
  const hadState = states.delete(agentId);
  const hadLabel = labels.delete(agentId);
  if (hadState || hadLabel) emit();
}

export function resetRadar() {
  states = new Map();
  labels = new Map();
  bannerDismissed = false;
  emit();
}
