import { describe, expect, it } from "vitest";
import { DEFAULT_SPAWN_SPEC, resolveSpawnSpec, SpawnConfigError, WORK_SPAWN_SPEC } from "../shared/provider";
import { jiraConfigDoc } from "../shared/settings";

const catalog = [
  { provider: "opencode", models: [{ id: "openrouter/tencent/hy4" }, { id: "deepseek/deepseek-flash" }] },
  { provider: "claude", models: [{ id: "claude-sonnet-4" }] },
];

describe("resolveSpawnSpec", () => {
  it("runs a full provider/model spec verbatim", () => {
    expect(resolveSpawnSpec("opencode/deepseek/deepseek-flash", catalog)).toBe(
      "opencode/deepseek/deepseek-flash",
    );
  });

  it("falls back to the default spec when empty", () => {
    expect(resolveSpawnSpec("", catalog)).toBe(DEFAULT_SPAWN_SPEC);
    expect(resolveSpawnSpec("   ", catalog)).toBe(DEFAULT_SPAWN_SPEC);
  });

  it("rejects a bare provider with the format and a real example", () => {
    expect(() => resolveSpawnSpec("opencode", catalog)).toThrow(SpawnConfigError);
    expect(() => resolveSpawnSpec("opencode", catalog)).toThrow(/provider\/model.*openrouter\/tencent\/hy4/);
  });

  it("names the provider's first model in the error even off-catalog", () => {
    expect(() => resolveSpawnSpec("codex", catalog)).toThrow(/codex\/<model>/);
  });
});

describe("jira-config migration", () => {
  it("promotes a v1 bare spawnProvider to the default spec", () => {
    const migrate = jiraConfigDoc.migrate;
    expect(migrate).toBeTypeOf("function");
    const result = (migrate as (values: unknown, fromVersion: number) => unknown)(
      { domain: "d", email: "e", token: "t", jql: "", spawnProvider: "opencode" },
      1,
    );
    expect(result).toMatchObject({ spawnProvider: DEFAULT_SPAWN_SPEC, domain: "d" });
  });

  it("keeps a v1 full spec untouched", () => {
    const migrate = jiraConfigDoc.migrate as (values: unknown, fromVersion: number) => unknown;
    const result = migrate({ spawnProvider: "opencode/deepseek/deepseek-flash" }, 1);
    expect(result).toMatchObject({ spawnProvider: "opencode/deepseek/deepseek-flash" });
  });

  it("adds the Jira spawn lane when migrating v2 to v3", () => {
    const migrate = jiraConfigDoc.migrate as (values: unknown, fromVersion: number) => unknown;
    expect(migrate({ spawnProvider: "x/y" }, 2)).toEqual({ spawnProvider: "x/y", spawnProviderJira: WORK_SPAWN_SPEC });
  });

  it("passes v3 values through unchanged", () => {
    const migrate = jiraConfigDoc.migrate as (values: unknown, fromVersion: number) => unknown;
    const values = { spawnProvider: "x/y", spawnProviderJira: "a/b" };
    expect(migrate(values, 3)).toEqual(values);
  });
});