import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutAnimation, Pressable, Text, View } from "react-native";
import type { z } from "zod";
import { listSkills, skillEntrySchema, SUGGESTION_FLOOR } from "../shared/contracts";
import { dismissBanner, useRadar } from "./store";

type SkillEntry = z.infer<typeof skillEntrySchema>;
type Catalog = z.infer<typeof listSkills.output>;

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: Catalog }
  | { status: "error"; message: string };

const CATEGORY_LABEL_SIZE = 11;

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

export function SkillRadarScreen({ theme, layout }: PluginScreenProps) {
  const radar = useRadar();
  const toast = useToast();
  const fetchCatalog = useRpc(listSkills);
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
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

  const styles = useMemo(() => {
    const { colors } = theme;
    return {
      screen: { flex: 1, backgroundColor: colors.surface0 },
      content: {
        padding: layout.compact ? 12 : 16,
        paddingBottom: 32,
        gap: layout.compact ? 14 : 18,
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
      zoneA: { gap: layout.compact ? 6 : 8 },
      card: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
        paddingVertical: layout.compact ? 9 : 10,
        paddingHorizontal: layout.compact ? 10 : 12,
        gap: 3,
      },
      cardPressed: { backgroundColor: colors.surface2 },
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
        paddingVertical: layout.compact ? 8 : 9,
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
  }, [theme, layout.compact]);

  const skills = useMemo(() => (catalog.status === "ready" ? catalog.catalog.skills : []), [catalog]);
  const groups = useMemo(() => groupSkills(skills), [skills]);
  const activeState = radar.activeAgentId ? radar.states[radar.activeAgentId] : undefined;
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
            suggestions.map((match, index) => {
              const skill = skills.find((entry) => entry.name === match.name);
              const isTop = index === 0;
              const showCopy = layout.compact || hovered === match.name || copied === match.name;
              return (
                <Pressable
                  key={match.name}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy ${match.name}, ${match.confidence} percent match`}
                  onPress={() => void copySkill(match.name)}
                  onHoverIn={() => setHovered(match.name)}
                  onHoverOut={() => setHovered((current) => (current === match.name ? null : current))}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.name, { fontSize: isTop ? (layout.compact ? 14 : 15) : 13.5 }]}>
                      {match.name}
                    </Text>
                    <View
                      style={[
                        styles.score,
                        match.confidence > 90 && {
                          borderColor: theme.colors.accent,
                        },
                      ]}
                    >
                      <Text style={[styles.scoreText, isTop && { fontWeight: "700" }]}>{match.confidence}%</Text>
                    </View>
                  </View>
                  <View style={styles.triggerRow}>
                    <Text style={styles.trigger} numberOfLines={layout.compact ? 1 : 2}>
                      {skill ? triggerLabel(skill) : "Matched from your recent messages"}
                    </Text>
                    {showCopy ? (
                      <Icon
                        name={copied === match.name ? "Check" : "Copy"}
                        size={13}
                        color={copied === match.name ? theme.colors.accent : theme.colors.foregroundMuted}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })
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
                    ? group.skills.map((skill) => {
                        const hoveredRow = hovered === skill.name;
                        return (
                          <Pressable
                            key={skill.name}
                            accessibilityRole="button"
                            accessibilityLabel={`Copy ${skill.name}`}
                            onPress={() => void copySkill(skill.name)}
                            onHoverIn={() => setHovered(skill.name)}
                            onHoverOut={() => setHovered((current) => (current === skill.name ? null : current))}
                            style={[styles.skillRow, hoveredRow && styles.skillRowHovered]}
                          >
                            <Text style={[styles.skillName, skill.auto && { color: theme.colors.foregroundMuted }]}>
                              {skill.name}
                            </Text>
                            {skill.auto ? (
                              <View style={styles.autoBadge}>
                                <Text style={styles.autoText}>auto</Text>
                              </View>
                            ) : (
                              <Text style={styles.skillMeta} numberOfLines={1}>
                                {triggerLabel(skill)}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              );
            })
          : null}
      </View>
    </ScrollView>
  );
}

export default SkillRadarScreen;
