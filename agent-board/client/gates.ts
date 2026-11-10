import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useHosts, useRpc } from "@getpaseo/plugin/client";
import {
  githubReviewGatesRpc,
  jiraStatusesRpc,
  linearChainRpc,
  linearStatusesRpc,
} from "../shared/contracts";
import {
  chainCandidateKeys,
  computeGates,
  gateTrackerKeys,
  type ChainInfo,
  type FreshStatus,
  type Gate,
  type PrGateRef,
} from "../shared/gates";
import type { BoardDoc } from "./board-doc";

/**
 * Gate data fetching, module-cached and shared by the board screen, the card
 * detail screen, and the always-mounted sidebar item. Fetch results live at
 * module scope with a TTL so three consumers cost one recompute, and every
 * consumer re-renders when results land (listener set — the fetch starter is
 * not always the screen that needs the paint). The written inputs (cards,
 * manual gates, opt-outs) always come from the live board doc, never the
 * cache. Channels that are unconfigured or unreachable are skipped silently —
 * gates are an ambient surface; the settings sheet is where config errors
 * speak.
 */

const TTL = 2 * 60 * 1000;

interface GateData {
  freshStatuses: Record<string, FreshStatus>;
  chains: ChainInfo[];
  reviewRequested: PrGateRef[];
  changesRequested: PrGateRef[];
  fetchedAt: number;
}

const EMPTY: GateData = {
  freshStatuses: {},
  chains: [],
  reviewRequested: [],
  changesRequested: [],
  fetchedAt: 0,
};

let cache: GateData = EMPTY;
let inFlight: Promise<void> | null = null;
let lastSignature = "";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Force the next effect pass to refetch, even with an unchanged signature. */
function invalidate() {
  lastSignature = "";
  cache = { ...cache, fetchedAt: 0 };
  emit();
}

export interface Gates {
  gates: Gate[];
  /** The chain a Linear issue key belongs to, when read. */
  chainForKey(key: string): ChainInfo | null;
  /** Force a recompute (manual refresh, post-archive). */
  refresh(): void;
}

export function useGates(board: BoardDoc): Gates {
  const jiraStatuses = useRpc(jiraStatusesRpc);
  const linearStatuses = useRpc(linearStatusesRpc);
  const linearChain = useRpc(linearChainRpc);
  const reviewGates = useRpc(githubReviewGatesRpc);
  const [version, setVersion] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Event-driven revalidation (Workboard borrow): the 2-minute TTL alone lets
  // a gate you cleared elsewhere keep nagging after you come back. Foregrounding
  // the app and the host returning online both force a fresh read; the TTL
  // still covers ordinary staleness between those checkpoints.
  useEffect(() => {
    const subscription = AppState?.addEventListener?.("change", (state) => {
      if (state === "active") invalidate();
    });
    return () => subscription?.remove?.();
  }, []);

  const hostOnline = useHosts().some((host) => host.status === "online");
  const wasOnline = useRef(hostOnline);
  useEffect(() => {
    const reconnected = hostOnline && !wasOnline.current;
    wasOnline.current = hostOnline;
    if (reconnected) invalidate();
  }, [hostOnline]);

  const cards = board.values.cards;
  const trackerKeys = useMemo(() => gateTrackerKeys(cards), [cards]);
  const chainKeys = useMemo(() => chainCandidateKeys(cards), [cards]);
  const signature = `${[...trackerKeys.jira].sort().join(",")}|${[...trackerKeys.linear].sort().join(",")}|${[...chainKeys].sort().join(",")}|${nonce}`;

  useEffect(() => {
    const stale = Date.now() - cache.fetchedAt > TTL;
    if (!stale && signature === lastSignature) return;
    if (inFlight) return;
    lastSignature = signature;
    inFlight = (async () => {
      const next: GateData = { ...EMPTY, fetchedAt: Date.now() };
      const jobs: Promise<void>[] = [];
      if (trackerKeys.jira.length > 0) {
        jobs.push(
          jiraStatuses({ keys: trackerKeys.jira })
            .then(({ statuses }) => {
              for (const [key, value] of Object.entries(statuses)) next.freshStatuses[`jira:${key}`] = value;
            })
            .catch(() => {}),
        );
      }
      if (trackerKeys.linear.length > 0) {
        jobs.push(
          linearStatuses({ keys: trackerKeys.linear })
            .then(({ statuses }) => {
              for (const [key, value] of Object.entries(statuses)) next.freshStatuses[`linear:${key}`] = value;
            })
            .catch(() => {}),
        );
      }
      // One chain read per distinct Linear key; projects dedupe.
      const projects = new Map<string, ChainInfo>();
      for (const key of chainKeys.slice(0, 10)) {
        jobs.push(
          linearChain({ key })
            .then((chain) => {
              projects.set(chain.projectId, chain);
            })
            .catch(() => {}),
        );
      }
      jobs.push(
        reviewGates({})
          .then((result) => {
            next.reviewRequested = result.reviewRequested;
            next.changesRequested = result.changesRequested;
          })
          .catch(() => {}),
      );
      await Promise.all(jobs);
      next.chains = [...projects.values()];
      cache = next;
      inFlight = null;
      emit();
    })();
    // RPC identities are stable; the key sets ride the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const gates = useMemo(
    () =>
      computeGates({
        cards,
        manualGates: board.values.manualGates,
        clearedDoneNags: board.values.clearedDoneNags,
        freshStatuses: cache.freshStatuses,
        chains: cache.chains,
        reviewRequested: cache.reviewRequested,
        changesRequested: cache.changesRequested,
      }),
    // version tracks cache refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, board.values.manualGates, board.values.clearedDoneNags, version],
  );

  return useMemo(
    () => ({
      gates,
      chainForKey(key: string): ChainInfo | null {
        const upper = key.toUpperCase();
        return cache.chains.find((chain) => chain.issues.some((issue) => issue.key === upper)) ?? null;
      },
      refresh() {
        invalidate();
        setNonce((n) => n + 1);
      },
    }),
    [gates],
  );
}
