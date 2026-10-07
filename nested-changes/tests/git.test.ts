import { describe, expect, it } from "vitest";
import { classify, isJunkUntracked, parseNumstatZ, parsePorcelainZ } from "../server/git";
import type { ChangedFile } from "../shared/diff";

function makeFile(overrides: Partial<ChangedFile>): ChangedFile {
  return {
    path: "file.txt",
    status: "untracked",
    staged: false,
    untracked: false,
    oldPath: null,
    additions: null,
    deletions: null,
    ...overrides,
  };
}

describe("classify", () => {
  it("returns null for ignored records", () => {
    expect(classify("!!")).toBeNull();
  });

  it("classifies untracked", () => {
    expect(classify("??")).toBe("untracked");
  });

  it("classifies unmerged", () => {
    expect(classify("UU")).toBe("unmerged");
    expect(classify("AU")).toBe("unmerged");
  });

  it("classifies renamed", () => {
    expect(classify("R ")).toBe("renamed");
  });

  it("classifies copied", () => {
    expect(classify("C ")).toBe("copied");
  });

  it("classifies deleted", () => {
    expect(classify("D ")).toBe("deleted");
    expect(classify(" D")).toBe("deleted");
  });

  it("classifies added", () => {
    expect(classify("A ")).toBe("added");
    expect(classify(" A")).toBe("added");
  });

  it("falls through to modified for plain change codes", () => {
    expect(classify("M ")).toBe("modified");
    expect(classify(" M")).toBe("modified");
    expect(classify("  ")).toBe("modified");
  });
});

describe("parsePorcelainZ", () => {
  it("parses a modified unstaged file", () => {
    const files = parsePorcelainZ(" M file.txt\0");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "file.txt", status: "modified", staged: false, untracked: false });
  });

  it("parses a staged modification", () => {
    const files = parsePorcelainZ("M  file.txt\0");
    expect(files[0]).toMatchObject({ status: "modified", staged: true });
  });

  it("parses an added staged file", () => {
    const files = parsePorcelainZ("A  new.txt\0");
    expect(files[0]).toMatchObject({ path: "new.txt", status: "added", staged: true });
  });

  it("parses a deleted file", () => {
    const files = parsePorcelainZ(" D gone.txt\0");
    expect(files[0]).toMatchObject({ path: "gone.txt", status: "deleted", staged: false });
  });

  it("parses an untracked file", () => {
    const files = parsePorcelainZ("?? fresh.txt\0");
    expect(files[0]).toMatchObject({ path: "fresh.txt", status: "untracked", staged: false, untracked: true });
  });

  it("parses an unmerged file", () => {
    const files = parsePorcelainZ("UU conflict.txt\0");
    expect(files[0]).toMatchObject({ path: "conflict.txt", status: "unmerged" });
  });

  it("consumes the following NUL record as oldPath for renames", () => {
    // In -z porcelain v1, renames arrive as "R  <to>\0<from>\0".
    const files = parsePorcelainZ("R  new.txt\0old.txt\0 M other.txt\0");
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "new.txt", status: "renamed", oldPath: "old.txt" });
    expect(files[1]).toMatchObject({ path: "other.txt", status: "modified" });
  });

  it("consumes the following NUL record as oldPath for copies", () => {
    const files = parsePorcelainZ("C  copy.txt\0orig.txt\0");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "copy.txt", status: "copied", oldPath: "orig.txt" });
  });

  it("leaves oldPath null for non-rename statuses", () => {
    const files = parsePorcelainZ(" M file.txt\0");
    expect(files[0].oldPath).toBeNull();
  });

  it("skips ignored records", () => {
    const files = parsePorcelainZ("!! build/output.js\0 M file.txt\0");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("file.txt");
  });

  it("skips empty and malformed records", () => {
    const files = parsePorcelainZ("\0 M \0x\0\0 M real.txt\0");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("real.txt");
  });

  it("returns an empty list for empty output", () => {
    expect(parsePorcelainZ("")).toEqual([]);
  });

  it("parses multiple records in order", () => {
    const files = parsePorcelainZ(" M a.txt\0?? b.txt\0D  c.txt\0");
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ["a.txt", "modified"],
      ["b.txt", "untracked"],
      ["c.txt", "deleted"],
    ]);
  });
});

describe("parseNumstatZ", () => {
  it("parses normal entries", () => {
    const stats = parseNumstatZ("3\t1\tfile.txt\0");
    expect(stats.get("file.txt")).toEqual({ additions: 3, deletions: 1 });
  });

  it("maps binary entries to zero counts", () => {
    const stats = parseNumstatZ("-\t-\timage.png\0");
    expect(stats.get("image.png")).toEqual({ additions: 0, deletions: 0 });
  });

  it("parses rename entries keyed by the new path", () => {
    // Rename records carry an empty path segment, then old\0new as two records.
    const stats = parseNumstatZ("2\t1\t\0old.txt\0new.txt\0");
    expect(stats.get("new.txt")).toEqual({ additions: 2, deletions: 1 });
    expect(stats.has("old.txt")).toBe(false);
  });

  it("keeps following entries after a rename", () => {
    const stats = parseNumstatZ("2\t1\t\0old.txt\0new.txt\0" + "5\t0\tplain.txt\0");
    expect(stats.get("plain.txt")).toEqual({ additions: 5, deletions: 0 });
  });

  it("skips malformed and empty records", () => {
    const stats = parseNumstatZ("\0garbage\0abc\tdef\tbad.txt\0");
    expect(stats.size).toBe(0);
  });

  it("returns an empty map for empty output", () => {
    expect(parseNumstatZ("").size).toBe(0);
  });
});

describe("isJunkUntracked", () => {
  it("flags untracked .DS_Store basenames at any depth", () => {
    expect(isJunkUntracked(makeFile({ path: ".DS_Store", untracked: true }))).toBe(true);
    expect(isJunkUntracked(makeFile({ path: "dir/sub/.DS_Store", untracked: true }))).toBe(true);
  });

  it("flags untracked Thumbs.db", () => {
    expect(isJunkUntracked(makeFile({ path: "Thumbs.db", untracked: true }))).toBe(true);
  });

  it("flags the .playwright-mcp/ prefix", () => {
    expect(isJunkUntracked(makeFile({ path: ".playwright-mcp/shot.png", untracked: true }))).toBe(true);
  });

  it("never flags tracked files, even junk-looking ones", () => {
    expect(isJunkUntracked(makeFile({ path: ".DS_Store", status: "modified", untracked: false }))).toBe(false);
  });

  it("does not flag .claude/ config", () => {
    // Regression guard: .claude/ was briefly over-filtered as junk.
    expect(isJunkUntracked(makeFile({ path: ".claude/settings.json", untracked: true }))).toBe(false);
  });

  it("does not flag ordinary untracked files", () => {
    expect(isJunkUntracked(makeFile({ path: "notes.md", untracked: true }))).toBe(false);
  });
});
