import type { PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutAnimation, Pressable, Text, View } from "react-native";
import type { z } from "zod";
import { listSkills, skillEntrySchema, SUGGESTION_FLOOR } from "../shared/contracts";
import { requestAgentSuggestions } from "./controller";
import { dismissBanner, useRadar, type RadarMatch } from "./store";

type SkillEntry = z.infer<typeof skillEntrySchema>;
type Catalog = z.infer<typeof listSkills.output>;
type Theme = PluginAgentPanelProps["theme"];

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: Catalog }
  | { status: "error"; message: string };

const CATEGORY_LABEL_SIZE = 11;
/** Descriptions longer than this cannot fit the row's single line, so hover reveals the rest. */
const TRUNCATED_AT = 48;

function animateAccordion(platform: "ios" | "android" | "web") {
  if (platform === "web") return;
  try {
    LayoutAnimation.configureNext({
      duration: 150,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
  } catch {
    // A host without LayoutAnimation still gets an instant accordion.
  }
}

function triggerLabel(skill: SkillEntry): string {
  return skill.trigger ?? skill.description;
}

function groupSkills(skills: SkillEntry[]) {
  const groups: { category: string; skills: SkillEntry[] }[] = [];
  for (const skill of skills) {
    const last = groups[groups.length - 1];
    if (last && last.category === skill.category) last.skills.push(skill);
    else groups.push({ category: skill.category, skills: [skill] });
  }
  return groups;
}

function buildStyles(theme: Theme, compact: boolean) {
  const { colors } = theme;
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: {
      padding: compact ? 12 : 16,
      paddingBottom: 56,
      gap: compact ? 14 : 18,
    },
    topRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
    meta: { color: colors.foregroundMuted, fontSize: 11 },
    sectionLabel: {
      color: colors.foregroundMuted,
      fontSize: CATEGORY_LABEL_SIZE,
      fontWeight: "600" as const,
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
    },
    zoneA: { gap: compact ? 6 : 8 },
    card: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
      paddingVertical: compact ? 9 : 10,
      paddingHorizontal: compact ? 10 : 12,
      gap: 3,
    },
    cardPressed: { backgroundColor: colors.surface2 },
    lifted: { zIndex: 20, elevation: 20 },
    cardTop: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
    name: { color: colors.foreground, fontWeight: "600" as const },
    trigger: { color: colors.foregroundMuted, fontSize: 11.5, lineHeight: 15 },
    triggerRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
    score: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    scoreText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "600" as const,
      fontVariant: ["tabular-nums"] as ("tabular-nums" | "small-caps" | "oldstyle-nums" | "lining-nums" | "proportional-nums")[],
    },
    tooltip: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      zIndex: 30,
      elevation: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      paddingVertical: 7,
      paddingHorizontal: 9,
    },
    tooltipText: { color: colors.foreground, fontSize: 11.5, lineHeight: 16 },
    banner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    bannerText: { color: colors.foregroundMuted, fontSize: 12, flex: 1 },
    empty: { color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 },
    divider: { height: 1, backgroundColor: colors.border },
    accordionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: compact ? 8 : 9,
    },
    accordionTitle: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    categoryHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: 7,
      paddingHorizontal: 2,
    },
    categoryName: {
      color: colors.foregroundMuted,
      fontSize: CATEGORY_LABEL_SIZE,
      fontWeight: "600" as const,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
    },
    skillRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 12,
      minHeight: 28,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    skillRowHovered: { backgroundColor: colors.surface1 },
    skillName: { color: colors.foreground, fontSize: 13, flexShrink: 1 },
    skillNameAuto: { color: colors.foregroundMuted },
    skillMeta: { color: colors.foregroundMuted, fontSize: 11, flexShrink: 1, textAlign: "right" as const },
    autoBadge: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    autoText: { color: colors.foregroundMuted, fontSize: 10, fontWeight: "500" as const },
  };
}

type PanelStyles = ReturnType<typeof buildStyles>;

