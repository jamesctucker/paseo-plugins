import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { parseQuickAdd, isJiraKey } from "../shared/tracker";

/**
 * The quick-add field at the foot of Today. A pasted Jira key resolves to a
 * Jira card; a GitHub pull reference becomes a spawnable local card; anything
 * else becomes a prompt card.
 */

export interface QuickAddProps {
  theme: PluginTheme;
  compact: boolean;
  busy: boolean;
  error: string | null;
  onSubmit(text: string): Promise<boolean>;
  onOpenSettings(): void;
}

export function QuickAdd({ theme, compact, busy, error, onSubmit, onOpenSettings }: QuickAddProps) {
  const [text, setText] = useState("");
  const authFailure = error !== null && /token|configured|rejected/i.test(error);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    const ok = await onSubmit(value);
    if (ok) setText("");
  }

  return (
    <View style={{ gap: 6, paddingHorizontal: compact ? 16 : 24, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void submit()}
          placeholder="Task or Jira key (PROJ-142)…"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            flex: 1,
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 13,
          }}
        />
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to Today"
            onPress={() => void submit()}
            style={{
              backgroundColor: theme.colors.accent,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>Add</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, flexShrink: 1 }}>{error}</Text>
          {authFailure ? (
            <Pressable accessibilityRole="button" onPress={onOpenSettings} hitSlop={6}>
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Open token config</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function quickAddHint(text: string): string {
  const parsed = parseQuickAdd(text.trim());
  if (parsed.kind === "jira") return `Jira issue ${parsed.key}`;
  if (parsed.kind === "github") return `GitHub PR ${parsed.repo}#${parsed.number}`;
  return "Prompt card";
}

export { isJiraKey };