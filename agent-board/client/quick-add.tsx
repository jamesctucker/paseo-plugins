import { useState, type Ref } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { parseQuickAdd } from "../shared/tracker";

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
  /** Lets the empty state's "New prompt card" button focus the field. */
  inputRef?: Ref<TextInput>;
}

/**
 * The field's syntax is richer than one placeholder can say. The canonical
 * hint shows first; each successful add advances to the next, so the task,
 * gate, and PR forms surface through use instead of documentation.
 */
const HINTS = [
  { wide: "Task or Jira key (PROJ-142)…", compact: "Task or key…" },
  { wide: "PROJ-142: a task under that issue…", compact: "KEY: task…" },
  { wide: "! a reminder only you can clear…", compact: "! reminder…" },
  { wide: "owner/repo#12 to add a pull request…", compact: "org/repo#12…" },
];

export function QuickAdd({ theme, compact, busy, error, onSubmit, onOpenSettings, inputRef }: QuickAddProps) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState(0);
  const authFailure = error !== null && /token|configured|rejected/i.test(error);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    const ok = await onSubmit(value);
    if (ok) {
      setText("");
      setHint((current) => (current + 1) % HINTS.length);
    }
  }

  return (
    <View style={{ gap: 6, paddingHorizontal: compact ? 16 : 24, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void submit()}
          placeholder={compact ? HINTS[hint].compact : HINTS[hint].wide}
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            flex: 1,
            // RN keeps an intrinsic width for inputs; without this the field
            // refuses to shrink below its placeholder and overflows.
            minWidth: 0,
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
            <Pressable accessibilityRole="button" accessibilityLabel="Open token config" onPress={onOpenSettings} hitSlop={6}>
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Open token config</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}