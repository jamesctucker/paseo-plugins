import { useEffect, useState, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";

/**
 * Live agent directory for the rail, card chips, and the sidebar counts. One
 * module-level subscription shared by every consumer: the sidebar item is
 * always mounted, so the directory stays warm and the board paints live data
 * on the first frame. When the last consumer unmounts, the subscription
 * lingers 30 seconds before releasing, so reopening the board is instant.
 */

export interface PermissionActionLite {
  id: string;
  label: string;
  behavior: "allow" | "deny";
  variant?: string;
}

/** Structural slice of the protocol's AgentPermissionRequest; no import. */
export interface PermissionRequestLite {
  id: string;
  kind: string;
  name?: string;
  title?: string;
  actions?: PermissionActionLite[];
}

export interface AgentEntry {
  id: string;
  status: "initializing" | "idle" | "running" | "error" | "closed";
  title: string | null;
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
  pendingPermissions: PermissionRequestLite[];
  updatedAt: string;
  // Carried for linking agents the board didn't start: a run needs the
  // workspace, and subagents are filtered out of link offers.
  workspaceId: string | null;
  createdAt: string;
  parentAgentId: string | null;
}

interface DirectoryAgent {
  id: string;
  status: AgentEntry["status"];
  title?: string | null;
  requiresAttention?: boolean;
  attentionReason?: AgentEntry["attentionReason"];
  pendingPermissions?: PermissionRequestLite[];
  updatedAt: string;
  archivedAt?: string | null;
  workspaceId?: string | null;
  createdAt?: string;
  parentAgentId?: string | null;
  labels?: Record<string, string>;
}

interface DirectoryState {
  agents: Map<string, AgentEntry>;
  offline: boolean;
}

const EMPTY: DirectoryState = { agents: new Map(), offline: false };

const store: {
  paseo: unknown;
  state: DirectoryState;
  listeners: Set<() => void>;
  refcount: number;
  release: (() => void) | null;
  linger: ReturnType<typeof setTimeout> | null;
} = {
  paseo: null,
  state: EMPTY,
  listeners: new Set(),
  refcount: 0,
  release: null,
  linger: null,
};

function emit() {
  for (const listener of store.listeners) listener();
}

function toEntry(agent: DirectoryAgent): AgentEntry {
  return {
    id: agent.id,
    status: agent.status,
    title: agent.title ?? null,
    requiresAttention: agent.requiresAttention ?? false,
    attentionReason: agent.attentionReason ?? null,
    pendingPermissions: agent.pendingPermissions ?? [],
    updatedAt: agent.updatedAt,
    workspaceId: agent.workspaceId ?? null,
    createdAt: agent.createdAt ?? agent.updatedAt,
    // Subagents may carry their parent only as a label.
    parentAgentId: agent.parentAgentId ?? agent.labels?.["paseo.parent-agent-id"] ?? null,
  };
}

function upsert(agent: DirectoryAgent) {
  const next = new Map(store.state.agents);
  if (agent.archivedAt) next.delete(agent.id);
  else next.set(agent.id, toEntry(agent));
  store.state = { ...store.state, agents: next };
  emit();
}

function open(paseo: any) {
  store.paseo = paseo;
  let release: (() => void) | null = null;
  let stopped = false;

  store.state = { ...store.state, offline: false };
  paseo.agents
    .list({ subscribe: {} })
    .then(({ subscription }: any) => {
      if (stopped) {
        void subscription.release();
        return;
      }
      release = () => void subscription.release();
      subscription.subscribe({
        snapshot: ({ entries }: any) => {
          const next = new Map<string, AgentEntry>();
          for (const { agent } of entries) {
            if (agent.archivedAt) continue;
            next.set(agent.id, toEntry(agent));
          }
          store.state = { agents: next, offline: false };
          emit();
        },
        update: (message: any) => {
          if (message.type !== "agent_update") return;
          const update = message.payload as
            | { kind: "upsert"; agent: DirectoryAgent }
            | { kind?: string; agentId?: string };
          if (update.kind === "upsert" && "agent" in update) upsert(update.agent);
          else if ("agentId" in update && update.agentId) {
            const next = new Map(store.state.agents);
            next.delete(update.agentId as string);
            store.state = { ...store.state, agents: next };
            emit();
          }
        },
        error: () => {
          store.state = { ...store.state, offline: true };
          emit();
        },
      });
    })
    .catch(() => {
      if (!stopped) {
        store.state = { ...store.state, offline: true };
        emit();
      }
    });

  store.release = () => {
    stopped = true;
    release?.();
  };
}

function teardown() {
  store.release?.();
  store.release = null;
  store.paseo = null;
}

function acquire(paseo: unknown): () => void {
  if (store.linger) {
    clearTimeout(store.linger);
    store.linger = null;
  }
  if (store.paseo !== paseo) {
    teardown();
    open(paseo);
  }
  store.refcount += 1;
  return () => {
    store.refcount -= 1;
    if (store.refcount > 0) return;
    // Keep the last snapshot for instant repaints; only the live feed ends.
    store.linger = setTimeout(teardown, 30_000);
  };
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function useAgentDirectory(): {
  agents: Map<string, AgentEntry>;
  offline: boolean;
} {
  const paseo = usePaseo();
  useEffect(() => acquire(paseo), [paseo]);
  return useSyncExternalStore(subscribe, () => store.state);
}

/**
 * Workspace id → title, for matching agents whose workspace (not the agent)
 * names a card. Refetches whenever an agent shows up in a workspace this map
 * hasn't seen, which covers new workspaces without a second live feed.
 */
export function useWorkspaceTitles(agents: ReadonlyMap<string, AgentEntry>): ReadonlyMap<string, string> {
  const paseo = usePaseo();
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
  const unseen = [...agents.values()].some((agent) => agent.workspaceId && !titles.has(agent.workspaceId));
  useEffect(() => {
    if (!unseen) return;
    let cancelled = false;
    paseo.workspaces
      .list()
      .then(({ entries }) => {
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const workspace of entries) next.set(workspace.id, workspace.title ?? workspace.name);
        // Agents whose workspace is gone would refetch forever; pin them to "".
        for (const agent of agents.values()) {
          if (agent.workspaceId && !next.has(agent.workspaceId)) next.set(agent.workspaceId, "");
        }
        setTitles(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // agents is read at resolve time; unseen is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paseo, unseen]);
  return titles;
}

/** Re-render on an interval so elapsed labels tick without manual refresh. */
export function useTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
