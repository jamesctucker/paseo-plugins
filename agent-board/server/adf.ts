/**
 * Atlassian Document Format to markdown. Spawn prompts want readable text, not
 * raw ADF JSON, so this flattens the block types that actually show up in issue
 * descriptions. Anything unrecognized degrades to its plain text content.
 */

interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

function inlineText(node: AdfNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(inlineText).join("");
}

function blockToMarkdown(node: AdfNode, indent: string): string {
  switch (node.type) {
    case "paragraph":
      return `${indent}${inlineText(node)}`;
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const hashes = "#".repeat(Math.min(6, Math.max(1, level)));
      return `${indent}${hashes} ${inlineText(node)}`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => blockToMarkdown(item, `${indent}- `))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => blockToMarkdown(item, `${indent}${index + 1}. `))
        .join("\n");
    case "listItem": {
      const inner = (node.content ?? [])
        .map((child) => blockToMarkdown(child, `${indent}  `))
        .join("\n");
      return `${indent}${inner.replace(indent, "").trim()}`;
    }
    case "codeBlock":
      return `\`\`\`\n${inlineText(node)}\n\`\`\``;
    case "blockquote":
      return (node.content ?? [])
        .map((child) => blockToMarkdown(child, `${indent}> `))
        .join("\n");
    default:
      return `${indent}${inlineText(node)}`;
  }
}

export function adfToMarkdown(doc: unknown): string {
  if (typeof doc === "string") return doc;
  if (!doc || typeof doc !== "object") return "";
  const root = doc as AdfNode;
  return (root.content ?? []).map((node) => blockToMarkdown(node, "")).join("\n\n");
}