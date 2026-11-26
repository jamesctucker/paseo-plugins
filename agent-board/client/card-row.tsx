import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import type { PrSignal } from "../shared/pr-signal";
import { formatElapsed } from "../shared/day";
import { Chip, PulseDot, SourceTag, agentLabel, monoFont, sourceGlyph, statusColor, useReduceMotion } from "./ui";
import type { AgentEntry } from "./agent-directory";

/**
 * A card on the board: one meta line (source glyph and tag, mono key,
 * tracker badge, live chip, chevron) over a full-width title. The key always
 * truncates to a single line, so titles align down the list regardless of
 * identifier length. Long-press (or the hover grip on desktop) enters the
 * tap-to-place reorder flow; the chevron always means detail and the live
 * chip is the agent shortcut.
 *
 * `dense` is the week grid's anatomy: the same information in a narrow day
 * column, with the meta line allowed to wrap and the chips moved under the
 * title. `showSelect` adds the multi-select circle; the row's own tap keeps
 * its meaning and the parent decides what a tap does while selecting.
 */

/** How long after creation a card still counts as "just added" for the rise. */
const LANDING_WINDOW_MS = 1_200;

export interface CardRowProps {
  theme: PluginTheme;
  card: BoardCard;
  agent: AgentEntry | null;
  runStartedAt: number | null;
  now: number;
  /** Picked up for a move, or selected: the card reads as in-hand. */
  active: boolean;
  compact: boolean;
  /** Week-grid anatomy: narrower, wrapping meta line, chips under the title. */
  dense?: boolean;
  /** Rendered under a group header: the header carries the key and status. */
  grouped?: boolean;
  /** Multi-select circle is visible on this row (a live session, or the backlog's standing circle). */
  showSelect?: boolean;
  selected?: boolean;
  onPress(): void;
  onLongPress?(): void;
  onOpenAgent?(): void;
  onToggleSelect?(): void;
  /** The title of an unlinked agent (or its workspace) naming this card. */
  suggestion?: string | null;
  onLinkSuggestion?(): Promise<void>;
  onDeclineSuggestion?(): void;
  /** Host-supplied CI/review posture, when the card's run workspace has the PR. */
  prSignal?: PrSignal | null;
  /** The card's issue carries a note (see shared/notes.ts). */
  hasNote?: boolean;
}

