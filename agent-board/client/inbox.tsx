import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import { cardKey } from "../shared/groups";
import { GroupLabel, monoFont } from "./ui";

/**
 * The inbox section (amendment 2026-11-20, probe slice). Quick-add lands
 * here undated; selecting rows and moving them to Today is the placement
 * ritual. Deliberately plain — the week view demolishes this section for the
 * leftmost column, so nothing here is built to last. The inbox never nags:
 * no age tint, no empty state, and the section itself hides when empty.
 */
export function InboxSection({
  theme,
  cards,
  onMove,
}: {
  theme: PluginTheme;
  cards: BoardCard[];
  onMove(ids: ReadonlySet<string>): Promise<boolean>;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function move() {
    if (selected.size === 0) return;
    const moved = await onMove(selected);
    if (moved) setSelected(new Set());
  }

  const selectedHere = cards.filter((card) => selected.has(card.id)).length;

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <GroupLabel theme={theme} text="Inbox" />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          {cards.length} parked
        </Text>
      </View>
      {/* Bounded so a week of capture can't crush Today off the screen. */}
      <ScrollView style={{ maxHeight: 224 }} nestedScrollEnabled>
        {cards.map((card) => {
          const isSelected = selected.has(card.id);
          const key = cardKey(card);
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={`${isSelected ? "Unselect" : "Select"} ${card.title}`}
              onPress={() => toggle(card.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: isSelected ? theme.colors.surface1 : "transparent",
                borderWidth: 1,
                borderColor: isSelected ? theme.colors.accent : "transparent",
              }}
            >
              <Icon
                name={isSelected ? "Check" : "Circle"}
                size={13}
                color={isSelected ? theme.colors.accent : theme.colors.foregroundMuted}
              />
              {key ? (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: monoFont }}>{key}</Text>
              ) : null}
              <Text style={{ color: theme.colors.foreground, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                {card.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selectedHere > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${selectedHere} cards to Today`}
            onPress={() => void move()}
            style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>
              Move {selectedHere} to Today
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear selection"
            onPress={() => setSelected(new Set())}
            hitSlop={6}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
