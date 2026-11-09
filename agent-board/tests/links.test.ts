import { describe, expect, it } from "vitest";
import { agentMatchText, declineKey, linkPickerAgents, linkSuggestions, titleNamesCard, type LinkableAgent, type LinkableCard } from "../shared/links";

function card(overrides: Partial<LinkableCard> = {}): LinkableCard {
  return { id: "c1", archivedAt: null, runs: [], ...overrides };
}

function agent(overrides: Partial<LinkableAgent> = {}): LinkableAgent {
  return {
    id: "a1",
    title: null,
    status: "running",
    workspaceId: "w1",
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T09:00:00Z",
    parentAgentId: null,
    ...overrides,
  };
}

const pr = card({ github: { repo: "acme/api", number: 9348 } });
const noTitles = new Map<string, string>();

describe("titleNamesCard", () => {
  it("matches a PR by full ref, short ref, or URL", () => {
    expect(titleNamesCard("Code review for alex's PR: acme/api#9348", pr)).toBe(true);
    expect(titleNamesCard("Review api#9348", pr)).toBe(true);
    expect(titleNamesCard("See https://github.com/acme/api/pull/9348", pr)).toBe(true);
  });

  it("rejects other numbers and other repos", () => {
    expect(titleNamesCard("acme/api#93480", pr)).toBe(false);
    expect(titleNamesCard("acme/api#934", pr)).toBe(false);
    expect(titleNamesCard("acme/web#9348", pr)).toBe(false);
    expect(titleNamesCard("other/myapi#9348", pr)).toBe(false);
  });

  it("matches a tracker key as a whole token, case-insensitively", () => {
    const jira = card({ jiraKey: "PROJ-14" });
    expect(titleNamesCard("proj-14: fix the retry logic", jira)).toBe(true);
    expect(titleNamesCard("Work PROJ-142", jira)).toBe(false);
    expect(titleNamesCard("XPROJ-14", jira)).toBe(false);
  });

  it("never matches a prompt card or an untitled agent", () => {
    expect(titleNamesCard("anything", card())).toBe(false);
    expect(titleNamesCard(null, pr)).toBe(false);
  });
});

describe("linkSuggestions", () => {
  const matching = agent({ id: "a1", title: "Review acme/api#9348" });

  it("offers an unlinked agent whose title names the card", () => {
    const suggestions = linkSuggestions([pr], new Map([[matching.id, matching]]), {}, noTitles);
    expect(suggestions.get("c1")?.map((entry) => entry.id)).toEqual(["a1"]);
  });

  it("skips agents any card already holds, even in an older run", () => {
    const holder = card({ id: "c2", jiraKey: "PROJ-1", runs: [{ agentId: "a1" }, { agentId: "a9" }] });
    expect(linkSuggestions([pr, holder], new Map([[matching.id, matching]]), {}, noTitles).size).toBe(0);
  });

  it("skips declined pairs, subagents, closed agents, and archived cards", () => {
    const agents = (entry: LinkableAgent) => new Map([[entry.id, entry]]);
    expect(linkSuggestions([pr], agents(matching), { [declineKey("c1", "a1")]: "x" }, noTitles).size).toBe(0);
    expect(linkSuggestions([pr], agents({ ...matching, parentAgentId: "p" }), {}, noTitles).size).toBe(0);
    expect(linkSuggestions([pr], agents({ ...matching, status: "closed" }), {}, noTitles).size).toBe(0);
    expect(linkSuggestions([{ ...pr, archivedAt: "2026-11-09T10:00:00Z" }], agents(matching), {}, noTitles).size).toBe(0);
  });

  it("stays quiet on a card whose latest run is still live", () => {
    const busy = agent({ id: "live", title: "something else" });
    const withLive = { ...pr, runs: [{ agentId: "live" }] };
    const agents = new Map([
      [busy.id, busy],
      [matching.id, matching],
    ]);
    expect(linkSuggestions([withLive], agents, {}, noTitles).size).toBe(0);
    expect(linkSuggestions([withLive], new Map([...agents, ["live", { ...busy, status: "idle" }]]), {}, noTitles).get("c1")?.length).toBe(1);
  });
});

describe("linkPickerAgents", () => {
  it("puts matches first and leaves out linked agents and subagents", () => {
    const agents = new Map(
      [
        agent({ id: "match", title: "acme/api#9348 review", updatedAt: "2026-11-09T08:00:00Z" }),
        agent({ id: "recent", title: "Unrelated", updatedAt: "2026-11-09T11:00:00Z" }),
        agent({ id: "child", title: "acme/api#9348 sub", parentAgentId: "match" }),
        agent({ id: "held", title: "acme/api#9348 old" }),
      ].map((entry) => [entry.id, entry]),
    );
    const holder = card({ id: "c2", runs: [{ agentId: "held" }] });
    const { matches, others } = linkPickerAgents(pr, [pr, holder], agents, noTitles);
    expect(matches.map((entry) => entry.id)).toEqual(["match"]);
    expect(others.map((entry) => entry.id)).toEqual(["recent"]);
  });
});

describe("agentMatchText", () => {
  it("falls back to the workspace title when the agent's own title says nothing", () => {
    const quiet = agent({ title: "Please review this PR", workspaceId: "w9" });
    const titles = new Map([["w9", "Code review for alex's PR: acme/api#9348"]]);
    expect(agentMatchText(quiet, pr, titles)).toBe("Code review for alex's PR: acme/api#9348");
    expect(agentMatchText(quiet, pr, noTitles)).toBeNull();
    expect(linkSuggestions([pr], new Map([[quiet.id, quiet]]), {}, titles).get("c1")?.length).toBe(1);
  });

  it("prefers the agent's own title when it matches", () => {
    const named = agent({ title: "acme/api#9348 review", workspaceId: "w9" });
    expect(agentMatchText(named, pr, new Map([["w9", "acme/api#9348 workspace"]]))).toBe("acme/api#9348 review");
  });
});
