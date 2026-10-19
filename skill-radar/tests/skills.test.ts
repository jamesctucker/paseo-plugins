import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanSkills } from "../server/skills";

let root: string | null = null;

async function fixture(files: Record<string, string>): Promise<{ workspace: string; global: string }> {
  root = await mkdtemp(path.join(tmpdir(), "skill-radar-"));
  const workspace = path.join(root, "workspace");
  const global = path.join(root, "global");
  await mkdir(workspace, { recursive: true });
  await mkdir(global, { recursive: true });

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative, "SKILL.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }

  process.env.SKILL_RADAR_SKILL_ROOTS = `${workspace}:${global}`;
  return { workspace, global };
}

afterEach(async () => {
  delete process.env.SKILL_RADAR_SKILL_ROOTS;
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

describe("skill catalog", () => {
  it("reads nested categories, direct children, and the global root", async () => {
    await fixture({
      "workspace/engineering/diagnose":
        "---\nname: diagnose\ndescription: Debug hard bugs. Use when the user pastes an error or says something is broken.\n---\nbody",
      "workspace/paseo-help":
        "---\nname: paseo-help\ndescription: Answer Paseo questions.\n---\nbody",
      "global/understand":
        "---\nname: understand\ndescription: Build a knowledge graph.\n---\nbody",
    });

    const catalog = await scanSkills(true);
    const byName = Object.fromEntries(catalog.skills.map((skill) => [skill.name, skill]));

    expect(byName.diagnose.category).toBe("Engineering");
    expect(byName["paseo-help"].category).toBe("Skills");
    expect(byName.understand.category).toBe("Global");
    expect(byName.understand.origin).toBe("global");
  });

  it("extracts one short trigger phrase from the description", async () => {
    await fixture({
      "workspace/engineering/tdd":
        '---\nname: tdd\ndescription: "Test-first development. Use when the user wants red-green-refactor or integration tests."\n---\nbody',
    });

    const [skill] = (await scanSkills(true)).skills;
    expect(skill.trigger).toBe("the user wants red-green-refactor or integration tests");
  });

  it("honours the auto frontmatter flag and workspace shadowing", async () => {
    await fixture({
      "workspace/productivity/adhd":
        "---\nname: adhd\ndescription: Shape output.\nauto: true\n---\nbody",
      "global/adhd": "---\nname: adhd\ndescription: Global copy.\n---\nbody",
    });

    const catalog = await scanSkills(true);
    const adhd = catalog.skills.filter((skill) => skill.name === "adhd");
    expect(adhd).toHaveLength(1);
    expect(adhd[0].auto).toBe(true);
    expect(adhd[0].origin).toBe("workspace");
    expect(adhd[0].description).toBe("Shape output.");
  });

  it("follows symlinked skill directories", async () => {
    const { global } = await fixture({
      "workspace/agent/retro": "---\nname: retro\ndescription: Session retro.\n---\nbody",
      "outside/linked": "---\nname: linked\ndescription: Linked skill.\n---\nbody",
    });

    const { symlink } = await import("node:fs/promises");
    await symlink(path.join(root as string, "outside", "linked"), path.join(global, "linked"));

    const catalog = await scanSkills(true);
    expect(catalog.skills.some((skill) => skill.name === "linked")).toBe(true);
  });

  it("reports roots that do not exist", async () => {
    await fixture({
      "workspace/agent/retro": "---\nname: retro\ndescription: Session retro.\n---\nbody",
    });

    process.env.SKILL_RADAR_SKILL_ROOTS = `${path.join(root as string, "workspace")}:${path.join(
      root as string,
      "missing",
    )}`;
    const catalog = await scanSkills(true);
    expect(catalog.missingRoots).toHaveLength(1);
  });
});
