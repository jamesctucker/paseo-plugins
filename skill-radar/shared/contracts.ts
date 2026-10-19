import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const skillEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  trigger: z.string().nullable(),
  category: z.string(),
  origin: z.enum(["workspace", "global"]),
  /** Invoked by the agent without the user reaching for it, so copying the name is redundant. */
  auto: z.boolean(),
});

export const listSkills = defineRpc({
  name: "skills.list",
  input: z.object({ refresh: z.boolean().optional() }).default({}),
  output: z.object({
    skills: z.array(skillEntrySchema),
    scannedAt: z.number(),
    roots: z.array(z.string()),
    missingRoots: z.array(z.string()),
  }),
});

export const classifyContext = defineRpc({
  name: "skills.classify",
  input: z.object({ messages: z.array(z.string()).max(12) }),
  output: z.object({
    status: z.enum(["ok", "unavailable"]),
    reason: z.string().nullable(),
    matches: z.array(
      z.object({
        name: z.string(),
        confidence: z.number().int().min(0).max(100),
      }),
    ),
    classifiedAt: z.number(),
  }),
});

/** A panel row is shown at or above this confidence. */
export const PANEL_THRESHOLD = 50;
/**
 * The composer pill is stricter than the panel so it only interrupts for a clear match.
 * Probed against clef-flash on PrimeIntellect (2026-10-19): adversarial false positives
 * reached 68.8 while correct picks jumped from 70.8 to 81.5, so 72 sits in the gap.
 */
export const PILL_THRESHOLD = 72;
export const MAX_SUGGESTIONS = 5;
export const CONTEXT_MESSAGES = 5;
/** Wait for the conversation to settle before spending a classification call. */
export const CLASSIFY_DEBOUNCE_MS = 5_000;
/** A pill outlives the classification that created it, but not indefinitely. */
export const PILL_TTL_MS = 30_000;
