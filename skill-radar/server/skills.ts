import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { z } from "zod";
import type { skillEntrySchema } from "../shared/contracts";

type SkillEntry = z.infer<typeof skillEntrySchema>;

interface SkillRoot {
  directory: string;
  origin: SkillEntry["origin"];
}

export interface SkillCatalog {
  skills: SkillEntry[];
  scannedAt: number;
  roots: string[];
  missingRoots: string[];
}

const CACHE_MS = 60_000;
const CATEGORY_ORDER = [
  "Engineering",
  "Agent",
  "Productivity",
  "Research",
  "Design",
  "UX",
  "Readwise",
  "Global",
  "Skills",
];

let cache: SkillCatalog | null = null;

function garageRoot(): string {
  return process.env.SKILL_RADAR_GARAGE_ROOT?.trim() || path.join(homedir(), "the-garage");
}

function skillRoots(): SkillRoot[] {
  const configured = process.env.SKILL_RADAR_SKILL_ROOTS?.split(":").filter(Boolean);
  if (configured?.length) {
    return configured.map((directory, index) => ({
      directory,
      origin: index === 0 ? "workspace" : "global",
    }));
  }
  return [
    { directory: path.join(garageRoot(), ".opencode", "skills"), origin: "workspace" },
    { directory: path.join(homedir(), ".agents", "skills"), origin: "global" },
  ];
}

async function exists(directory: string): Promise<boolean> {
  try {
    await readdir(directory);
    return true;
  } catch {
    return false;
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

/**
 * Frontmatter is parsed by hand rather than with a YAML dependency: the plugin only needs the
 * handful of scalar keys skill files actually use, and a Git install runs without node_modules.
 */
function parseFrontmatter(raw: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return {};

  const fields: Record<string, string> = {};
  let key: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (key) fields[key] = buffer.join("\n").trim();
    key = null;
    buffer = [];
  };

  for (const line of match[1].split(/\r?\n/)) {
    const start = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (start) {
      flush();
      key = start[1];
      buffer = [start[2]];
      continue;
    }
    if (key) buffer.push(line);
  }
  flush();

  for (const [field, value] of Object.entries(fields)) {
    const folded = value.startsWith(">") || value.startsWith("|");
    fields[field] = unquote(folded ? value.slice(1).trim() : value);
  }
  return fields;
}

function firstTrigger(description: string): string | null {
  const match = /use (?:this skill )?when\s+(.+)/i.exec(description);
  if (!match) return null;

  let trigger = match[1].split(/\.\s|;\s|\.$/)[0].trim();
  if (!trigger) return null;
  if (trigger.length > 80) trigger = `${trigger.slice(0, 77).trimEnd()}…`;
  return trigger;
}

function titleCaseCategory(raw: string): string {
  if (raw.toLowerCase() === "ux") return "UX";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function categoryFor(directory: string, root: string, origin: SkillEntry["origin"]): string {
  if (origin === "global") return "Global";
  const segments = path.relative(root, directory).split(path.sep);
  return segments.length > 1 ? titleCaseCategory(segments[0]) : "Skills";
}

function isAutoInvoked(fields: Record<string, string>): boolean {
  // Opt-in only: a skill declares that the agent reaches for it without the user asking.
  const explicit = fields.auto ?? fields["auto-invoke"] ?? fields["auto-invoked"];
  if (explicit !== undefined) return explicit.trim().toLowerCase() === "true";

  return /\bauto(?:-invoke)?:\s*true\b/i.test(fields.metadata ?? "");
}

async function readSkill(directory: string): Promise<SkillEntry | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(directory, "SKILL.md"), "utf8");
  } catch {
    return null;
  }

  const fields = parseFrontmatter(raw);
  const name = (fields.name ?? path.basename(directory)).trim();
  if (!name) return null;
  const description = (fields.description ?? "").replace(/\s+/g, " ").trim();

  return {
    name,
    description,
    trigger: firstTrigger(description),
    category: "",
    origin: "workspace",
    auto: isAutoInvoked(fields),
  };
}

async function walk(directory: string, root: string, origin: SkillEntry["origin"], depth = 0): Promise<SkillEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const hasManifest = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
  if (hasManifest) {
    const skill = await readSkill(directory);
    return skill ? [{ ...skill, category: categoryFor(directory, root, origin), origin }] : [];
  }
  if (depth >= 2) return [];

  const nested = await Promise.all(
    entries
      .filter(
        (entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()),
      )
      .map((entry) => walk(path.join(directory, entry.name), root, origin, depth + 1)),
  );
  return nested.flat();
}

export async function scanSkills(refresh = false): Promise<SkillCatalog> {
  if (!refresh && cache && Date.now() - cache.scannedAt < CACHE_MS) return cache;

  const roots = skillRoots();
  const missingRoots: string[] = [];
  const found: SkillEntry[] = [];

  for (const root of roots) {
    if (!(await exists(root.directory))) {
      missingRoots.push(root.directory);
      continue;
    }
    found.push(...(await walk(root.directory, root.directory, root.origin)));
  }

  // A workspace skill wins over a global one with the same name.
  const byName = new Map<string, SkillEntry>();
  for (const skill of found) {
    const current = byName.get(skill.name);
    if (!current || (current.origin === "global" && skill.origin === "workspace")) {
      byName.set(skill.name, skill);
    }
  }

  const skills = [...byName.values()].sort((a, b) => {
    const left = CATEGORY_ORDER.indexOf(a.category);
    const right = CATEGORY_ORDER.indexOf(b.category);
    const rank = (left === -1 ? CATEGORY_ORDER.length : left) - (right === -1 ? CATEGORY_ORDER.length : right);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });

  cache = { skills, scannedAt: Date.now(), roots: roots.map((root) => root.directory), missingRoots };
  return cache;
}

export function groupByCategory(skills: SkillEntry[]): { category: string; skills: SkillEntry[] }[] {
  const groups = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const group = groups.get(skill.category);
    if (group) group.push(skill);
    else groups.set(skill.category, [skill]);
  }
  return [...groups.entries()].map(([category, entries]) => ({ category, skills: entries }));
}
