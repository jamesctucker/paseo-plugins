import type { BoardCard } from "./settings";
import { cardKey } from "./groups";

/**
 * "Waiting on you" gates (brief amendment 2026-11-06): the standing list of
 * things only James can clear — chain stalls, archived-but-not-Done tracker
 * issues, GitHub review asks, and hand-written reminders. Gates are derived,
 * never stored (except manual ones and the Done-nag opt-out list): they
 * self-clear when the underlying tracker state moves, which is the whole
 * point — a staging anchor rots, a gate cannot.
 */

export type Route = "rote" | "creative";

/** Fresh tracker truth for one issue key, fetched at gate-recompute time. */
export interface FreshStatus {
  status: string;
  done: boolean;
}

/** One PR that needs James's review action. */
export interface PrGateRef {
  repo: string;
  number: number;
  title: string;
  url: string;
}

export interface ChainIssue {
  key: string;
  title: string;
  url: string;
  status: string;
  done: boolean;
  /** From the `Route: rote|creative` line in the description; null = unrouted. */
  route: Route | null;
  blockedBy: string[];
}

/** A Linear project, read as a chain (project = chain, amendment decision 2). */
export interface ChainInfo {
  projectId: string;
  projectName: string;
  issues: ChainIssue[];
}

export type Gate =
  | { kind: "chain-yours"; id: string; projectName: string; issueKey: string; issueTitle: string; route: "creative" | "unrouted"; url: string }
  | { kind: "chain-resumable"; id: string; projectName: string; issueKey: string; issueTitle: string; url: string }
  | { kind: "done-nag"; id: string; key: string; title: string; status: string; source: "jira" | "linear" }
  | { kind: "manual"; id: string; text: string }
  | { kind: "review-requested"; id: string; repo: string; number: number; title: string; url: string }
  | { kind: "changes-requested"; id: string; repo: string; number: number; title: string; url: string };

/** The doctrine's Route line: `Route: rote|creative` on a description line. */
export function parseRoute(description: string | null | undefined): Route | null {
  if (!description) return null;
  for (const line of description.split("\n")) {
    const match = /^\s*route\s*:\s*(rote|creative)\s*$/i.exec(line);
    if (match) return match[1].toLowerCase() as Route;
  }
  return null;
}

/**
 * The chain's resume point: the first non-done issue whose blockers are all
 * done, in topological order (identifier number breaks ties — chain issues
 * are numbered sequentially at linearize time). Blockers outside the project
 * count as satisfied: the project is the chain's universe. Null when the
 * chain is finished or every open issue is still blocked (mid-flight — a
 * live-work state, never a gate).
 */
export function nextUp(chain: ChainInfo): ChainIssue | null {
  const doneKeys = new Set(chain.issues.filter((issue) => issue.done).map((issue) => issue.key));
  const open = chain.issues
    .filter((issue) => !issue.done)
    .map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => issue.blockedBy.every((blocker) => !chain.issues.some((i) => i.key === blocker) || doneKeys.has(blocker)));
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const na = issueNumber(a.issue.key);
    const nb = issueNumber(b.issue.key);
    if (na !== nb) return na - nb;
    return a.index - b.index;
  });
  return open[0].issue;
}

