import type { PluginTheme } from "@getpaseo/plugin";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { DiffComment } from "./diff.shared";

export function useColors(theme: PluginTheme) {
  return useMemo(
    () => ({
      background: theme.colors.surface0,
      surface1: theme.colors.surface1,
      surface2: theme.colors.surface2,
      foreground: theme.colors.foreground,
      muted: theme.colors.foregroundMuted,
      accent: theme.colors.accent,
      danger: theme.colors.statusDanger,
      success: theme.colors.statusSuccess,
      border: theme.colors.border,
    }),
    [theme],
  );
}

export type Colors = ReturnType<typeof useColors>;

export interface DiffLine {
  key: number;
  text: string;
  kind: "add" | "del" | "hunk" | "header" | "context";
  oldLine: number | null;
  newLine: number | null;
}

const RENDER_LINE_CAP = 1500;

export function parseDiffLines(diff: string): DiffLine[] {
  const rawLines = diff.split("\n");
  const parsed: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const text = rawLines[i];
    const hunk = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      oldLine = Number.parseInt(hunk[1], 10);
      newLine = Number.parseInt(hunk[3], 10);
      parsed.push({ key: i, text, kind: "hunk", oldLine: null, newLine: null });
      continue;
    }

    if (
      text.startsWith("diff --git") ||
      text.startsWith("index ") ||
      text.startsWith("---") ||
      text.startsWith("+++") ||
      text.startsWith("new file") ||
      text.startsWith("deleted file") ||
      text.startsWith("old mode") ||
      text.startsWith("new mode") ||
      text.startsWith("similarity index") ||
      text.startsWith("rename ") ||
      text.startsWith("Binary files")
    ) {
      parsed.push({ key: i, text, kind: "header", oldLine: null, newLine: null });
      continue;
    }
    if (text.startsWith("\\")) {
      parsed.push({ key: i, text, kind: "header", oldLine: null, newLine: null });
      continue;
    }
    if (text.startsWith("+")) {
      parsed.push({ key: i, text, kind: "add", oldLine: null, newLine });
      newLine += 1;
      continue;
    }
    if (text.startsWith("-")) {
      parsed.push({ key: i, text, kind: "del", oldLine, newLine: null });
      oldLine += 1;
      continue;
    }
    parsed.push({ key: i, text, kind: "context", oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }
  return parsed;
}

/** Key a comment anchors to: new file line for adds/context, old line for deletions. */
function commentAnchor(line: DiffLine): { side: "old" | "new"; lineNumber: number } | null {
  if (line.kind === "del") return line.oldLine == null ? null : { side: "old", lineNumber: line.oldLine };
  if (line.kind === "hunk" || line.kind === "header") return null;
  return line.newLine == null ? null : { side: "new", lineNumber: line.newLine };
}

function commentKey(side: "old" | "new", lineNumber: number): string {
  return `${side}:${lineNumber}`;
}

