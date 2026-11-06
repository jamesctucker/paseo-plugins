import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { launchTeacher, listRepos } from "../shared/quiz";
import { getFocusesForRepo } from "../shared/focuses";

export function QuizScreen({ theme, layout, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const list = useRpc(listRepos);
  const launch = useRpc(launchTeacher);
  const reposQuery = useQuery({
    queryKey: ["code-quiz-repos"],
    queryFn: () => list({}),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState("");
  // A short success beat between launch and navigation: the screen's last
  // impression should be "it worked", not a waiting state.
  const [launched, setLaunched] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [],
  );

  const focuses = getFocusesForRepo(selected);
  // Custom text wins over a chip: typing is the stronger signal of intent.
  // Neither input destroys the other — the summary line shows which one applies.
  const trimmedTopic = topic.trim();
  const selectedFocus = focuses.find((focus) => focus.id === focusId);

  // Restore last visit's selection once, when the repo list arrives.
  const restored = useRef(false);
  useEffect(() => {
    const data = reposQuery.data;
    if (!data?.last || restored.current) return;
    restored.current = true;
    if (data.repos.some((repo) => repo.name === data.last?.repo)) setSelected(data.last.repo);
    if (data.last.focusId) setFocusId(data.last.focusId);
    if (data.last.topic) setTopic(data.last.topic);
  }, [reposQuery.data]);

  // Cancel releases the UI immediately; if the launch RPC lands anyway, the
  // orphaned teacher agent is archived so a cancel never strands a session.
  const cancelled = useRef(false);
  const mutation = useMutation({
    mutationFn: (repo: string) =>
      launch({
        repo,
        focusId: selectedFocus?.id,
        topic: trimmedTopic ? trimmedTopic : undefined,
      }),
    onMutate: () => {
      cancelled.current = false;
    },
    onSuccess: (result) => {
      if (cancelled.current) {
        void paseo.agents.ref(result.agentId).archive().catch(() => {});
        return;
      }
      setLaunched(true);
      navigationTimer.current = setTimeout(
        () => navigation?.openAgent({ agentId: result.agentId }),
        700,
      );
    },
  });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      content: {
        padding: layout.compact ? 16 : 24,
        paddingBottom: 32,
        gap: 24,
      },
      section: { gap: 8 },
      loadingRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      heading: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 22 : 28,
        fontWeight: "700" as const,
      },
      hint: { color: theme.colors.foregroundMuted, fontSize: 14 },
      sectionLabel: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: "600" as const,
        textTransform: "uppercase" as const,
        letterSpacing: 1,
      },
      repoGrid: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      repoRow: {
        flexGrow: 1,
        flexBasis: layout.compact ? ("100%" as const) : 180,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      repoRowSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface2,
      },
      repoName: { color: theme.colors.foreground, fontSize: 15 },
      repoNameSelected: { fontWeight: "600" as const },
      chipRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      chip: {
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      chipSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface2,
      },
      chipOverridden: { opacity: 0.5 },
      chipText: { color: theme.colors.foreground, fontSize: 14 },
      chipTextSelected: { fontWeight: "600" as const },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 12,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        fontSize: 15,
      },
      button: {
        padding: 14,
        borderRadius: 10,
        backgroundColor: theme.colors.accent,
        alignItems: "center" as const,
      },
      buttonInner: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      buttonDisabled: { opacity: 0.5 },
      buttonText: { color: theme.colors.accentForeground, fontSize: 15, fontWeight: "600" as const },
      summary: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
      success: { color: theme.colors.statusSuccess, fontSize: 14 },
      retry: { color: theme.colors.accent, fontSize: 14 },
      error: { color: theme.colors.statusDanger, fontSize: 14 },
    }),
    [theme, layout.compact],
  );

  const repos = reposQuery.data?.repos ?? [];
  const trimmedFilter = filter.trim().toLowerCase();
  const visibleRepos = trimmedFilter
    ? repos.filter((repo) => repo.name.toLowerCase().includes(trimmedFilter))
    : repos;
  const canLaunch = selected !== null && !mutation.isPending && !launched;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Quiz me on a repo</Text>
      <Text style={styles.hint}>
        Pick a repo from work/ and a teacher agent will quiz you on its code, then turn your
        answers into lessons.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Pick a repo</Text>
        {reposQuery.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.foregroundMuted} />
            <Text style={styles.hint}>Loading repos…</Text>
          </View>
        ) : null}
        {reposQuery.isError ? (
          <View style={{ gap: 4 }}>
            <Text style={styles.error}>Couldn&apos;t read the repos under work/ on this host.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading repos"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => reposQuery.refetch()}
            >
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {reposQuery.isSuccess && repos.length === 0 ? (
          <Text style={styles.hint}>No repos found under work/ on this host.</Text>
        ) : null}
        {repos.length > 6 ? (
          <TextInput
            value={filter}
            onChangeText={setFilter}
            accessibilityLabel="Filter repos"
            placeholder="Filter repos…"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
          />
        ) : null}
        <View style={styles.repoGrid}>
          {visibleRepos.map((repo) => (
            <Pressable
              key={repo.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === repo.name }}
              accessibilityLabel={`Select repo ${repo.name}`}
              onPress={() => {
                setSelected(repo.name);
                setFocusId(null);
              }}
              style={[styles.repoRow, selected === repo.name ? styles.repoRowSelected : null]}
            >
              <Text
                numberOfLines={1}
                style={[styles.repoName, selected === repo.name ? styles.repoNameSelected : null]}
              >
                {repo.name}
              </Text>
            </Pressable>
          ))}
        </View>
        {trimmedFilter && visibleRepos.length === 0 ? (
          <Text style={styles.hint}>No repos match &quot;{filter.trim()}&quot;.</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Pick a focus (optional)</Text>
        <View style={styles.chipRow}>
          {focuses.map((focus) => (
            <Pressable
              key={focus.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: focusId === focus.id && !trimmedTopic }}
              accessibilityLabel={`Focus on ${focus.label}`}
              onPress={() => setFocusId(focusId === focus.id ? null : focus.id)}
              style={[
                styles.chip,
                focusId === focus.id && !trimmedTopic ? styles.chipSelected : null,
                focusId === focus.id && trimmedTopic ? styles.chipOverridden : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  focusId === focus.id && !trimmedTopic ? styles.chipTextSelected : null,
                ]}
              >
                {focus.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={topic}
          onChangeText={(value) => {
            setTopic(value);
            if (value) setFocusId(null);
          }}
          accessibilityLabel="Custom focus"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (canLaunch && selected) mutation.mutate(selected);
          }}
          placeholder="or type your own focus"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
        />
      </View>

      {selected ? (
        <Text style={styles.summary}>
          {`Quiz: ${selected} — ${
            trimmedTopic
              ? `"${trimmedTopic}"${selectedFocus ? ` (overrides the ${selectedFocus.label} chip)` : ""}`
              : (selectedFocus?.label ?? "a general tour")
          }`}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start quiz"
        accessibilityState={{ disabled: !canLaunch }}
        accessibilityHint={selected === null ? "Pick a repo first" : undefined}
        disabled={!canLaunch}
        onPress={() => {
          if (selected) mutation.mutate(selected);
        }}
        style={[styles.button, canLaunch ? null : styles.buttonDisabled]}
      >
        <View style={styles.buttonInner}>
          {mutation.isPending ? (
            <ActivityIndicator color={theme.colors.accentForeground} />
          ) : null}
          <Text style={styles.buttonText}>
            {launched
              ? "Opening the chat…"
              : mutation.isPending
                ? "Waking up your teacher…"
                : "Start quiz"}
          </Text>
        </View>
      </Pressable>
      {mutation.isPending ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel launch"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            cancelled.current = true;
            mutation.reset();
          }}
          style={{ alignSelf: "center" }}
        >
          <Text style={styles.retry}>Cancel</Text>
        </Pressable>
      ) : null}
      {launched ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          ✓ Your teacher&apos;s in — opening the chat…
        </Text>
      ) : null}
      {selected === null && !mutation.isPending ? (
        <Text style={styles.hint}>Pick a repo above to start.</Text>
      ) : null}
      {mutation.isError ? (
        <Text style={styles.error} selectable accessibilityRole="alert">
          Couldn&apos;t start the quiz.{" "}
          {mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}
        </Text>
      ) : null}
    </ScrollView>
  );
}
