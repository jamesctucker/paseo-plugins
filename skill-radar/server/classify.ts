import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { MAX_SUGGESTIONS } from "../shared/contracts";
import { scanSkills, type SkillCatalog } from "./skills";

type Match = { name: string; confidence: number };
type Classification = {
  status: "ok" | "unavailable";
  reason: string | null;
  matches: Match[];
  classifiedAt: number;
};

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
/**
 * Verified 2026-10-19: this id IS the canonical slug (no dated variant exists), and the
 * panel/pill thresholds were probed against PrimeIntellect's serving. Other providers
 * quantize differently and can shift probabilities, so the provider is pinned too —
 * re-probe thresholds before changing either.
 */
const DEFAULT_MODEL = "cloudflare/clef-flash";
const PROVIDER_PREFERENCE = { order: ["primeintellect"], allow_fallbacks: false };
const REQUEST_TIMEOUT_MS = 9_000;
const RESULT_CACHE_MS = 60_000;
const NO_MATCH = "none";
const DESCRIPTION_CHARS = 180;
/**
 * Clef is served on Workers AI, which truncates long text state, so oversized pastes
 * (log dumps, file contents) must be cut here before they silently eat the catalog field.
 */
const MAX_MESSAGE_CHARS = 2_000;
const MAX_CONVERSATION_CHARS = 10_000;
const TRUNCATION_MARKER = "\n…[truncated]…\n";

class UnavailableError extends Error {}

const resultCache = new Map<string, { result: Classification; at: number }>();
/** Concurrent identical requests share one upstream call instead of double-billing it. */
const inFlight = new Map<string, Promise<Classification>>();

