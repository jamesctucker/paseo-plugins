import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import { columnCards, doneOn, formatWeekRange, isWeekend, weekDays, weekStart, weekWidths, weekendOccupied } from "../shared/week";
import { buildGroups, showHeader, type CardGroup } from "../shared/groups";
import { Chip, monoFont, useReduceMotion } from "./ui";

/**
 * The week board (amendment 2026-11-20): a backlog column and seven day
 * columns, Monday first, with today's column emphasized and the rest
 * slightly dimmed. Presentational: the screen that mounts it owns every
 * move, so nothing here touches the board document.
 *
 * Wide windows get the grid. Narrow ones stack: a strip of day chips stands
 * in for the columns and the chosen column renders as one list, so a phone
 * never sees seven columns across.
 */

/** A tap inside a column. `rowIndex` names the row that was tapped; null is the column's empty space. */
export interface DropTarget {
  day: string | null;
  rowIndex: number | null;
}

export interface RenderCardOptions {
  dense: boolean;
  grouped: boolean;
}

const HEADER_HEIGHT = 34;
/** Struck-through rows a column shows before folding the rest behind "more". */
const DONE_PREVIEW = 6;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ToolbarButton({
  theme,
  label,
  onPress,
  children,
}: {
  theme: PluginTheme;
  label: string;
  onPress(): void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 7,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
      })}
    >
      {children}
    </Pressable>
  );
}

/**
 * Week navigation. The arrows carry a quiet count when the neighboring week
 * holds live cards, because a week you cannot see should not look empty.
 */
export function WeekToolbar({
  theme,
  week,
  today,
  prevCount,
  nextCount,
  trailing,
  onNavigate,
  onThisWeek,
}: {
  theme: PluginTheme;
  week: string;
  today: string;
  prevCount: number;
  nextCount: number;
  trailing?: ReactNode;
  onNavigate(delta: number): void;
  onThisWeek(): void;
}) {
  const current = weekStart(today) === week;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
      }}
    >
      {/* "Go to" keeps the nav arrows' names clear of the MoveBar's slide
          actions, which are also "Next week" while a move is armed. */}
      <ToolbarButton theme={theme} label="Go to previous week" onPress={() => onNavigate(-1)}>
        <Icon name="ChevronLeft" size={14} color={theme.colors.foreground} />
        {prevCount > 0 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{prevCount}</Text> : null}
      </ToolbarButton>
      <ToolbarButton theme={theme} label="Go to next week" onPress={() => onNavigate(1)}>
        {nextCount > 0 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{nextCount}</Text> : null}
        <Icon name="ChevronRight" size={14} color={theme.colors.foreground} />
      </ToolbarButton>
      <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
        {current ? "This week" : formatWeekRange(week)}
      </Text>
      {current ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{formatWeekRange(week)}</Text> : null}
      {!current ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back to this week" onPress={onThisWeek} hitSlop={6}>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Today</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  );
}

/**
 * The one line that says what is in hand and where it can go: a picked-up
 * card, or a multi-selection. Its buttons are the slides (following day,
 * following week, back to the backlog), so the common pushes never need a
 * second gesture.
 */
