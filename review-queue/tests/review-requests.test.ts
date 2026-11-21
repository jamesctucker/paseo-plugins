import { describe, expect, it } from "vitest";
import { parseOriginRepo } from "../server/review-requests";
import { renderReviewPrompt } from "../shared/review-requests";

describe("parseOriginRepo", () => {
  it("reads https remote urls", () => {
    expect(parseOriginRepo("https://github.com/acme/api.git")).toBe("acme/api");
    expect(parseOriginRepo("https://github.com/acme/api")).toBe("acme/api");
  });

  it("reads ssh remote urls", () => {
    expect(parseOriginRepo("git@github.com:acme/api.git")).toBe("acme/api");
    expect(parseOriginRepo("ssh://git@github.com/acme/api.git")).toBe("acme/api");
  });

  it("reads any git host, not just github", () => {
    expect(parseOriginRepo("https://gitlab.com/acme/api.git")).toBe("acme/api");
  });

  it("returns null for remotes with no owner/name pair", () => {
    expect(parseOriginRepo("https://github.com")).toBeNull();
    expect(parseOriginRepo("")).toBeNull();
  });
});

describe("renderReviewPrompt", () => {
  const pr = { repo: "acme/api", number: 42, url: "https://github.com/acme/api/pull/42" };

  it("substitutes every placeholder", () => {
    const prompt = renderReviewPrompt("Review {repo}#{number} at {url}", pr);
    expect(prompt).toBe("Review acme/api#42 at https://github.com/acme/api/pull/42");
    expect(prompt).not.toContain("{");
  });

  it("leaves a template without placeholders untouched", () => {
    expect(renderReviewPrompt("Review the checked-out pull request.", pr)).toBe(
      "Review the checked-out pull request.",
    );
  });
});
