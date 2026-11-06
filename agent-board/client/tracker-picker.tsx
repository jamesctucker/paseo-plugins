import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Icon, Modal, ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { Chip, monoFont } from "./ui";
import type { IssueSummary } from "../shared/tracker";

/**
 * The one picker behind every tracker channel. Jira, GitHub, and Linear differ
 * only in how they fetch and what the copy says, so the row anatomy, search,
 * refresh, and pick lifecycle live here once.
 *
 * The key column is a hard `width` (set per channel) and the status column a
 * fixed container, so a long identifier truncates instead of wrapping mid-key
 * and a long status clips instead of reflowing the row: a vertical scan has
 * to stay a straight line, which is the only thing that makes a 25-row list
 * readable.
 */

const KEY_COLUMN = 76;
const STATUS_COLUMN = 116;
const ROW_MIN_HEIGHT = 44;
const SEARCH_DEBOUNCE_MS = 250;

export interface TrackerPickerProps {
  theme: PluginTheme;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Sheet title, e.g. "Add from Jira". */
  title: string;
  /** Lucide name for the channel glyph. */
  icon: string;
  searchPlaceholder: string;
  /** Shown when the tracker has nothing assigned and no search is active. */
  emptyMessage: string;
  /** Tracker keys already on the board; those rows stay visible but inert. */
  onBoard?: ReadonlySet<string>;
  /**
   * Hard width of the key column; GitHub's `owner/repo#123` identifiers need
   * roughly twice the Jira default.
   */
  keyColumnWidth?: number;
  list(): Promise<IssueSummary[]>;
  search(query: string): Promise<IssueSummary[]>;
  /** Resolves false when the card could not be saved; the sheet then stays open. */
  onPick(issue: IssueSummary): Promise<boolean>;
  onOpenSettings(): void;
}

