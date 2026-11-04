import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { DEFAULT_SPAWN_SPEC } from "./provider";

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
  source: z.enum(["jira", "prompt", "github"]),
  title: z.string(),
  body: z.string().default(""),
  jiraKey: z.string().optional(),
  jiraUrl: z.url().optional(),
  jiraStatus: z.string().optional(),
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
  version: 1,
  schema: z.object({
    cards: z.array(BoardCardSchema).default([]),
    /** Day the migration prompt was last answered, so it asks once per day. */
    migrationAnsweredDay: z.string().default(""),
  }),
});

export const jiraConfigDoc = defineSettings({
  id: "jira-config",
  scope: "host",
  version: 2,
  schema: z.object({
    /** e.g. `acme` or a full host when self-hosted. */
    domain: z.string().default(""),
    email: z.string().default(""),
    token: z.string().default(""),
    /** Overrides the default assigned-to-me JQL when non-empty. */
    jql: z.string().default(""),
    /**
     * Provider used by the spawn loop's agent.create, in `provider/model`
     * form (the SDK rejects a bare provider). v1 installs stored a bare
     * provider; the migration promotes those to the default spec.
     */
    spawnProvider: z.string().default(DEFAULT_SPAWN_SPEC),
  }),
  migrate: (values, fromVersion) => {
    if (fromVersion >= 2) return values;
    const stored = (values ?? {}) as { spawnProvider?: string };
    const spawnProvider = stored.spawnProvider ?? "";
    return { ...stored, spawnProvider: spawnProvider.includes("/") ? spawnProvider : DEFAULT_SPAWN_SPEC };
  },
});

export const DEFAULT_ASSIGNED_JQL =
  "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";

export interface BoardCard extends z.infer<typeof BoardCardSchema> {}
export interface CardRun extends z.infer<typeof CardRunSchema> {}
export interface JiraConfig extends z.infer<typeof jiraConfigDoc.schema> {}
export interface BoardValues extends z.infer<typeof boardDoc.schema> {}

export function newCardId(): string {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}