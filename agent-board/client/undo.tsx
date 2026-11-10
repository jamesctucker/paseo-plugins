import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import {
  applyArchiveUndo,
  isUndoLive,
  undoLabel,
  undoStillValid,
  type ArchiveUndo,
} from "../shared/undo";
import type { BoardDoc } from "./board-doc";

/**
 * Module-level holder for the one live archive-undo offer, shared so an
 * archive started on the detail screen is undoable from the board (and vice
 * versa). Ephemeral like the offer itself: a reload drops it, which only ever
 * costs the window. Expiry, a manual Restore, or a delete kills the offer;
 * see undoStillValid.
 */

const store: { current: ArchiveUndo | null; listeners: Set<() => void> } = {
  current: null,
  listeners: new Set(),
};

function emit() {
  for (const listener of store.listeners) listener();
}

export function pushArchiveUndo(undo: ArchiveUndo | null) {
  store.current = undo;
  emit();
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function useArchiveUndo(board: BoardDoc): { undo: ArchiveUndo | null; runUndo(): void } {
  const toast = useToast();
  const current = useSyncExternalStore(subscribe, () => store.current);
  const [now, setNow] = useState(() => Date.now());

  // Wake once at the expiry edge so the bar disappears on time; nothing ticks
  // while there's no offer.
  useEffect(() => {
    if (!current) return;
    const remaining = current.expiresAt - Date.now();
    if (remaining <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(timer);
  }, [current]);

  const undo =
    current && isUndoLive(current, now) && undoStillValid(board.values.cards, current) ? current : null;

  function runUndo() {
    if (!current) return;
    const next = applyArchiveUndo(board.values.cards, current);
    void board.saveCards(next).then((reason) => {
      if (reason) {
        toast.show(`Couldn't undo — ${reason}`, { variant: "error" });
        return;
      }
      if (store.current?.id === current.id) pushArchiveUndo(null);
    });
  }

  return { undo, runUndo };
}

/**
 * The feedback bar: archive confirmation plus the one action toasts can't
 * carry. Renders under the Today header on the board and at the top of the
 * card detail screen.
 */
export function ArchiveUndoBar({
  theme,
  undo,
  onUndo,
}: {
  theme: PluginTheme;
  undo: ArchiveUndo;
  onUndo(): void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: 12,
        marginTop: 4,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Icon name="Archive" size={13} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
        {undoLabel(undo)}
      </Text>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo archive"
        onPress={onUndo}
        hitSlop={6}
        style={{
          backgroundColor: theme.colors.accent,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 3,
        }}
      >
        <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>Undo</Text>
      </Pressable>
    </View>
  );
}