function issueNumber(key: string): number {
  const match = /-(\d+)$/.exec(key);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export interface ComputeGatesInput {
  cards: readonly BoardCard[];
  manualGates: Readonly<Record<string, { text: string; createdAt: string }>>;
  /** Done-nag opt-outs: tracker key → cleared-at stamp. */
  clearedDoneNags: Readonly<Record<string, string>>;
  /** Fresh statuses keyed `source:KEY`; missing entries produce no nag. */
  freshStatuses: Readonly<Record<string, FreshStatus>>;
  chains: readonly ChainInfo[];
  reviewRequested: readonly PrGateRef[];
  changesRequested: readonly PrGateRef[];
}

const GATE_ORDER: Record<Gate["kind"], number> = {
  "chain-yours": 0,
  "chain-resumable": 1,
  manual: 2,
  "done-nag": 3,
  "review-requested": 4,
  "changes-requested": 5,
};

export function computeGates(input: ComputeGatesInput): Gate[] {
  const gates: Gate[] = [];

  // A next-up with a live card is already visible as live work (decision 3):
  // gates exist for resume points that are NOT on the board.
  const liveKeys = new Set(
    input.cards.filter((card) => !card.archivedAt).map((card) => cardKey(card)).filter((key) => key !== null),
  );

  for (const chain of input.chains) {
    const next = nextUp(chain);
    if (!next || liveKeys.has(next.key)) continue;
    if (next.route === "rote") {
      gates.push({
        kind: "chain-resumable",
        id: `resumable:${chain.projectId}`,
        projectName: chain.projectName,
        issueKey: next.key,
        issueTitle: next.title,
        url: next.url,
      });
    } else {
      // Unrouted counts as creative — the ties-go-creative doctrine.
      gates.push({
        kind: "chain-yours",
        id: `yours:${chain.projectId}`,
        projectName: chain.projectName,
        issueKey: next.key,
        issueTitle: next.title,
        route: next.route ?? "unrouted",
        url: next.url,
      });
    }
  }

  for (const [id, gate] of Object.entries(input.manualGates)) {
    gates.push({ kind: "manual", id: `manual:${id}`, text: gate.text });
  }

  // One nag per tracker key: the latest archived card carries the title.
  const nagByKey = new Map<string, Extract<Gate, { kind: "done-nag" }>>();
  for (const card of input.cards) {
    if (!card.archivedAt) continue;
    if (card.source !== "jira" && card.source !== "linear") continue;
    const key = card.jiraKey;
    if (!key || input.clearedDoneNags[key] !== undefined) continue;
    const fresh = input.freshStatuses[`${card.source}:${key}`];
    if (!fresh || fresh.done) continue;
    nagByKey.set(key, {
      kind: "done-nag",
      id: `nag:${key}`,
      key,
      title: card.issueTitle ?? card.title,
      status: fresh.status,
      source: card.source,
    });
  }
  gates.push(...nagByKey.values());

  for (const pr of input.reviewRequested) {
    gates.push({ kind: "review-requested", id: `rr:${pr.repo}#${pr.number}`, ...pr });
  }
  for (const pr of input.changesRequested) {
    gates.push({ kind: "changes-requested", id: `cr:${pr.repo}#${pr.number}`, ...pr });
  }

  return gates.sort((a, b) => GATE_ORDER[a.kind] - GATE_ORDER[b.kind]);
}

/**
 * The tracker keys gates care about, per source, for the status refetch.
 * Done-nags derive from archived cards; chains read off live plus recently
 * archived ones (a chain's board presence outlives its last live card).
 */
export function gateTrackerKeys(cards: readonly BoardCard[]): { jira: string[]; linear: string[] } {
  const jira = new Set<string>();
  const linear = new Set<string>();
  for (const card of cards) {
    if (!card.archivedAt || !card.jiraKey) continue;
    if (card.source === "jira") jira.add(card.jiraKey);
    if (card.source === "linear") linear.add(card.jiraKey);
  }
  return { jira: [...jira], linear: [...linear] };
}

/** Linear keys whose chains should be read: live cards + this week's archives. */
export function chainCandidateKeys(cards: readonly BoardCard[], now: number = Date.now()): string[] {
  const keys = new Set<string>();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  for (const card of cards) {
    if (card.source !== "linear" || !card.jiraKey) continue;
    if (!card.archivedAt || Date.parse(card.archivedAt) >= weekAgo) keys.add(card.jiraKey);
  }
  return [...keys];
}

/** The identity a gate row opens when tapped, if any. */
export function gateUrl(gate: Gate): string | null {
  if (gate.kind === "chain-yours" || gate.kind === "chain-resumable") return gate.url;
  if (gate.kind === "review-requested" || gate.kind === "changes-requested") return gate.url;
  return null;
}

// cardKey is re-exported so callers deriving gate inputs from cards import
// one module.
export { cardKey };