function modelName(): string {
  return process.env.SKILL_RADAR_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * The brief names OPENROUTER_API_KEY. OpenCode's own auth store is the fallback so the plugin
 * works on a machine that already pays for OpenRouter through OpenCode without a second key.
 */
async function apiKey(): Promise<string | null> {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = await readFile(path.join(homedir(), ".local", "share", "opencode", "auth.json"), "utf8");
    // `opencode auth login` stores either an API key ({type:"api",key}) or OAuth tokens
    // ({type:"oauth",access,refresh}); both work as Bearer credentials for OpenRouter.
    const entry = (JSON.parse(raw) as { openrouter?: { key?: unknown; access?: unknown } }).openrouter;
    const token = typeof entry?.key === "string" ? entry.key : typeof entry?.access === "string" ? entry.access : null;
    return token?.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function catalogFingerprint(catalog: SkillCatalog): string {
  return createHash("sha256")
    .update(catalog.skills.map((skill) => `${skill.name}:${skill.description}`).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

function buildCriteria(catalog: SkillCatalog): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const skill of catalog.skills) {
    const description = skill.description.replace(/\s+/g, " ").trim();
    criteria[skill.name] =
      description.length > DESCRIPTION_CHARS ? `${description.slice(0, DESCRIPTION_CHARS - 1)}…` : description;
  }
  criteria[NO_MATCH] = "No skill in the catalog meaningfully helps with the current work.";
  return criteria;
}

/**
 * Middle-truncate so a giant paste keeps its opening intent and closing question —
 * the tail is where the current ask usually lives.
 */
function truncateMiddle(message: string): string {
  if (message.length <= MAX_MESSAGE_CHARS) return message;
  return `${message.slice(0, 1200)}${TRUNCATION_MARKER}${message.slice(-700)}`;
}

/** The newest messages carry the signal, so the oldest drop first when the budget is tight. */
function fitConversation(messages: string[]): string[] {
  const kept: string[] = [];
  let total = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (kept.length > 0 && total + message.length > MAX_CONVERSATION_CHARS) break;
    kept.unshift(message);
    total += message.length;
  }
  return kept;
}

export async function classify(messages: string[]): Promise<Classification> {
  const catalog = await scanSkills();
  const cleaned = fitConversation(messages.map((message) => truncateMiddle(message.trim())).filter(Boolean));
  if (cleaned.length === 0 || catalog.skills.length === 0) {
    return { status: "ok", reason: null, matches: [], classifiedAt: Date.now() };
  }

  // The model belongs in the key: probabilities are not portable across models.
  const key = createHash("sha256")
    .update(`${modelName()} ${catalogFingerprint(catalog)} ${JSON.stringify(cleaned)}`)
    .digest("hex")
    .slice(0, 24);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < RESULT_CACHE_MS) return cached.result;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = runClassification(key, cleaned, catalog);
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

async function runClassification(key: string, messages: string[], catalog: SkillCatalog): Promise<Classification> {
  try {
    const result: Classification = {
      status: "ok",
      reason: null,
      matches: await requestClassification(messages, catalog),
      classifiedAt: Date.now(),
    };
    resultCache.set(key, { result, at: Date.now() });
    if (resultCache.size > 100) resultCache.delete(resultCache.keys().next().value as string);
    return result;
  } catch (error) {
    // Failures are deliberately not cached: a transient 5xx or timeout must not replay
    // for a minute while the client has no other retry path for the same messages.
    const reason =
      error instanceof UnavailableError
        ? error.message
        : error instanceof Error && error.name === "AbortError"
          ? "Classification timed out"
          : "Classification failed";
    return { status: "unavailable", reason, matches: [], classifiedAt: Date.now() };
  }
}

type ChoiceAnswer = {
  /** The model's explicit decision; more authoritative than reading the probabilities ourselves. */
  choice: string | null;
  /** Distribution concentration reported by the model, independent of catalog size. */
  confidence: number | null;
  probabilities: Record<string, number>;
};

function parseChoiceAnswer(raw: unknown): ChoiceAnswer {
  if (!raw || typeof raw !== "object") throw new Error("Malformed decision response");
  const answer = (raw as { answers?: Record<string, unknown> }).answers?.skill;
  if (!answer || typeof answer !== "object") throw new Error("Malformed decision response");
  const { choice, confidence, probabilities } = answer as {
    choice?: unknown;
    confidence?: unknown;
    probabilities?: unknown;
  };
  if (!probabilities || typeof probabilities !== "object") throw new Error("Malformed decision response");

  const scores: Record<string, number> = {};
  for (const [name, value] of Object.entries(probabilities)) {
    if (typeof value === "number" && Number.isFinite(value)) scores[name] = value;
  }
  return {
    choice: typeof choice === "string" ? choice : null,
    confidence: typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null,
    probabilities: scores,
  };
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

function rankMatches(answer: ChoiceAnswer, catalog: SkillCatalog): Match[] {
  const known = new Set(catalog.skills.map((skill) => skill.name));
  const byProbability = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);

  let top: string | null =
    answer.choice && (answer.choice === NO_MATCH || known.has(answer.choice)) ? answer.choice : null;
  if (!top) top = byProbability[0]?.[0] ?? null;

  // A none decision vetoes every skill, however strong an individual probability looks.
  if (!top || top === NO_MATCH) return [];

  if (!known.has(top)) {
    // A hallucinated explicit choice falls back to the strongest real option —
    // unless none out-scores it, which is the same veto as an explicit none.
    const bestKnown = byProbability.find(([name]) => known.has(name));
    const noneProbability = answer.probabilities[NO_MATCH] ?? 0;
    if (!bestKnown || bestKnown[1] <= noneProbability) return [];
    top = bestKnown[0];
  }

  // A skill barely ahead of none is a flat-distribution guess, not a match. Probing
  // showed correct picks always clear 2× P(none) while guessy false positives do not.
  const topProbability = answer.probabilities[top] ?? 0;
  if (topProbability <= 2 * (answer.probabilities[NO_MATCH] ?? 0)) return [];

  // Prefer the model's confidence for the top score: raw option probability dilutes
  // as the catalog grows, so it cannot carry the panel/pill thresholds on its own.
  const topScore =
    answer.confidence !== null
      ? clampPercent(Math.round(answer.confidence * 100))
      : clampPercent(Math.round(topProbability * 100));

  const matches: Match[] = [{ name: top, confidence: topScore }];
  for (const [name, probability] of byProbability) {
    if (matches.length >= MAX_SUGGESTIONS) break;
    if (name === top || name === NO_MATCH || !known.has(name)) continue;
    const confidence = clampPercent(Math.round(probability * 100));
    if (confidence <= 0) continue;
    matches.push({ name, confidence });
  }
  return matches;
}

async function requestClassification(messages: string[], catalog: SkillCatalog): Promise<Match[]> {
  const key = await apiKey();
  if (!key) {
    throw new UnavailableError("Set OPENROUTER_API_KEY on the daemon or sign in to OpenRouter in OpenCode");
  }

  const conversation = messages.map((message, index) => `[${index + 1}] ${message}`).join("\n\n");
  const body = {
    model: modelName(),
    provider: PROVIDER_PREFERENCE,
    state: {
      conversation,
      catalog: catalog.skills
        .map((skill) => `${skill.name}: ${skill.description.replace(/\s+/g, " ").slice(0, DESCRIPTION_CHARS)}`)
        .join("\n"),
    },
    questions: {
      skill: {
        type: "choice",
        instructions:
          "Which catalog skill would most help the user in this coding session right now? Choose none when nothing clearly applies.",
        criteria: buildCriteria(catalog),
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://paseo.sh",
        "X-Title": "Skill Radar",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 160);
      throw new UnavailableError(`OpenRouter returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    return rankMatches(parseChoiceAnswer(await response.json()), catalog);
  } finally {
    clearTimeout(timeout);
  }
}
