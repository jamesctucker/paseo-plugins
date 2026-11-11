import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { DEFAULT_SPAWN_SPEC, WORK_SPAWN_SPEC } from "./provider";

/**
 * Board persistence lives in host-scoped settings documents: daemon-side JSON
 * that survives restarts and reloads, so the board owns its data without a
 * private database. Two documents: the board itself, and the Jira/token config
 * the settings screen edits.
 */

export const CardRunSchema = z.object({
  agentId: z.string(),
  workspaceId: z.string(),
  startedAt: z.string(),
});

export const BoardCardSchema = z.object({
  id: z.string(),
  source: z.enum(["jira", "prompt", "github", "linear"]),
  title: z.string(),
  body: z.string().default(""),
  // Tracker-generic fields with legacy jira names: Linear cards reuse them
  // (key ENG-123, issue URL, read-only mirrored status).
  jiraKey: z.string().optional(),
  jiraUrl: z.url().optional(),
  jiraStatus: z.string().optional(),
  /**
   * The parent issue's (or PR's) own title, denormalized at creation so the
   * group header survives the whole-issue task being archived. A card's
   * `title` is its task title; `issueTitle` is what tasks group under.
   */
  issueTitle: z.string().optional(),
  /**
   * The Linear `Route:` line, denormalized at creation. Absent = unrouted,
   * which the spawn flow treats as creative (ties-go-creative doctrine).
   * Linear-only; Jira has no route convention.
   */
  route: z.enum(["rote", "creative"]).optional(),
  github: z
    .object({
      repo: z.string(),
      number: z.number().int().positive(),
    })
    .optional(),
  day: z.string(),
  createdAt: z.string(),
  archivedAt: z.string().nullable().default(null),
  runs: z.array(CardRunSchema).default([]),
});

export const boardDoc = defineSettings({
  id: "board",
  scope: "host",
  version: 7,
  schema: z.object({
    cards: z.array(BoardCardSchema).default([]),
    /** Day the migration prompt was last answered, so it asks once per day. */
    migrationAnsweredDay: z.string().default(""),
    /**
     * Issue-keyed memos (see shared/notes.ts): the note belongs to the issue
     * or PR, not the ephemeral card, so it returns when the issue returns.
     * Prompt cards key on their card id and die with the card.
     */
    cardNotes: z.record(z.string(), z.object({ text: z.string(), updatedAt: z.string() })).default({}),
    /**
     * Board-local review dismissals: agentId → the agent's updatedAt stamp
     * when dismissed. The SDK exposes no silent clear-attention, so the board
     * hides that attention state; a later update makes the row reappear.
     */
    dismissedAttention: z.record(z.string(), z.string()).default({}),
    /**
     * Hand-written "Waiting on you" items (quick-add `! text`) for gates no
     * machine can detect — probes to run, grants to give, conversations owed.
     * They persist until James checks them off; everything else on the
     * surface is derived and self-clears.
     */
    manualGates: z.record(z.string(), z.object({ text: z.string(), createdAt: z.string() })).default({}),
    /** Done-nag opt-outs: tracker key → cleared-at stamp. Rare by design. */
    clearedDoneNags: z.record(z.string(), z.string()).default({}),
    /** Declined link offers: `cardId:agentId` → declined-at stamp. */
    declinedLinks: z.record(z.string(), z.string()).default({}),
  }),
  // v2 added dismissedAttention, v3 added the linear card source, v4 added
  // issueTitle, v5 added gates storage + the card route, v6 added
  // declinedLinks, v7 added cardNotes. Additive fields ride
  // schema defaults; the only backfill is v4's issueTitle, since every pre-v4
  // tracker card was a whole-issue task whose title is the issue's.
  migrate: (values, fromVersion) => {
    if (fromVersion >= 6) return values;
    if (fromVersion >= 4) return { ...((values ?? {}) as Record<string, unknown>), manualGates: {}, clearedDoneNags: {} };
    const stored = (values ?? {}) as { cards?: (Record<string, unknown> & { title?: string; issueTitle?: string; jiraKey?: string; github?: unknown })[] };
    return {
      ...stored,
      manualGates: {},
      clearedDoneNags: {},
      cards: (stored.cards ?? []).map((card) =>
        card.issueTitle === undefined && (card.jiraKey || card.github) && card.title
          ? { ...card, issueTitle: card.title }
          : card,
      ),
    };
  },
});

export const linearConfigDoc = defineSettings({
  id: "linear-config",
  scope: "host",
  version: 2,
  schema: z.object({
    /** Personal API key, sent verbatim as the Authorization header. */
    apiKey: z.string().default(""),
    /**
     * Spawn lane for Linear cards (personal lane; amendment decision 8).
     * Falls back to the Jira doc's global spawnProvider when empty.
     */
    spawnProviderLinear: z.string().default(DEFAULT_SPAWN_SPEC),
  }),
  migrate: (values, fromVersion) => {
    if (fromVersion >= 2) return values;
    return { ...(values ?? {}), spawnProviderLinear: DEFAULT_SPAWN_SPEC };
  },
});

export const jiraConfigDoc = defineSettings({
  id: "jira-config",
  scope: "host",
  version: 3,
  schema: z.object({
    /** e.g. `acme` or a full host when self-hosted. */
    domain: z.string().default(""),
    email: z.string().default(""),
    token: z.string().default(""),
    /** Overrides the default assigned-to-me JQL when non-empty. */
    jql: z.string().default(""),
    /**
     * Global spawn-lane fallback (prompt and GitHub cards) in provider/model
     * form. v1 installs stored a bare provider; the migration promotes those
     * to the default spec.
     */
    spawnProvider: z.string().default(DEFAULT_SPAWN_SPEC),
    /** Spawn lane for Jira cards (work lane; amendment decision 8). */
    spawnProviderJira: z.string().default(WORK_SPAWN_SPEC),
  }),
  migrate: (values, fromVersion) => {
    if (fromVersion >= 3) return values;
    const stored = (values ?? {}) as { spawnProvider?: string };
    const spawnProvider = stored.spawnProvider ?? "";
    return {
      ...stored,
      spawnProvider: spawnProvider.includes("/") ? spawnProvider : DEFAULT_SPAWN_SPEC,
      spawnProviderJira: WORK_SPAWN_SPEC,
    };
  },
});

export const githubConfigDoc = defineSettings({
  id: "github-config",
  scope: "host",
  version: 1,
  schema: z.object({
    /** PAT with repo scope; api.github.com only, kept daemon-side. */
    token: z.string().default(""),
  }),
});

/**
 * Status category, not `resolution`: work is often moved to Done without a
 * resolution being set, and those issues then sat at the top of the picker
 * (sorted by `updated`) as unpickable archive rows.
 */
export const DEFAULT_ASSIGNED_JQL =
  "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

export interface BoardCard extends z.infer<typeof BoardCardSchema> {}
export interface CardRun extends z.infer<typeof CardRunSchema> {}
export interface JiraConfig extends z.infer<typeof jiraConfigDoc.schema> {}
export interface GitHubConfig extends z.infer<typeof githubConfigDoc.schema> {}
export interface LinearConfig extends z.infer<typeof linearConfigDoc.schema> {}
export interface BoardValues extends z.infer<typeof boardDoc.schema> {}

export function newCardId(): string {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}