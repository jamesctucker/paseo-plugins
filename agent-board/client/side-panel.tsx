import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import type { CardGroup } from "../shared/groups";
import { ColumnBody, type RenderCardOptions } from "./week-board";

/** The supporting workspace opened from the utility rail, never a third board column. */
export function SidePanel({
  theme,
  title,
  subtitle,
  onClose,
  children,
}: {
  theme: PluginTheme;
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 }}>
      <View
        style={{
          minHeight: 45,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{subtitle}</Text> : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title} panel`} onPress={onClose} hitSlop={8}>
          <Icon name="X" size={15} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
    </View>
  );
}

export function BacklogPanel({
  theme,
  cards,
  droppable,
  renderCard,
  onArchiveAll,
  onOpenCard,
  onDrop,
  onClose,
}: {
  theme: PluginTheme;
  cards: BoardCard[];
  droppable: boolean;
  renderCard(card: BoardCard, options: RenderCardOptions): ReactNode;
  onArchiveAll(group: CardGroup): void;
  onOpenCard(cardId: string): void;
  onDrop(): void;
  onClose(): void;
}) {
  return (
    <SidePanel theme={theme} title="Backlog" subtitle={cards.length > 0 ? `${cards.length} parked` : undefined} onClose={onClose}>
      {cards.length === 0 ? (
        <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 36, gap: 8 }}>
          <Icon name="Inbox" size={22} color={theme.colors.foregroundMuted} />
          <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>Nothing parked</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
            Quick-add captures land here until you give them a day.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}>
          <ColumnBody
            theme={theme}
            day={null}
            live={cards}
            done={[]}
            dense={false}
            droppable={droppable}
            cleared={null}
            renderCard={renderCard}
            onArchiveAll={onArchiveAll}
            onOpenCard={onOpenCard}
            onDrop={onDrop}
          />
        </ScrollView>
      )}
    </SidePanel>
  );
}