export function MoveBar({
  theme,
  message,
  hint,
  actions,
  onCancel,
  cancelLabel,
}: {
  theme: PluginTheme;
  message: string;
  /** How to place by hand; differs between the grid and the chip strip. */
  hint: string;
  actions: { label: string; onPress(): void }[];
  onCancel(): void;
  cancelLabel: string;
}) {
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 2,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
        {message}
      </Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
        {hint}
      </Text>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>{action.label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={onCancel} hitSlop={6}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The once-a-week kinship moment, which replaced the daily migration prompt:
 * unfinished cards from before this week, carried onto Monday, parked back
 * in the backlog, or left where they are.
 */
export function RolloverBanner({
  theme,
  count,
  onAnswer,
}: {
  theme: PluginTheme;
  count: number;
  onAnswer(choice: "monday" | "backlog" | "leave"): void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 2,
        padding: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{count} unfinished from before this week</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Move the unfinished cards onto Monday"
          onPress={() => onAnswer("monday")}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>To Monday</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Move the unfinished cards to the backlog"
          onPress={() => onAnswer("backlog")}
          style={{ backgroundColor: theme.colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>To backlog</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave the cards on their days"
          onPress={() => onAnswer("leave")}
          style={{ paddingVertical: 5, paddingHorizontal: 4 }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Leave them</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The week's columns as chips: the stacked layout's stand-in for the grid. */
export function DayStrip({
  theme,
  week,
  today,
  selected,
  backlogCount,
  onSelect,
}: {
  theme: PluginTheme;
  week: string;
  today: string;
  /** Null is the backlog. */
  selected: string | null;
  backlogCount: number;
  onSelect(day: string | null): void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 4 }}>
        <StripChip
          theme={theme}
          label="Backlog"
          aside={backlogCount > 0 ? `${backlogCount} parked` : null}
          isSelected={selected === null}
          onPress={() => onSelect(null)}
        />
        {weekDays(week).map((day, index) => (
          <StripChip
            key={day}
            theme={theme}
            label={day === today ? "Today" : WEEKDAYS[index]}
            aside={day.slice(8)}
            isToday={day === today}
            isSelected={selected === day}
            onPress={() => onSelect(day)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function StripChip({
  theme,
  label,
  aside,
  isSelected,
  isToday = false,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  /** A second quiet token: the date for a day, the parked count for the backlog. */
  aside: string | null;
  isSelected: boolean;
  isToday?: boolean;
  onPress(): void;
}) {
  const textColor = isSelected ? theme.colors.accentForeground : isToday ? theme.colors.foreground : theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={aside ? `${label} ${aside}` : label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: isSelected || isToday ? theme.colors.accent : theme.colors.border,
        backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface1,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {aside ? <Text style={{ color: textColor, fontSize: 11 }}>{aside}</Text> : null}
    </Pressable>
  );
}

export interface ColumnBodyProps {
  theme: PluginTheme;
  /** Null is the backlog. */
  day: string | null;
  dense: boolean;
  /** A card is picked up or a selection is live: empty column space becomes a drop target. */
  droppable: boolean;
  /** Today's column with nothing live: show the cleared-day note. */
  cleared: { done: number } | null;
  renderCard(card: BoardCard, options: RenderCardOptions): ReactNode;
  onArchiveAll(group: CardGroup): void;
  onOpenCard(cardId: string): void;
  onDrop(day: string | null): void;
}

/**
 * One column's contents, shared by the grid's day columns and the stacked
 * layout's single list: groups under their issue header, then the struck-
 * through foot. The whole body is the column's drop target; a row's own tap
 * is handled by the row.
 */
export function ColumnBody({
  theme,
  day,
  live,
  done,
  dense,
  droppable,
  cleared,
  renderCard,
  onArchiveAll,
  onOpenCard,
  onDrop,
}: ColumnBodyProps & { live: BoardCard[]; done: BoardCard[] }) {
  const [hovered, setHovered] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const groups = useMemo(() => buildGroups(live), [live]);
  const foot = showAllDone ? done : done.slice(0, DONE_PREVIEW);
  const hidden = done.length - foot.length;

  return (
    <Pressable
      // Deliberately not role="button": cards inside are buttons, and a
      // button cannot wrap one. Rows already name the column for keyboard
      // and screen-reader users; this surface catches the empty space.
      accessibilityElementsHidden
      importantForAccessibility="no"
      // Out of the tab order: this surface is mouse/touch only.
      tabIndex={-1}
      // Not `disabled` when nothing is in hand: RN-web would put
      // aria-disabled on this wrapper and every card inside would read as
      // disabled to screen readers. The guard keeps the no-op tap instead.
      onPress={() => {
        if (droppable) onDrop(day);
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flex: 1,
        paddingHorizontal: 2,
        paddingTop: 4,
        paddingBottom: 4,
        ...(droppable
          ? {
              marginHorizontal: 4,
              marginBottom: 6,
              borderWidth: 1,
              borderRadius: 8,
              borderColor: hovered ? theme.colors.accent : theme.colors.border,
              borderStyle: hovered ? "solid" : "dashed",
              backgroundColor: hovered ? theme.colors.surface1 : "transparent",
            }
          : {}),
      }}
    >
      {cleared ? <ClearedNote theme={theme} done={cleared.done} /> : null}
      {groups.map((group) => {
        const header = showHeader(group);
        return (
          <View key={group.key ?? group.cards[0].id}>
            {header ? <GroupHeader theme={theme} group={group} dense={dense} onArchiveAll={() => onArchiveAll(group)} /> : null}
            {group.cards.map((card) => renderCard(card, { dense, grouped: header }))}
          </View>
        );
      })}
      {foot.length > 0 ? (
        <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 4 }} />
          {foot.map((card) => (
            <DoneRow key={card.id} theme={theme} card={card} onOpen={() => onOpenCard(card.id)} />
          ))}
          {hidden > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${hidden} more finished cards`}
              onPress={() => setShowAllDone(true)}
              hitSlop={4}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, paddingVertical: 2 }}>+{hidden} more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** The issue anchor above a task group; in a day column it stacks key and title. */
function GroupHeader({
  theme,
  group,
  dense,
  onArchiveAll,
}: {
  theme: PluginTheme;
  group: CardGroup;
  dense: boolean;
  onArchiveAll(): void;
}) {
  const title =
    group.issueTitle !== group.key ? (
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
        {group.issueTitle}
      </Text>
    ) : null;
  const status = group.status ? <Chip theme={theme} text={group.status} color={theme.colors.foregroundMuted} style={{ flexShrink: 1 }} /> : null;
  return (
    <View style={{ paddingHorizontal: dense ? 6 : 12, paddingTop: dense ? 6 : 10, paddingBottom: 2, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: monoFont, fontWeight: "600" }}>{group.key}</Text>
        {!dense ? title : null}
        {!dense ? status : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Archive all tasks for ${group.key}`} onPress={onArchiveAll} hitSlop={6}>
          <Icon name="Archive" size={13} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      {dense && (title || status) ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {title}
          {status}
        </View>
      ) : null}
    </View>
  );
}

/** A finished card at its day's foot: still openable, no longer in the way. */
function DoneRow({ theme, card, onOpen }: { theme: PluginTheme; card: BoardCard; onOpen(): void }) {
  const key = card.source === "github" ? `${card.github?.repo}#${card.github?.number}` : card.jiraKey;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.title}, finished`} onPress={onOpen} hitSlop={2} style={{ paddingVertical: 2 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, textDecorationLine: "line-through" }} numberOfLines={1}>
        {key ? `${key} ` : ""}
        {card.title}
      </Text>
    </Pressable>
  );
}

/**
 * Today's column with nothing live: a finished day, not a blank one. The
 * check lands with a single settle, then holds still. Clearing the board is
 * its one earned celebration, so it never loops and respects reduce-motion.
 */
export function ClearedNote({ theme, done }: { theme: PluginTheme; done: number }) {
  const reduceMotion = useReduceMotion();
  const settle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      settle.setValue(1);
      return;
    }
    const animation = Animated.spring(settle, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [settle, reduceMotion]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingHorizontal: 6, paddingVertical: 8 }}>
      <Animated.View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: theme.colors.statusSuccess,
          alignItems: "center",
          justifyContent: "center",
          opacity: settle,
          transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}
      >
        <Icon name="Check" size={10} color={theme.colors.surface0} />
      </Animated.View>
      <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>Day's clear</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{done} done</Text>
    </View>
  );
}

export interface WeekGridProps {
  theme: PluginTheme;
  /** Monday of the visible week. */
  week: string;
  today: string;
  /** Every card; columns pick out their own. */
  cards: BoardCard[];
  /** Width the grid may occupy; the grid scrolls horizontally below its minimum. */
  available: number;
  droppable: boolean;
  renderCard(card: BoardCard, options: RenderCardOptions): ReactNode;
  onArchiveAll(group: CardGroup): void;
  onOpenCard(cardId: string): void;
  onDrop(target: DropTarget): void;
}

export function WeekGrid({
  theme,
  week,
  today,
  cards,
  available,
  droppable,
  renderCard,
  onArchiveAll,
  onOpenCard,
  onDrop,
}: WeekGridProps) {
  const days = useMemo(() => weekDays(week), [week]);
  const weekend = useMemo(() => weekendOccupied(cards, week), [cards, week]);
  const widths = weekWidths(available, weekend);
  const backlog = useMemo(() => columnCards(cards, null), [cards]);
  // A weekend column stays slim until it holds something, then sizes up.
  const widthOf = (day: string) => (isWeekend(day) && !weekend[day === days[6] ? 1 : 0] ? widths.slim : widths.day);

  return (
    <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ flexDirection: "row" }}>
      <View style={{ width: widths.total }}>
        <View style={{ flexDirection: "row", height: HEADER_HEIGHT }}>
          <View
            style={{
              width: widths.backlog,
              height: HEADER_HEIGHT,
              justifyContent: "flex-end",
              paddingHorizontal: 10,
              paddingBottom: 4,
              flexDirection: "row",
              alignItems: "baseline",
              gap: 6,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>Backlog</Text>
            {backlog.length > 0 ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{backlog.length} parked</Text>
            ) : null}
          </View>
          {days.map((day, index) => (
            <DayHeader
              key={day}
              theme={theme}
              day={day}
              weekday={WEEKDAYS[index]}
              isToday={day === today}
              width={widthOf(day)}
              done={doneOn(cards, day).length}
            />
          ))}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "stretch" }}>
            <Column
              theme={theme}
              cards={cards}
              day={null}
              width={widths.backlog}
              droppable={droppable}
              emphasized={false}
              dimmed={false}
              renderCard={renderCard}
              onArchiveAll={onArchiveAll}
              onOpenCard={onOpenCard}
              onDrop={onDrop}
            />
            {days.map((day) => (
              <Column
                key={day}
                theme={theme}
                cards={cards}
                day={day}
                width={widthOf(day)}
                droppable={droppable}
                emphasized={day === today}
                // Today is the glance's landing spot; its siblings recede a step.
                dimmed={day !== today && !droppable}
                renderCard={renderCard}
                onArchiveAll={onArchiveAll}
                onOpenCard={onOpenCard}
                onDrop={onDrop}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function DayHeader({
  theme,
  day,
  weekday,
  isToday,
  width,
  done,
}: {
  theme: PluginTheme;
  day: string;
  weekday: string;
  isToday: boolean;
  width: number;
  done: number;
}) {
  const date = day.slice(8);
  const tint = isToday ? theme.colors.foreground : theme.colors.foregroundMuted;
  const border = { borderLeftWidth: 1, borderLeftColor: theme.colors.border };
  if (width <= 44) {
    // Slim weekend: a date tab, still a place a card can land.
    return (
      <View style={{ ...border, width, height: HEADER_HEIGHT, alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 }}>
        <Text style={{ color: tint, fontSize: 9, fontWeight: "600", letterSpacing: 0.3 }}>{isToday ? "Today" : weekday}</Text>
        <Text style={{ color: tint, fontSize: 10 }}>{date}</Text>
      </View>
    );
  }
  return (
    <View
      style={{
        ...border,
        width,
        height: HEADER_HEIGHT,
        justifyContent: "flex-end",
        paddingHorizontal: 8,
        paddingBottom: 4,
        borderBottomWidth: isToday ? 2 : 1,
        borderBottomColor: isToday ? theme.colors.accent : theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        <Text style={{ color: tint, fontSize: 11, fontWeight: "600", letterSpacing: 0.3 }}>{isToday ? "Today" : weekday}</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{date}</Text>
        {done > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Icon name="Check" size={11} color={theme.colors.statusSuccess} />
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{done} done</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Column({
  theme,
  cards,
  day,
  width,
  droppable,
  emphasized,
  dimmed,
  renderCard,
  onArchiveAll,
  onOpenCard,
  onDrop,
}: Omit<WeekGridProps, "week" | "today" | "available"> & {
  day: string | null;
  width: number;
  emphasized: boolean;
  dimmed: boolean;
}) {
  const live = useMemo(() => columnCards(cards, day), [cards, day]);
  const done = useMemo(() => (day === null ? [] : doneOn(cards, day)), [cards, day]);
  const cleared = emphasized && live.length === 0 && done.length > 0 ? { done: done.length } : null;
  return (
    <View
      style={{
        width,
        borderLeftWidth: 1,
        borderLeftColor: theme.colors.border,
        opacity: dimmed ? 0.8 : 1,
      }}
    >
      <ColumnBody
        theme={theme}
        day={day}
        live={live}
        done={done}
        dense
        droppable={droppable}
        cleared={cleared}
        renderCard={renderCard}
        onArchiveAll={onArchiveAll}
        onOpenCard={onOpenCard}
        // Empty column space means "this column"; a row's own tap carries the row index.
        onDrop={(columnDay) => onDrop({ day: columnDay, rowIndex: null })}
      />
    </View>
  );
}

/** The stacked layout's column title: what the chip strip selected. */
export function ColumnHeading({
  theme,
  title,
  subtitle,
  done,
}: {
  theme: PluginTheme;
  title: string;
  subtitle: string | null;
  done: number;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2, gap: 8 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>{title}</Text>
      {subtitle ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{subtitle}</Text> : null}
      {done > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Icon name="Check" size={11} color={theme.colors.statusSuccess} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{done} done</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The first-run state: the board is empty, so teach the ritual instead of drawing eight empty columns. */
export function EmptyBoard({
  theme,
  onAddFromChannel,
  onNewPrompt,
}: {
  theme: PluginTheme;
  onAddFromChannel(): void;
  onNewPrompt(): void;
}) {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>What's this week?</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        Capture below and it lands in the Backlog. Then pick a card up (long-press, or the grip on hover) and tap a day.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add from a tracker"
          onPress={onAddFromChannel}
          style={{ backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" }}>Add from Jira</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New prompt card"
          onPress={onNewPrompt}
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
        >
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>New prompt card</Text>
        </Pressable>
      </View>
    </View>
  );
}