export function CardRow({
  theme,
  card,
  agent,
  runStartedAt,
  now,
  active,
  compact,
  dense = false,
  grouped,
  showSelect = false,
  selected = false,
  onPress,
  onLongPress,
  onOpenAgent,
  onToggleSelect,
  suggestion,
  onLinkSuggestion,
  onDeclineSuggestion,
  prSignal,
  hasNote,
}: CardRowProps) {
  const [hovered, setHovered] = useState(false);
  // RN-web ends the card's hover when the pointer enters a nested pressable
  // (its hover "contain" lock), which would unmount the grip the moment the
  // pointer reached it. The grip's own hover keeps it alive across that handoff.
  const [gripHover, setGripHover] = useState(false);
  const [linking, setLinking] = useState(false);
  // A card born seconds ago lands with a short rise instead of teleporting in.
  // createdAt, not a mount flag: reorders and relayouts never replay it.
  const [landing] = useState(() => Date.now() - Date.parse(card.createdAt) < LANDING_WINDOW_MS);
  const reduceMotion = useReduceMotion();
  const appear = useRef(new Animated.Value(landing && !reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (!landing || reduceMotion) {
      appear.setValue(1);
      return;
    }
    const animation = Animated.timing(appear, { toValue: 1, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [appear, landing, reduceMotion]);
  const inHand = active || selected;
  const styles = useMemo(
    () => ({
      card: {
        marginHorizontal: dense ? 4 : 8,
        marginVertical: dense ? 3 : 4,
        paddingHorizontal: dense ? 8 : 12,
        paddingVertical: dense ? 8 : 10,
        gap: dense ? 4 : 6,
        borderRadius: dense ? 8 : 10,
        backgroundColor: inHand ? theme.colors.surface2 : theme.colors.surface1,
        borderWidth: 1,
        borderColor: inHand ? theme.colors.accent : theme.colors.border,
      },
      meta: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: dense ? 4 : 8,
        rowGap: 2,
        flexWrap: dense ? ("wrap" as const) : ("nowrap" as const),
      },
      key: {
        color: theme.colors.foregroundMuted,
        fontSize: dense ? 10 : 12,
        fontFamily: monoFont,
        flexShrink: 1,
      },
      /** The half of a pull reference that must survive truncation. */
      keyFixed: {
        color: theme.colors.foregroundMuted,
        fontSize: dense ? 10 : 12,
        fontFamily: monoFont,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: dense ? 13 : 14,
        fontWeight: "500" as const,
      },
      spacer: { flex: 1 },
    }),
    [theme, inHand, dense],
  );

  // A day column has no room for the owner; the repo and number still name the pull.
  const repoName = dense ? (card.github?.repo.split("/").pop() ?? card.github?.repo) : card.github?.repo;
  const keyText = grouped ? null : card.source === "github" ? repoName : card.jiraKey ?? null;
  const chipBody = liveChip(theme, card, agent, runStartedAt, now);
  const chip = agent && onOpenAgent && chipBody ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Open agent" onPress={onOpenAgent} hitSlop={6}>
      {chipBody}
    </Pressable>
  ) : (
    chipBody
  );
  const statusChip =
    !grouped && card.jiraStatus ? (
      // Long tracker statuses ("Developer Review") are the meta line's
      // most expendable element, so they ellipsize before anything else.
      <Chip theme={theme} text={card.jiraStatus} color={theme.colors.foregroundMuted} style={{ flexShrink: 1 }} />
    ) : null;
  // Host CI/review posture: problems named, success quiet.
  const chips = (
    <>
      {statusChip}
      {prSignal?.checksStatus === "failure" ? (
        <Chip theme={theme} text={prSignal.failedChecks > 0 ? `CI ✗${prSignal.failedChecks}` : "CI ✗"} color={theme.colors.statusDanger} />
      ) : null}
      {prSignal?.checksStatus === "success" ? <Chip theme={theme} text="CI ✓" color={theme.colors.statusSuccess} /> : null}
      {prSignal?.checksStatus === "pending" ? <Chip theme={theme} text="CI …" color={theme.colors.foregroundMuted} /> : null}
      {prSignal?.reviewDecision === "changes_requested" ? <Chip theme={theme} text="Changes" color={theme.colors.statusWarning} /> : null}
      {chip}
    </>
  );
  const hasChips =
    Boolean(statusChip) || Boolean(prSignal?.checksStatus) || prSignal?.reviewDecision === "changes_requested" || chipBody !== null;

  return (
    <Animated.View
      style={{
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }) }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasNote ? `${card.title}, has note` : card.title}
        onPress={onPress}
        onLongPress={onLongPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [
          styles.card,
          { opacity: pressed ? 0.8 : 1, transform: [{ translateY: pressed ? 1 : 0 }] },
        ]}
      >
        <View style={styles.meta}>
          {showSelect && onToggleSelect ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${selected ? "Unselect" : "Select"} ${card.title}`}
              onPress={onToggleSelect}
              hitSlop={4}
            >
              <Icon name={selected ? "Check" : "Circle"} size={13} color={selected ? theme.colors.accent : theme.colors.foregroundMuted} />
            </Pressable>
          ) : null}
          {!compact && onLongPress && (hovered || active || gripHover) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reorder card"
              onPress={onLongPress}
              onHoverIn={() => setGripHover(true)}
              onHoverOut={() => setGripHover(false)}
              hitSlop={4}
            >
              <Icon name="GripVertical" size={12} color={theme.colors.foregroundMuted} />
            </Pressable>
          ) : null}
          <Icon name={sourceGlyph(card.source)} size={14} color={theme.colors.foregroundMuted} />
          <SourceTag theme={theme} source={card.source} />
          {/* The rote/creative doctrine lives on the card; unrouted is shown
              so a missing Route tag reads as a nudge, not an absence. */}
          {card.source === "linear" && !dense ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{card.route ?? "unrouted"}</Text>
          ) : null}
          {keyText ? (
            // A pull reference splits so the repo name truncates but the
            // number never does.
            <>
              <Text style={styles.key} numberOfLines={1}>
                {keyText}
              </Text>
              {card.source === "github" ? <Text style={styles.keyFixed}>#{card.github?.number}</Text> : null}
            </>
          ) : null}
          {hasNote ? <Icon name="FileText" size={12} color={theme.colors.foregroundMuted} /> : null}
          <View style={styles.spacer} />
          {dense ? null : chips}
          {dense ? null : <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />}
        </View>
        <Text style={styles.title} numberOfLines={dense ? 3 : 2}>
          {card.title}
        </Text>
        {dense && hasChips ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>{chips}</View> : null}
        {suggestion && onLinkSuggestion && onDeclineSuggestion ? (
          // An offer, not a link: the match is a title guess, so it waits for
          // a tap and a decline sticks for this card/agent pair.
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 2,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Icon name="Link" size={12} color={theme.colors.foregroundMuted} />
            <Text style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
              {/* A day column has no room for the agent's title; the offer keeps its label. */}
              {dense ? "Agent match" : `Matching agent · ${suggestion}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Link agent ${suggestion} to this card`}
              disabled={linking}
              hitSlop={6}
              onPress={() => {
                setLinking(true);
                void onLinkSuggestion().finally(() => setLinking(false));
              }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600", opacity: linking ? 0.5 : 1 }}>
                {linking ? "Linking…" : "Link"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not this agent"
              disabled={linking}
              hitSlop={6}
              onPress={onDeclineSuggestion}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Not this</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function liveChip(
  theme: PluginTheme,
  card: BoardCard,
  agent: AgentEntry | null,
  runStartedAt: number | null,
  now: number,
) {
  if (!agent) return null;
  if (agent.requiresAttention) {
    return <Chip theme={theme} text={agentLabel(agent)} color={statusColor(theme, agent.attentionReason ?? "finished")} />;
  }
  if (agent.status === "running" || agent.status === "initializing") {
    const elapsed = runStartedAt ? formatElapsed(runStartedAt, now) : "just now";
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <PulseDot color={theme.colors.accent} />
        <Chip theme={theme} text={elapsed} color={theme.colors.accent} />
      </View>
    );
  }
  return null;
}