interface TooltipProps {
  text: string;
  top: number;
  styles: PanelStyles;
}

function Tooltip({ text, top, styles }: TooltipProps) {
  return (
    <View pointerEvents="none" style={[styles.tooltip, { top }]}>
      <Text style={styles.tooltipText}>{text}</Text>
    </View>
  );
}

interface SuggestionCardProps {
  match: RadarMatch;
  skill: SkillEntry | undefined;
  isTop: boolean;
  compact: boolean;
  copied: boolean;
  styles: PanelStyles;
  accent: string;
  onCopy(): void;
}

function SuggestionCard({ match, skill, isTop, compact, copied, styles, accent, onCopy }: SuggestionCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [height, setHeight] = useState(0);

  const description = skill?.description ?? null;
  const showCopy = compact || hovered || copied;
  const showTooltip = description !== null && description.length > TRUNCATED_AT && (hovered || pinned);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${match.name}, ${match.confidence} percent match`}
      accessibilityHint="Shows the full description on hover or long press"
      onPress={() => {
        setPinned(false);
        onCopy();
      }}
      onLongPress={() => setPinned((value) => !value)}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, showTooltip && styles.lifted]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.name, { fontSize: isTop ? (compact ? 14 : 15) : 13.5 }]}>{match.name}</Text>
        <View style={[styles.score, match.confidence > 90 && { borderColor: accent }]}>
          <Text style={[styles.scoreText, isTop && { fontWeight: "700" }]}>{match.confidence}%</Text>
        </View>
      </View>
      <View style={styles.triggerRow}>
        <Text style={styles.trigger} numberOfLines={compact ? 1 : 2}>
          {skill ? triggerLabel(skill) : "Matched from your recent messages"}
        </Text>
        {showCopy ? (
          <Icon name={copied ? "Check" : "Copy"} size={13} color={copied ? accent : styles.trigger.color} />
        ) : null}
      </View>

      {showTooltip && description ? <Tooltip text={description} top={height + 6} styles={styles} /> : null}
    </Pressable>
  );
}

interface CatalogRowProps {
  skill: SkillEntry;
  styles: PanelStyles;
  onCopy(): void;
}

function CatalogRow({ skill, styles, onCopy }: CatalogRowProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [height, setHeight] = useState(0);

  const showTooltip = skill.description.length > TRUNCATED_AT && (hovered || pinned);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${skill.name}`}
      accessibilityHint="Shows the full description on hover or long press"
      onPress={() => {
        setPinned(false);
        onCopy();
      }}
      onLongPress={() => setPinned((value) => !value)}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.skillRow, hovered && styles.skillRowHovered, showTooltip && styles.lifted]}
    >
      <Text style={[styles.skillName, skill.auto && styles.skillNameAuto]}>{skill.name}</Text>
      {skill.auto ? (
        <View style={styles.autoBadge}>
          <Text style={styles.autoText}>auto</Text>
        </View>
      ) : (
        <Text style={styles.skillMeta} numberOfLines={1}>
          {triggerLabel(skill)}
        </Text>
      )}

      {showTooltip ? <Tooltip text={skill.description} top={height + 6} styles={styles} /> : null}
    </Pressable>
  );
}

