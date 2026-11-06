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

  it("parses task syntax under a tracker key", () => {
    expect(parseQuickAdd("OPS-28506: fix the retry logic")).toEqual({
      kind: "jira",
      key: "OPS-28506",
      task: "fix the retry logic",
    });
    expect(parseQuickAdd("eng-5: review: the staging plan")).toEqual({
      kind: "jira",
      key: "ENG-5",
      task: "review: the staging plan",
    });
  });

  it("parses task syntax under a pull reference", () => {
    expect(parseQuickAdd("acme/web#88: rebase onto main")).toEqual({
      kind: "github",
      repo: "acme/web",
      number: 88,
      task: "rebase onto main",
    });
  });

  it("does not mistake a pull URL for task syntax", () => {
    expect(parseQuickAdd("https://github.com/acme/web/pull/88")).toEqual({
      kind: "github",
      repo: "acme/web",
      number: 88,
    });
  });

  it("keeps colon-bearing prompt titles as prompts", () => {
    expect(parseQuickAdd("Write docs: onboarding")).toEqual({ kind: "prompt", title: "Write docs: onboarding" });
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
describe("manual gate syntax", () => {
  it("parses `! text` as a gate", () => {
    expect(parseQuickAdd("! run probe-eventkit.swift")).toEqual({ kind: "gate", text: "run probe-eventkit.swift" });
  });

  it("a bare bang falls through to a prompt card", () => {
    expect(parseQuickAdd("!")).toEqual({ kind: "prompt", title: "!" });
  });

  it("gate text keeps colons", () => {
    expect(parseQuickAdd("! tell Critchfield: F2 53→100")).toEqual({ kind: "gate", text: "tell Critchfield: F2 53→100" });
  });
});
