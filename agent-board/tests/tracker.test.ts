import { describe, expect, it } from "vitest";
import { isJiraKey, parseQuickAdd } from "../shared/tracker";

describe("parseQuickAdd", () => {
  it("resolves Jira keys case-insensitively", () => {
    expect(parseQuickAdd("proj-142")).toEqual({ kind: "jira", key: "PROJ-142" });
    expect(parseQuickAdd(" PROJ-142 ")).toEqual({ kind: "jira", key: "PROJ-142" });
  });

  it("resolves GitHub short and URL pull references", () => {
    expect(parseQuickAdd("acme/cli#12")).toEqual({
      kind: "github",
      repo: "acme/cli",
      number: 12,
    });
    expect(parseQuickAdd("https://github.com/acme/web/pull/88")).toEqual({
      kind: "github",
      repo: "acme/web",
      number: 88,
    });
  });

  it("treats everything else as a prompt card title", () => {
    expect(parseQuickAdd("Ship the export button")).toEqual({ kind: "prompt", title: "Ship the export button" });
    expect(parseQuickAdd("  ")).toEqual({ kind: "prompt", title: "" });
  });
});

describe("isJiraKey", () => {
  it("matches tracker keys with a project prefix", () => {
    expect(isJiraKey("PROJ-142")).toBe(true);
    expect(isJiraKey("OPS-9")).toBe(true);
    expect(isJiraKey("142")).toBe(false);
    expect(isJiraKey("cli#12")).toBe(false);
  });
});