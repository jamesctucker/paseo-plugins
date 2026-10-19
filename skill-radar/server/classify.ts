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
const DEFAULT_MODEL = "cloudflare/clef-flash";
const REQUEST_TIMEOUT_MS = 9_000;
const RESULT_CACHE_MS = 60_000;
const NO_MATCH = "none";
const DESCRIPTION_CHARS = 180;

class UnavailableError extends Error {}

const resultCache = new Map<string, { result: Classification; at: number }>();

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
    const stored = (JSON.parse(raw) as { openrouter?: { key?: unknown } }).openrouter?.key;
    return typeof stored === "string" && stored.trim() ? stored.trim() : null;
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

export async function classify(messages: string[]): Promise<Classification> {
  const catalog = await scanSkills();
  const cleaned = messages.map((message) => message.trim()).filter(Boolean);
  if (cleaned.length === 0 || catalog.skills.length === 0) {
    return { status: "ok", reason: null, matches: [], classifiedAt: Date.now() };
  }

  const key = createHash("sha256")
    .update(`${catalogFingerprint(catalog)}\u0000${cleaned.join("\u0000")}`)
    .digest("hex")
    .slice(0, 24);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < RESULT_CACHE_MS) return cached.result;

  let result: Classification;
  try {
    result = {
      status: "ok",
      reason: null,
      matches: await requestClassification(cleaned, catalog),
      classifiedAt: Date.now(),
    };
  } catch (error) {
    const reason =
      error instanceof UnavailableError
        ? error.message
        : error instanceof Error && error.name === "AbortError"
          ? "Classification timed out"
          : "Classification failed";
    result = { status: "unavailable", reason, matches: [], classifiedAt: Date.now() };
  }

  resultCache.set(key, { result, at: Date.now() });
  if (resultCache.size > 100) resultCache.delete(resultCache.keys().next().value as string);
  return result;
}

function parseProbabilities(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") throw new Error("Malformed decision response");
  const answers = raw as { answers?: Record<string, { probabilities?: Record<string, unknown> }> };
  const probabilities = answers.answers?.skill?.probabilities;
  if (!probabilities || typeof probabilities !== "object") throw new Error("Malformed decision response");

  const scores: Record<string, number> = {};
  for (const [name, value] of Object.entries(probabilities)) {
    if (typeof value === "number" && Number.isFinite(value)) scores[name] = value;
  }
  return scores;
}

async function requestClassification(messages: string[], catalog: SkillCatalog): Promise<Match[]> {
  const key = await apiKey();
  if (!key) {
    throw new UnavailableError("Set OPENROUTER_API_KEY on the daemon or sign in to OpenRouter in OpenCode");
  }

  const conversation = messages.map((message, index) => `[${index + 1}] ${message}`).join("\n\n");
  const body = {
    model: modelName(),
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

    const probabilities = parseProbabilities(await response.json());
    return Object.entries(probabilities)
      .filter(([name]) => name !== NO_MATCH && catalog.skills.some((skill) => skill.name === name))
      .map(([name, probability]) => ({
        name,
        confidence: Math.max(0, Math.min(100, Math.round(probability * 100))),
      }))
      .filter((match) => match.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SUGGESTIONS);
  } finally {
    clearTimeout(timeout);
  }
}
