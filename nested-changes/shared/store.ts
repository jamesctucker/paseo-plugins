/**
 * Client-side store shared between the Explorer list panel, the main-tab diff
 * viewer panel, and the client entrypoint (which owns openPanel). All parts live
 * in the same plugin client bundle, so module state is shared. Pure TS only —
 * shared modules must not import React Native or Node APIs.
 */

export interface DiffSelection {
  repoPath: string;
  repoRelPath: string;
  filePath: string;
  untracked: boolean;
}

type Opener = (workspaceId: string) => void;
type Listener = () => void;

const selections = new Map<string, DiffSelection>();
const listeners = new Set<Listener>();
let opener: Opener | null = null;

function emit() {
  for (const listener of listeners) listener();
}

/** Registered by the client entrypoint so list clicks can open a main tab. */
export function setDiffTabOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function selectDiffFile(workspaceId: string, selection: DiffSelection): void {
  selections.set(workspaceId, selection);
  emit();
  opener?.(workspaceId);
}

export function getDiffSelection(workspaceId: string): DiffSelection | null {
  return selections.get(workspaceId) ?? null;
}

export function subscribeDiffSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
