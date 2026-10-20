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

function decisionResponse(
  probabilities: Record<string, number>,
  extra: { choice?: string; confidence?: number; windingDown?: number } = {},
) {
  const { windingDown, ...choiceExtra } = extra;
  return new Response(
    JSON.stringify({
      model: "cloudflare/clef-flash",
      answers: {
        skill: { type: "choice", probabilities, ...choiceExtra },
        ...(windingDown === undefined ? {} : { winding_down: { type: "noul", noul: windingDown } }),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => fixture());

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.SKILL_RADAR_SKILL_ROOTS;
  delete process.env.SKILL_RADAR_MODEL;
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
    expect(body.provider).toEqual({ order: ["primeintellect"], allow_fallbacks: false });
    expect(body.questions.skill.type).toBe("choice");
    expect(body.questions.winding_down.type).toBe("noul");
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

  it("returns no matches when none wins the probability mass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ none: 0.6, diagnose: 0.35, retro: 0.05 })),
    );

    const result = await classify(["nothing here fits any skill"]);
    expect(result.status).toBe("ok");
    expect(result.matches).toEqual([]);
  });

  it("returns no matches when the explicit choice is none, even if a skill looks strong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ diagnose: 0.52, none: 0.45 }, { choice: "none" })),
    );

    const result = await classify(["vague chit chat about nothing actionable"]);
    expect(result.matches).toEqual([]);
  });

  it("scores the top match with the model's confidence when provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        decisionResponse({ diagnose: 0.4, retro: 0.35, none: 0.1 }, { choice: "diagnose", confidence: 0.88 }),
      ),
    );

    const result = await classify(["help me figure out why this crashes"]);
    expect(result.matches[0]).toEqual({ name: "diagnose", confidence: 88 });
    expect(result.matches[1]).toEqual({ name: "retro", confidence: 35 });
  });

  it("suppresses a top skill that does not clearly beat none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ diagnose: 0.15, none: 0.1, retro: 0.05 })),
    );

    const result = await classify(["a flat guessy conversation"]);
    expect(result.status).toBe("ok");
    expect(result.matches).toEqual([]);
  });

  it("does not cache failures, so a transient error recovers on the next call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream exploded", { status: 503 }))
      .mockResolvedValueOnce(decisionResponse({ diagnose: 0.9 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await classify(["retry me after a failure"]);
    const second = await classify(["retry me after a failure"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.status).toBe("unavailable");
    expect(second.status).toBe("ok");
    expect(second.matches[0].name).toBe("diagnose");
  });

  it("dedupes concurrent identical classifications into one upstream call", async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => gate);
    vi.stubGlobal("fetch", fetchMock);

    const first = classify(["a concurrent identical conversation"]);
    const second = classify(["a concurrent identical conversation"]);
    release(decisionResponse({ diagnose: 0.9 }));
    const [one, two] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(one.matches[0].name).toBe("diagnose");
    expect(two.matches[0].name).toBe("diagnose");
  });

  it("keys the cache by model so a model switch reclassifies", async () => {
    const fetchMock = vi.fn(async () => decisionResponse({ diagnose: 0.8 }));
    vi.stubGlobal("fetch", fetchMock);

    process.env.SKILL_RADAR_MODEL = "cloudflare/clef";
    await classify(["a model keyed conversation"]);
    process.env.SKILL_RADAR_MODEL = "cloudflare/clef-flash";
    await classify(["a model keyed conversation"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("promotes a closing skill to the top when the session is winding down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ diagnose: 0.6, retro: 0.2, none: 0.05 }, { windingDown: 0.8 })),
    );

    const result = await classify(["final push is done, just closing up now"]);
    expect(result.windingDown).toBe(80);
    expect(result.matches[0]).toEqual({ name: "retro", confidence: 80 });
  });

  it("promotes a closing skill even when the content choice is none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ none: 0.5, retro: 0.25, diagnose: 0.2 }, { windingDown: 0.75 })),
    );

    const result = await classify(["ok that is everything pushed, thanks"]);
    expect(result.matches[0]).toEqual({ name: "retro", confidence: 75 });
  });

  it("leaves the content ranking alone when the session is not winding down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => decisionResponse({ diagnose: 0.6, retro: 0.2, none: 0.05 }, { windingDown: 0.3 })),
    );

    const result = await classify(["halfway through debugging this crash"]);
    expect(result.windingDown).toBe(30);
    expect(result.matches[0]).toEqual({ name: "diagnose", confidence: 60 });
  });

  it("middle-truncates oversized messages instead of sending unbounded state", async () => {
    const fetchMock = vi.fn(async () => decisionResponse({ diagnose: 0.9 }));
    vi.stubGlobal("fetch", fetchMock);

    await classify(["x".repeat(50_000)]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const conversation = body.state.conversation as string;
    expect(conversation.length).toBeLessThan(2_100);
    expect(conversation).toContain("[truncated]");
  });
});
