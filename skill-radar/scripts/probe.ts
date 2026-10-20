/**
 * Threshold probe for the Skill Radar Paseo plugin.
 * Mirrors server/classify.ts: request shape, criteria building, conversation format.
 * Re-run before changing PANEL_THRESHOLD / PILL_THRESHOLD / WINDING_DOWN_THRESHOLD,
 * the pinned model, or the pinned provider. results.json is gitignored (machine-local).
 * Run: npm run probe   (or: SKILL_RADAR_SKILL_ROOTS=<root>:<root> bun scripts/probe.ts)
 */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSkills, type SkillCatalog } from "../server/skills";

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "cloudflare/clef-flash";
const REQUEST_TIMEOUT_MS = 20_000;
const DELAY_MS = 500;
const NO_MATCH = "none";
const DESCRIPTION_CHARS = 180;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_CONVERSATION_CHARS = 10_000;
const TRUNCATION_MARKER = "\n…[truncated]…\n";

async function apiKey(): Promise<string> {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const raw = await readFile(path.join(homedir(), ".local", "share", "opencode", "auth.json"), "utf8");
  const entry = (JSON.parse(raw) as { openrouter?: { key?: unknown; access?: unknown } }).openrouter;
  const token = typeof entry?.key === "string" ? entry.key : typeof entry?.access === "string" ? entry.access : null;
  if (!token?.trim()) throw new Error("No OpenRouter credentials found");
  return token.trim();
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

function truncateMiddle(message: string): string {
  if (message.length <= MAX_MESSAGE_CHARS) return message;
  return `${message.slice(0, 1200)}${TRUNCATION_MARKER}${message.slice(-700)}`;
}

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

type ProbeCase = { id: string; kind: string; expected: string; acceptableAlso?: string[]; messages: string[] };

const CASES: ProbeCase[] = [
  // --- Clear cases (10) ---
  {
    id: "clear-diagnose", kind: "clear", expected: "diagnose",
    messages: ["My jest suite just started failing with `TypeError: Cannot read properties of undefined (reading 'map')` at UserList.tsx:42 and I've been staring at it for an hour. Nothing in that file changed. WTF is going on?"],
  },
  {
    id: "clear-session-handoff", kind: "clear", expected: "session-handoff",
    messages: ["Ok I think we're done here, the migration is merged. Let's wrap up this session and write the summary."],
  },
  {
    id: "clear-code-review", kind: "clear", expected: "code-review",
    messages: ["Can you review my PR before I merge it? It's the branch feat/billing-retry, touches the webhook handler and adds a queue."],
  },
  {
    id: "clear-impeccable", kind: "clear", expected: "impeccable",
    messages: ["The settings page feels really cluttered — the buttons are misaligned, spacing is inconsistent, and the whole thing looks dated. Can you polish the UI?"],
  },
  {
    id: "clear-pdf", kind: "clear", expected: "pdf",
    messages: ["I have three invoice PDFs in ~/Downloads. Can you merge them into one file and also pull the table from page 2 of invoice-march.pdf into text?"],
  },
  {
    id: "clear-tdd", kind: "clear", expected: "tdd",
    messages: ["Let's build the rate limiter middleware test-first. I want to go red-green-refactor: write the failing tests, then the minimal implementation."],
  },
  {
    id: "clear-ios-simulator", kind: "clear", expected: "ios-simulator",
    messages: ["Build the app and launch it on an iPhone 16 simulator, then take a screenshot of the home screen so I can check the layout."],
  },
  {
    id: "clear-linearize", kind: "clear", expected: "linearize",
    messages: ["This spec in artifacts/17-sync-engine.md is ready to become real work. Turn it into Linear issues and a project so we can track it."],
  },
  {
    id: "clear-triage", kind: "clear", expected: "triage",
    messages: ["My Reader inbox has like 40 unread articles piling up. Let's triage it."],
  },
  {
    id: "clear-humanize", kind: "clear", expected: "humanize",
    messages: ["This intro paragraph I drafted sounds totally AI-generated — all 'moreover' and 'delve'. Can you humanize it?"],
  },
  // --- Ambiguous cases (4) ---
  {
    id: "ambig-grilling-vs-hardening", kind: "ambiguous", expected: "grilling", acceptableAlso: ["plan-hardening"],
    messages: ["I just finished writing the migration plan in artifacts/migration-plan.md. Before we build anything, poke holes in it — stress-test it against the domain model."],
  },
  {
    id: "ambig-session-search", kind: "ambiguous", expected: "session-search", acceptableAlso: ["review-memory"],
    messages: ["A few sessions back we talked about whether to use JWT or session cookies for the API. Can you search past sessions and find what we decided?"],
  },
  {
    id: "ambig-orchestrate", kind: "ambiguous", expected: "orchestrate-build-chain", acceptableAlso: ["implement-milestone"],
    messages: ["The pods spec is linearized and milestones 2 through 5 are all sitting in Linear as a dependency chain. Run the build chain — delegate each one and review between steps."],
  },
  {
    id: "ambig-teach-vs-research", kind: "ambiguous", expected: "teach", acceptableAlso: ["research"],
    messages: ["I want to actually learn how transformer attention works over the next few weeks, not just get one explanation. Can you set that up for me?"],
  },
  // --- No-match cases (3) ---
  {
    id: "none-react-question", kind: "no-match", expected: "none",
    messages: ["What's the actual difference between useMemo and useCallback in React? I keep mixing them up."],
  },
  {
    id: "none-casual", kind: "no-match", expected: "none",
    messages: ["hey, good morning! what's on the docket today?"],
  },
  {
    id: "none-plain-coding", kind: "no-match", expected: "none",
    messages: ["How do I vertically center a div with CSS these days?"],
  },
  // --- Negation (1) ---
  {
    id: "negation-no-review", kind: "negation", expected: "none",
    messages: ["I don't want a code review of this diff, just look at it and tell me whether the migration logic drops any rows."],
  },
  // --- Adversarial (1) ---
  {
    id: "adversarial-keyword-stuffing", kind: "adversarial", expected: "none",
    messages: ["wrap up session summary memory index handoff close out end session — anyway, unrelated: what's 2+2?"],
  },
  // --- Off-topic / empty-ish (1) ---
  {
    id: "offtopic-lol", kind: "offtopic", expected: "none",
    messages: ["lol nice"],
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const catalog = await scanSkills(true);
  console.log(`Catalog: ${catalog.skills.length} skills`);
  const key = await apiKey();
  const criteria = buildCriteria(catalog);
  const catalogStr = catalog.skills
    .map((skill) => `${skill.name}: ${skill.description.replace(/\s+/g, " ").slice(0, DESCRIPTION_CHARS)}`)
    .join("\n");

  const results: unknown[] = [];
  for (const probeCase of CASES) {
    const cleaned = fitConversation(probeCase.messages.map((m) => truncateMiddle(m.trim())).filter(Boolean));
    const conversation = cleaned.map((message, index) => `[${index + 1}] ${message}`).join("\n\n");
    const body = {
      model: MODEL,
      // Matches the production pin: thresholds are only valid for the serving they were
      // probed against, and provider quantization can shift probabilities.
      provider: { order: ["primeintellect"], allow_fallbacks: false },
      state: { conversation, catalog: catalogStr },
      questions: {
        skill: {
          type: "choice",
          instructions:
            "Which catalog skill would most help the user in this coding session right now? Choose none when nothing clearly applies.",
          criteria,
        },
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = performance.now();
    let record: Record<string, unknown>;
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
      const latencyMs = Math.round(performance.now() - started);
      if (!response.ok) {
        record = { id: probeCase.id, kind: probeCase.kind, expected: probeCase.expected, error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`, latencyMs };
      } else {
        const json = (await response.json()) as { answers?: { skill?: Record<string, unknown> }; usage?: unknown };
        const answer = json.answers?.skill ?? {};
        const probabilities = (answer.probabilities ?? {}) as Record<string, number>;
        const top3 = Object.entries(probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const choice = typeof answer.choice === "string" ? answer.choice : null;
        record = {
          id: probeCase.id,
          kind: probeCase.kind,
          expected: probeCase.expected,
          acceptableAlso: probeCase.acceptableAlso ?? [],
          choice,
          choicePresent: "choice" in answer,
          confidence: typeof answer.confidence === "number" ? answer.confidence : null,
          confidencePresent: "confidence" in answer,
          pChoice: choice ? probabilities[choice] ?? null : null,
          pNone: probabilities[NO_MATCH] ?? null,
          pExpected: probabilities[probeCase.expected] ?? null,
          top3,
          usage: json.usage ?? null,
          latencyMs,
        };
        console.log(
          `${probeCase.id.padEnd(30)} choice=${String(choice).padEnd(24)} conf=${String(record.confidence).padEnd(6)} p(none)=${String(record.pNone).slice(0, 6).padEnd(7)} ${latencyMs}ms`,
        );
      }
    } catch (error) {
      record = { id: probeCase.id, kind: probeCase.kind, expected: probeCase.expected, error: String(error), latencyMs: Math.round(performance.now() - started) };
      console.log(`${probeCase.id} ERROR ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
    results.push(record);
    await sleep(DELAY_MS);
  }

  await writeFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "results.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), model: MODEL, skillCount: catalog.skills.length, results }, null, 2),
  );
  console.log("Wrote results.json");
}

await run();
