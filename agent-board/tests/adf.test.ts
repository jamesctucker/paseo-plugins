import { describe, expect, it } from "vitest";
import { adfToMarkdown } from "../server/adf";

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

describe("adfToMarkdown", () => {
  it("flattens plain paragraphs", () => {
    const doc = { type: "doc", version: 1, content: [paragraph("Fix the pump."), paragraph("Then the valve.")] };
    expect(adfToMarkdown(doc)).toBe("Fix the pump.\n\nThen the valve.");
  });

  it("renders headings and lists", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Scope" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("pump")] },
            { type: "listItem", content: [paragraph("valve")] },
          ],
        },
      ],
    };
    expect(adfToMarkdown(doc)).toBe("## Scope\n\n- pump\n- valve");
  });

  it("fences code blocks", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [{ type: "codeBlock", content: [{ type: "text", text: "SELECT 1;" }] }],
    };
    expect(adfToMarkdown(doc)).toBe("```\nSELECT 1;\n```");
  });

  it("degrades gracefully on empty or plain-string input", () => {
    expect(adfToMarkdown(null)).toBe("");
    expect(adfToMarkdown("already text")).toBe("already text");
    expect(adfToMarkdown({ type: "doc", content: [] })).toBe("");
  });
});