function CommentInput({
  colors,
  onSubmit,
  onCancel,
}: {
  colors: Colors;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: colors.surface2,
      }}
    >
      <TextInput
        autoFocus
        value={body}
        onChangeText={setBody}
        placeholder="Comment on this line…"
        placeholderTextColor={colors.muted}
        onSubmitEditing={() => {
          if (body.trim()) onSubmit(body.trim());
        }}
        returnKeyType="send"
        style={{
          flex: 1,
          color: colors.foreground,
          fontSize: 12,
          paddingVertical: 4,
          paddingHorizontal: 8,
          backgroundColor: colors.surface1,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
      <Pressable accessibilityRole="button" onPress={onCancel}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function CommentChip({
  comment,
  colors,
  onRemove,
}: {
  comment: DiffComment;
  colors: Colors;
  onRemove: (id: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginHorizontal: 8,
        marginVertical: 2,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: colors.surface1,
        borderLeftWidth: 3,
        borderLeftColor: colors.accent,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace" }}>
        {comment.side}:{comment.line}
      </Text>
      <Text selectable style={{ color: colors.foreground, fontSize: 12, flex: 1 }}>
        {comment.body}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => onRemove(comment.id)}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>×</Text>
      </Pressable>
    </View>
  );
}

export function DiffView({
  diff,
  truncated,
  binary,
  colors,
  comments,
  onAddComment,
  onRemoveComment,
}: {
  diff: string;
  truncated: boolean;
  binary: boolean;
  colors: Colors;
  compact?: boolean;
  comments: DiffComment[];
  onAddComment: (side: "old" | "new", line: number, body: string) => void;
  onRemoveComment: (commentId: string) => void;
}) {
  const [activeCommentKey, setActiveCommentKey] = useState<string | null>(null);

  if (binary) {
    return (
      <Text style={{ color: colors.muted, padding: 12 }}>
        Binary file — no text diff available.
      </Text>
    );
  }
  if (!diff) {
    return <Text style={{ color: colors.muted, padding: 12 }}>No textual diff for this file.</Text>;
  }

  const lines = parseDiffLines(diff);
  const shown = lines.slice(0, RENDER_LINE_CAP);
  const commentsByKey = new Map<string, DiffComment[]>();
  for (const comment of comments) {
    const key = commentKey(comment.side, comment.line);
    const bucket = commentsByKey.get(key) ?? [];
    bucket.push(comment);
    commentsByKey.set(key, bucket);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ paddingVertical: 8, minWidth: "100%" }}>
        {shown.map((line) => {
          const anchor = commentAnchor(line);
          const anchorKey = anchor ? commentKey(anchor.side, anchor.lineNumber) : null;
          const lineComments = anchorKey ? commentsByKey.get(anchorKey) : undefined;
          const color =
            line.kind === "add"
              ? colors.success
              : line.kind === "del"
                ? colors.danger
                : line.kind === "hunk"
                  ? colors.accent
                  : line.kind === "header"
                    ? colors.muted
                    : colors.foreground;
          return (
            <View key={line.key}>
              <Pressable
                accessibilityRole="button"
                disabled={anchor == null}
                onPress={() => {
                  if (!anchorKey) return;
                  setActiveCommentKey((prev) => (prev === anchorKey ? null : anchorKey));
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "stretch" }}>
                  <Text
                    style={{
                      color: colors.muted,
                      fontFamily: "monospace",
                      fontSize: 11,
                      lineHeight: 18,
                      width: 36,
                      textAlign: "right",
                      paddingRight: 6,
                    }}
                  >
                    {line.oldLine ?? " "}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontFamily: "monospace",
                      fontSize: 11,
                      lineHeight: 18,
                      width: 36,
                      textAlign: "right",
                      paddingRight: 8,
                      borderRightWidth: 1,
                      borderRightColor: colors.border,
                    }}
                  >
                    {line.newLine ?? " "}
                  </Text>
                  <Text
                    style={{
                      color,
                      fontFamily: "monospace",
                      fontSize: 12,
                      lineHeight: 18,
                      paddingHorizontal: 8,
                      fontWeight: line.kind === "header" ? "600" : "400",
                      flexShrink: 1,
                    }}
                  >
                    {line.text.length === 0 ? " " : line.text}
                  </Text>
                </View>
              </Pressable>
              {lineComments?.map((comment) => (
                <CommentChip
                  key={comment.id}
                  comment={comment}
                  colors={colors}
                  onRemove={onRemoveComment}
                />
              ))}
              {anchor && anchorKey === activeCommentKey && (
                <CommentInput
                  colors={colors}
                  onSubmit={(body) => {
                    onAddComment(anchor.side, anchor.lineNumber, body);
                    setActiveCommentKey(null);
                  }}
                  onCancel={() => setActiveCommentKey(null)}
                />
              )}
            </View>
          );
        })}
        {(lines.length > RENDER_LINE_CAP || truncated) && (
          <Text style={{ color: colors.muted, fontStyle: "italic", marginTop: 8, paddingHorizontal: 8 }}>
            Diff truncated (
            {lines.length > RENDER_LINE_CAP
              ? `${lines.length.toLocaleString()} lines`
              : "size cap"}
            ).
          </Text>
        )}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
