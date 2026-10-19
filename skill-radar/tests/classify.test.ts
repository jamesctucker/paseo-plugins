import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classify } from "../server/classify";

let root: string | null = null;

async function fixture() {
  root = await mkdtemp(path.join(tmpdir(), "skill-radar-classify-"));
  const workspace = path.join(root, "workspace");
  for (const [name, description] of [
    ["diagnose", "Debug hard bugs."],
    ["retro", "Session retrospective."],
    ["code-review", "Review a pull request."],
  ]) {
    const target = path.join(workspace, "engineering", name, "SKILL.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `---\nname: ${name}\ndescription: ${description}\n---\nbody`);
  }
  process.env.SKILL_RADAR_SKILL_ROOTS = workspace;
  process.env.OPENROUTER_API_KEY = "test-key";
}

function decisionResponse(probabilities: Record<string, number>) {
  return new Response(
    JSON.stringify({ model: "cloudflare/clef-flash", answers: { skill: { type: "choice", probabilities } } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => fixture());

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.SKILL_RADAR_SKILL_ROOTS;
  delete process.env.OPENROUTER_API_KEY;
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("classification", () => {
  it("ranks known skills, drops none and unknown names, and converts probabilities to integers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        decisionResponse({
          diagnose: 0.914,
          retro: 0.4,
          "code-review": 0.0004,
          hallucinated: 0.9,
          none: 0.01,
        }),
      ),
    );

    const result = await classify(["the test fails with a null pointer, why?"]);

    expect(result.status).toBe("ok");
    expect(result.matches).toEqual([
      { name: "diagnose", confidence: 91 },
      { name: "retro", confidence: 40 },
    ]);
  });

  it("posts to the decisions endpoint with a choice question", async () => {
    const fetchMock = vi.fn(async () => decisionResponse({ diagnose: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await classify(["unusual phrase for endpoint assertion"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("cloudflare/clef-flash");
    expect(body.questions.skill.type).toBe("choice");
    expect(Object.keys(body.questions.skill.criteria)).toContain("diagnose");
  });

  it("reports unavailable instead of throwing when OpenRouter rejects the call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream exploded", { status: 503 })),
    );

    const result = await classify(["a different conversation about a 503"]);
    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("503");
    expect(result.matches).toEqual([]);
  });

  it("reuses a cached result for the same conversation", async () => {
    const fetchMock = vi.fn(async () => decisionResponse({ diagnose: 0.8 }));
    vi.stubGlobal("fetch", fetchMock);

    await classify(["a repeated conversation body"]);
    await classify(["a repeated conversation body"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