export function SkillRadarPanel({ theme, layout, agentId, workspaceId }: PluginAgentPanelProps) {
  const radar = useRadar();
  const toast = useToast();
  const fetchCatalog = useRpc(listSkills);
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      try {
        const next = await fetchCatalog({ refresh });
        setCatalog({ status: "ready", catalog: next });
      } catch {
        setCatalog({ status: "error", message: "Could not read the skills directory" });
      }
    },
    [fetchCatalog],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    // Paseo remounts or re-renders this panel with the focused agent when the user switches tabs.
    requestAgentSuggestions(agentId, workspaceId);
  }, [agentId, workspaceId]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copySkill = useCallback(
    async (name: string) => {
      try {
        await copyText(name);
        setCopied(name);
        toast.show(`Copied \`${name}\``, { variant: "success", durationMs: 2_000 });
      } catch {
        toast.error("Could not copy to the clipboard");
      }
    },
    [toast],
  );

  const styles = useMemo(() => buildStyles(theme, layout.compact), [theme, layout.compact]);
  const skills = useMemo(() => (catalog.status === "ready" ? catalog.catalog.skills : []), [catalog]);
  const groups = useMemo(() => groupSkills(skills), [skills]);
  const activeState = radar.states[agentId] ?? null;
  const suggestions = (activeState?.matches ?? []).filter((match) => match.confidence >= SUGGESTION_FLOOR);
  const showBanner = activeState?.status === "unavailable" && !radar.bannerDismissed;

  const toggleCategory = (category: string) => {
    animateAccordion(layout.platform);
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {showBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Classification unavailable — showing catalog only.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss warning" onPress={dismissBanner}>
            <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
      ) : null}

      {activeState?.status === "unavailable" ? null : (
        <View style={styles.zoneA}>
          <View style={styles.topRow}>
            <Text style={styles.sectionLabel}>Relevant now</Text>
            {activeState?.status === "analyzing" ? <Text style={styles.meta}>Analyzing…</Text> : null}
          </View>

          {activeState?.status === "ready" && suggestions.length > 0 ? (
            suggestions.map((match, index) => (
              <SuggestionCard
                key={match.name}
                match={match}
                skill={skills.find((entry) => entry.name === match.name)}
                isTop={index === 0}
                compact={layout.compact}
                copied={copied === match.name}
                styles={styles}
                accent={theme.colors.accent}
                onCopy={() => void copySkill(match.name)}
              />
            ))
          ) : (
            <Text style={styles.empty}>
              {activeState?.status === "analyzing"
                ? "Analyzing context…"
                : activeState?.status === "ready"
                  ? "No strong matches yet — continue working."
                  : "No suggestions yet — continue working."}
            </Text>
          )}
        </View>
      )}

      <View style={styles.divider} />

      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`All skills, ${skills.length}`}
          onPress={() => {
            animateAccordion(layout.platform);
            setSkillsOpen((open) => !open);
          }}
          style={styles.accordionHeader}
        >
          <Text style={styles.accordionTitle}>
            All skills{catalog.status === "ready" ? ` (${skills.length})` : ""}
          </Text>
          <Icon name={skillsOpen ? "ChevronDown" : "ChevronRight"} size={15} color={theme.colors.foregroundMuted} />
        </Pressable>

        {catalog.status === "loading" ? <Text style={styles.empty}>Scanning skills…</Text> : null}
        {catalog.status === "error" ? <Text style={styles.empty}>{catalog.message}</Text> : null}

        {catalog.status === "ready" && skills.length === 0 ? (
          <Text style={styles.empty}>
            No skills found. Checked:
            {"\n"}
            {catalog.catalog.roots.join("\n")}
          </Text>
        ) : null}

        {skillsOpen && catalog.status === "ready"
          ? groups.map((group) => {
              const open = openCategories.has(group.category);
              return (
                <View key={group.category}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${group.category}, ${group.skills.length} skills`}
                    onPress={() => toggleCategory(group.category)}
                    style={styles.categoryHeader}
                  >
                    <Text style={styles.categoryName}>
                      {group.category} <Text style={styles.meta}>{group.skills.length}</Text>
                    </Text>
                    <Icon name={open ? "ChevronDown" : "ChevronRight"} size={13} color={theme.colors.foregroundMuted} />
                  </Pressable>

                  {open
                    ? group.skills.map((skill) => (
                        <CatalogRow
                          key={skill.name}
                          skill={skill}
                          styles={styles}
                          onCopy={() => void copySkill(skill.name)}
                        />
                      ))
                    : null}
                </View>
              );
            })
          : null}
      </View>
    </ScrollView>
  );
}

export default SkillRadarPanel;
