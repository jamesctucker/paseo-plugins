import { useEffect, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import type { PullRequestLike } from "../shared/pr-signal";

/**
 * Live workspace runtimes for PR signal: one shared subscription to the
 * workspace directory, mirroring agent-directory's pattern (refcounted, with
 * a 30-second linger so reopening the board stays instant). Only the fields
 * the CI chips need are kept — the descriptor is far wider.
 *
 * Older daemons answer the list without a subscription; that path degrades to
 * a one-shot read, which means chips freeze until the next mount rather than
 * breaking.
 */

export interface WorkspaceRuntime {
  id: string;
  pullRequest: PullRequestLike | null;
}

interface DirectoryState {
  runtimes: Map<string, WorkspaceRuntime>;
  offline: boolean;
}

const EMPTY: DirectoryState = { runtimes: new Map(), offline: false };

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

function toRuntime(workspace: any): WorkspaceRuntime {
  return {
    id: workspace.id,
    // A legacy or slimmed descriptor simply carries no forge data.
    pullRequest: workspace.githubRuntime?.pullRequest ?? null,
  };
}

function open(paseo: any) {
  store.paseo = paseo;
  let release: (() => void) | null = null;
  let stopped = false;

  store.state = { ...store.state, offline: false };
  paseo.workspaces
    .list({ subscribe: {} })
    .then(({ entries, subscription }: any) => {
      const seed = new Map<string, WorkspaceRuntime>();
      for (const workspace of entries ?? []) seed.set(workspace.id, toRuntime(workspace));
      store.state = { runtimes: seed, offline: false };
      emit();
      if (!subscription) return; // one-shot fallback: no live updates
      if (stopped) {
        void subscription.release();
        return;
      }
      release = () => void subscription.release();
      subscription.subscribe({
        snapshot: ({ entries }: any) => {
          const next = new Map<string, WorkspaceRuntime>();
          for (const workspace of entries ?? []) next.set(workspace.id, toRuntime(workspace));
          store.state = { runtimes: next, offline: false };
          emit();
        },
        update: (message: any) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          const next = new Map(store.state.runtimes);
          if (update.kind === "upsert" && update.workspace) next.set(update.workspace.id, toRuntime(update.workspace));
          else if (update.id) next.delete(update.id);
          else if (update.workspaceId) next.delete(update.workspaceId);
          store.state = { ...store.state, runtimes: next };
          emit();
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
    store.linger = setTimeout(teardown, 30_000);
  };
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/**
 * Workspace id → runtime for the ids the caller cares about. The directory is
 * small (one entry per workspace), so the subscription stays whole and the
 * caller picks what it needs.
 */
export function useWorkspaceRuntimes(): ReadonlyMap<string, WorkspaceRuntime> {
  const paseo = usePaseo();
  useEffect(() => acquire(paseo), [paseo]);
  return useSyncExternalStore(subscribe, () => store.state.runtimes);
}