export function TrackerPicker({
  theme,
  open,
  onOpenChange,
  title,
  icon,
  searchPlaceholder,
  emptyMessage,
  onBoard,
  keyColumnWidth = KEY_COLUMN,
  list,
  search,
  onPick,
  onOpenSettings,
}: TrackerPickerProps) {
  const toast = useToast();
  const { width } = useWindowDimensions();
  // The status column is the first thing to give up width on a phone; the key
  // and the title keep theirs because they carry the row's identity.
  const statusColumn = width < 480 ? 84 : STATUS_COLUMN;
  const [items, setItems] = useState<IssueSummary[] | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Term changes race each other; only the newest response may land.
  const latestRequest = useRef(0);
  // A pick can outlive the sheet: the close reset wipes state while `onPick`
  // is still awaited, and a failure landing on a closed sheet must not write.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(
    async (query: string) => {
      const ticket = ++latestRequest.current;
      setLoading(true);
      setError(null);
      try {
        const found = query ? await search(query) : await list();
        if (ticket === latestRequest.current) setItems(found);
      } catch (cause) {
        if (ticket === latestRequest.current) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (ticket === latestRequest.current) setLoading(false);
      }
    },
    [list, search],
  );

  // The list is a live mirror of what is assigned right now, so every open
  // re-queries instead of trusting the cache from the previous visit. Rows
  // already on screen stay put while a refresh lands.
  useEffect(() => {
    if (!open) return;
    const query = term.trim();
    const timer = setTimeout(() => void load(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [open, term, load]);

  useEffect(() => {
    if (open) return;
    setTerm("");
    setError(null);
    setNotice(null);
    setPendingKey(null);
  }, [open]);

  async function pick(issue: IssueSummary) {
    if (pendingKey !== null) return;
    setPendingKey(issue.identifier);
    setNotice(null);
    const added = await onPick(issue);
    setPendingKey(null);
    if (added) {
      onOpenChange(false);
      toast.show(`Added ${issue.identifier}`, { variant: "success" });
      return;
    }
    // The board owns the reason (its banner carries it); the sheet only has to
    // stop closing so the pick doesn't read as a success. If the user closed
    // the sheet mid-pick there is no sheet left to inform.
    if (openRef.current) setNotice(`Couldn't add ${issue.identifier}`);
  }

  const rows = items ?? [];
  const query = term.trim();
  const skeletons = loading && items === null && error === null;

  return (
    <Modal
      title={title}
      icon={<Icon name={icon} size={16} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0, flex: 1, minHeight: 0 }}>
        <View style={{ flex: 1, minHeight: 0 }}>
          {/*
           * The header row is the grid: the host insets its title icon 31.5pt
           * and the close glyph 44.5pt from the sheet edge (the extra 13 is
           * the scrollbar gutter), and the modal frame keeps ~5.5pt for
           * itself. Our insets are whatever is left after the frame, so the
           * field, the refresh icon, and the status column land exactly under
           * the header's edges instead of making the X look adrift.
           */}
          <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 26,
            paddingRight: 39,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            // Desktop wants the cursor in the field the moment the sheet opens;
            // on a phone that would raise the keyboard over the list instead.
            autoFocus={Platform.OS === "web"}
            accessibilityLabel={searchPlaceholder}
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
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setTerm("")}
            >
              <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Refresh ${title}`}
            accessibilityState={{ busy: loading }}
            hitSlop={8}
            disabled={loading}
            onPress={() => void load(query)}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
            ) : (
              <Icon name="RefreshCw" size={14} color={theme.colors.foregroundMuted} />
            )}
          </Pressable>
        </View>

        {notice ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 26, paddingBottom: 8 }}>
            {notice}
          </Text>
        ) : null}

        <ScrollView
          keyboardShouldPersistTaps="handled"
          // Asymmetric on purpose: rows land on the header's grid (icon column
          // left, close glyph right) once the 8pt row padding is added.
          contentContainerStyle={{ paddingLeft: 18, paddingRight: 31, paddingBottom: 12 }}
        >
          {error !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 8 }}>
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12, flexShrink: 1 }}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={() => void load(query)}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Try again</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open token config"
                onPress={() => {
                  onOpenChange(false);
                  onOpenSettings();
                }}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Open token config</Text>
              </Pressable>
            </View>
          ) : skeletons ? (
            <View>{[0, 1, 2, 3, 4, 5].map((row) => SkeletonRow(theme, row))}</View>
          ) : rows.length === 0 ? (
            <View style={{ padding: 8, gap: 6 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {query ? `No matches for “${query}”.` : emptyMessage}
              </Text>
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setTerm("")}>
                  <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Clear search</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            rows.map((issue) => (
              <Row
                key={issue.identifier}
                theme={theme}
                issue={issue}
                added={onBoard?.has(issue.identifier) ?? false}
                pending={pendingKey === issue.identifier}
                keyColumn={keyColumnWidth}
                statusColumn={statusColumn}
                onPick={pick}
              />
            ))
          )}
        </ScrollView>
        </View>
      </Modal.Content>
    </Modal>
  );
}

interface RowProps {
  theme: PluginTheme;
  issue: IssueSummary;
  /** Already on the board: visible but inert. */
  added: boolean;
  /** A pick is in flight for this row. */
  pending: boolean;
  keyColumn: number;
  statusColumn: number;
  onPick(issue: IssueSummary): Promise<void>;
}

/**
 * One picker row. Hover lives here (not in the picker) so a mouse sweep
 * re-renders the row it crosses, not all 25 rows.
 */
function Row({ theme, issue, added, pending, keyColumn, statusColumn, onPick }: RowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      disabled={added || pending}
      accessibilityRole="button"
      accessibilityLabel={`${issue.identifier}, ${issue.title}, ${issue.status}${added ? ", already on the board" : ""}`}
      accessibilityState={{ disabled: added, busy: pending }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => void onPick(issue)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: ROW_MIN_HEIGHT,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: hovered && !added ? theme.colors.surface1 : "transparent",
      }}
    >
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontFamily: monoFont,
          width: keyColumn,
          flexShrink: 0,
          opacity: added ? 0.6 : 1,
        }}
        numberOfLines={1}
      >
        {issue.identifier}
      </Text>
      <Text
        style={{
          flex: 1,
          minWidth: 0,
          color: added ? theme.colors.foregroundMuted : theme.colors.foreground,
          fontSize: 13,
          fontWeight: "500",
        }}
        numberOfLines={1}
      >
        {issue.title}
      </Text>
      <View style={{ width: statusColumn, alignItems: "flex-end" }}>
        {pending ? (
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
        ) : added ? (
          // Chip text sits 7pt inside its border (6 padding + 1 border); the
          // plain-text state insets to the same optical edge.
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, paddingRight: 7 }}>On board</Text>
        ) : issue.status ? (
          <Chip theme={theme} text={issue.status} color={theme.colors.foregroundMuted} style={{ maxWidth: statusColumn }} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** Two bars on the real row's grid, so the list doesn't resize when data lands. */
function SkeletonRow(theme: PluginTheme, key: number) {
  return (
    <View
      key={key}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: ROW_MIN_HEIGHT, paddingHorizontal: 8 }}
    >
      <View style={{ width: KEY_COLUMN, height: 9, borderRadius: 5, backgroundColor: theme.colors.surface2 }} />
      <View
        style={{
          flex: 1,
          maxWidth: 220 + key * 24,
          height: 9,
          borderRadius: 5,
          backgroundColor: theme.colors.surface2,
        }}
      />
      <View style={{ width: 56, height: 9, borderRadius: 5, backgroundColor: theme.colors.surface2 }} />
    </View>
  );
}
