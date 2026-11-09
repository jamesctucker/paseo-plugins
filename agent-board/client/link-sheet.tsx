import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { formatRelative } from "../shared/day";
import { linkPickerAgents } from "../shared/links";
import type { BoardCard } from "../shared/settings";
import { useWorkspaceTitles, type AgentEntry } from "./agent-directory";
import { GroupLabel, agentColor, agentLabel } from "./ui";

/**
 * Pick an agent the board didn't start and make it this card's latest run.
 * Agents whose title (or workspace title) names the card lead; everything else unlinked follows
 * by recency, so an agent with a generic title is still one search away.
 */

export interface LinkSheetProps {
  theme: PluginTheme;
  card: BoardCard;
  cards: readonly BoardCard[];
  agents: ReadonlyMap<string, AgentEntry>;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Resolves null when linked, or the reason it failed. */
  onLink(agent: AgentEntry): Promise<string | null>;
}

export function LinkSheet({ theme, card, cards, agents, open, onOpenChange, onLink }: LinkSheetProps) {
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPendingId(null);
    setError(null);
  }, [open]);

  const workspaceTitles = useWorkspaceTitles(agents);
  const { matches, others } = linkPickerAgents(card, cards, agents, workspaceTitles);
  const workspaceOf = (agent: AgentEntry) => (agent.workspaceId ? workspaceTitles.get(agent.workspaceId) : undefined) || null;
  const needle = query.trim().toLowerCase();
  const filter = (list: AgentEntry[]) =>
    needle
      ? list.filter((agent) => `${agent.title ?? ""} ${workspaceOf(agent) ?? ""}`.toLowerCase().includes(needle))
      : list;
  const shownMatches = filter(matches);
  const shownOthers = filter(others);
  const now = Date.now();

  async function pick(agent: AgentEntry) {
    if (pendingId) return;
    setPendingId(agent.id);
    setError(null);
    const reason = await onLink(agent);
    setPendingId(null);
    if (reason) setError(reason);
    else onOpenChange(false);
  }

  function row(agent: AgentEntry) {
    return (
      <Pressable
        key={agent.id}
        accessibilityRole="button"
        accessibilityLabel={`Link ${agent.title ?? "untitled agent"}`}
        disabled={pendingId !== null}
        onPress={() => void pick(agent)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 8,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: agentColor(theme, agent) }} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
            {agent.title ?? "Untitled agent"}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }} numberOfLines={1}>
            {[workspaceOf(agent), agentLabel(agent), formatRelative(Date.parse(agent.updatedAt), now)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {pendingId === agent.id ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
      </Pressable>
    );
  }

  return (
    <Modal
      title="Link an existing agent"
      icon={<Icon name="Link" size={16} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
        <View style={{ flexShrink: 1, padding: 24, paddingTop: 16, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Icon name="Search" size={14} color={theme.colors.foregroundMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search agents…"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={{ flex: 1, color: theme.colors.foreground, paddingVertical: 9, fontSize: 13 }}
            />
          </View>
          {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text> : null}
          <ScrollView style={{ flexShrink: 1, maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {shownMatches.length > 0 ? (
              <View style={{ gap: 2, paddingBottom: 10 }}>
                <GroupLabel theme={theme} text="Names this card" />
                {shownMatches.map(row)}
              </View>
            ) : null}
            {shownOthers.length > 0 ? (
              <View style={{ gap: 2 }}>
                <GroupLabel theme={theme} text={shownMatches.length > 0 ? "Other agents" : "Agents"} />
                {shownOthers.map(row)}
              </View>
            ) : null}
            {shownMatches.length === 0 && shownOthers.length === 0 ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 10 }}>
                {needle ? "No agents match." : "No unlinked agents right now."}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal.Content>
    </Modal>
  );
}
