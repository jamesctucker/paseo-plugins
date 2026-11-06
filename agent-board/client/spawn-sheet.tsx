import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/ui";
import { issueGetRpc, spawnPathCheckRpc } from "../shared/contracts";
import { jiraConfigDoc, linearConfigDoc, type BoardCard, type CardRun } from "../shared/settings";
import { resolveSpawnSpec, spawnOptions, type ProviderCatalogEntry } from "../shared/provider";
import { fullSeed, titleSeed } from "../shared/prompt";
import { GroupLabel, monoFont, sourceGlyph } from "./ui";

/**
 * Run flow as a form: pick the workspace, review the prompt, adjust model and
 * thinking, then one Run in a pinned footer. Nothing spawns on a row tap; the
 * most recent workspace is preselected so "open, ⌘↵" stays a two-key run.
 *
 * Pickers drill in (the sheet body swaps to a searchable list with a back
 * arrow) instead of expanding inline, so opening a long model list never
 * grows the sheet past its frame.
 */

export interface SpawnSheetProps {
  theme: PluginTheme;
  card: BoardCard | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSpawned(cardId: string, run: CardRun): void;
  /** Jump to the spawned agent's chat once it starts. */
  onOpenAgent?(agentId: string): void;
}

interface WorkspaceLite {
  id: string;
  name: string;
  directory: string | null;
  activityAt: string;
}

type SpawnSource =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "directory"; path: string }
  | { kind: "worktree"; number: number };

type SheetView = "form" | "workspace" | "model" | "thinking";

/** RN truncates single-line text at the tail, which hides exactly the directory
 *  names that tell two workspaces apart — keep both ends, cut the middle. */
function middleTruncate(text: string, max = 38): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Compact recency for workspace rows; past a week the date is shorter. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

function joinDetail(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

interface SelectFieldProps {
  theme: PluginTheme;
  label: string;
  value: string;
  detail: string;
  onPress(): void;
  disabled?: boolean;
  /** Small text action on the label line, e.g. Reset. Kept outside the field
   *  so it never nests a Pressable inside another. */
  action?: { label: string; onPress(): void };
}

function SelectField({ theme, label, value, detail, onPress, disabled, action }: SelectFieldProps) {
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 16 }}>
        <GroupLabel theme={theme} text={label} />
        {action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action.label} hitSlop={6} onPress={action.onPress}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityHint={disabled ? undefined : `Opens the ${label.toLowerCase()} list`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          opacity: disabled ? 0.55 : pressed ? 0.75 : 1,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
            {value}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        {disabled ? null : <Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />}
      </Pressable>
    </View>
  );
}

interface OptionRowProps {
  theme: PluginTheme;
  title: string;
  detail?: string;
  mono?: boolean;
  icon?: string;
  selected: boolean;
  onPress(): void;
}

function OptionRow({ theme, title, detail, mono, icon, selected, onPress }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: selected ? theme.colors.surface1 : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={theme.colors.foregroundMuted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text
            style={{ color: theme.colors.foregroundMuted, fontSize: 11, ...(mono ? { fontFamily: monoFont } : null) }}
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="Check" size={14} color={theme.colors.accent} /> : null}
    </Pressable>
  );
}

interface PickerViewProps {
  theme: PluginTheme;
  title: string;
  onBack(): void;
  search?: { value: string; onChange(text: string): void; placeholder: string; onSubmit(): void };
  children: ReactNode;
  footer?: ReactNode;
}

function PickerView({ theme, title, onBack, search, children, footer }: PickerViewProps) {
  return (
    <View style={{ flexShrink: 1, padding: 24, paddingTop: 16, gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to the run form"
        onPress={onBack}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name="ChevronLeft" size={16} color={theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{title}</Text>
      </Pressable>
      {search ? (
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
            value={search.value}
            onChangeText={search.onChange}
            placeholder={search.placeholder}
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={search.onSubmit}
            style={{ flex: 1, color: theme.colors.foreground, paddingVertical: 9, fontSize: 13 }}
          />
        </View>
      ) : null}
      <ScrollView style={{ flexShrink: 1, maxHeight: 340 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}

export function SpawnSheet({ theme, card, open, onOpenChange, onSpawned, onOpenAgent }: SpawnSheetProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const getIssue = useRpc(issueGetRpc);
  const checkPath = useRpc(spawnPathCheckRpc);
  const config = useSettings(jiraConfigDoc);
  const linearConfig = useSettings(linearConfigDoc);
  const [view, setView] = useState<SheetView>("form");
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [target, setTarget] = useState<SpawnSource | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [pathEntryOpen, setPathEntryOpen] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
  const [prompt, setPrompt] = useState("");
  // The lane is the default; an override lasts for this sheet only, so lanes
  // stay a settings concern.
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[] | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  // Reasoning level follows the model: a model switch drops it to the default.
  const [thinkingOverride, setThinkingOverride] = useState<string | null>(null);
  // Creative cards take a second press on Run; the warning lives in the footer.
  const [confirming, setConfirming] = useState(false);
  const editedRef = useRef(false);

  // The human layer: seed the field with issue context, then enrich it with
  // the fetched body — but only inside the first beat of opening. Typing wins,
  // and a late fetch yields: swapping text under the reader's eyes costs more
  // trust than the extra context buys.
  useEffect(() => {
    editedRef.current = false;
    if (!open || !card) {
      setPrompt("");
      return;
    }
    setPrompt(titleSeed(card));
    if (!card.jiraKey) return;
    const openedAt = Date.now();
    let cancelled = false;
    getIssue({ key: card.jiraKey })
      .then((issue) => {
        if (!cancelled && !editedRef.current && Date.now() - openedAt < 2000) setPrompt(fullSeed(card, issue));
      })
      .catch(() => {
        // Enrichment is optional; the title seed runs fine on its own.
      });
    return () => {
      cancelled = true;
    };
    // Reseed per card and per open. The ref is read fresh at resolve time.
  }, [open, card?.id, getIssue]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setView("form");
    setTarget(null);
    setWorkspacesLoaded(false);
    setWorkspaceQuery("");
    setPathEntryOpen(false);
    setRepoPath("");
    setPathError(null);
    setConfirming(false);
    paseo.workspaces
      .list()
      .then(({ entries }) => {
        if (cancelled) return;
        const active = entries
          .filter((workspace) => !workspace.archivingAt && !workspace.background)
          .map((workspace) => ({
            id: workspace.id,
            name: workspace.title ?? workspace.name,
            directory: workspace.workspaceDirectory ?? null,
            activityAt: workspace.activityAt ?? "",
          }));
        active.sort((a, b) => (a.activityAt < b.activityAt ? 1 : -1));
        setWorkspaces(active);
        setWorkspacesLoaded(true);
        setTarget((current) => current ?? (active[0] ? { kind: "workspace", workspaceId: active[0].id } : null));
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaces([]);
          setWorkspacesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, open, card?.id]);

  // The catalog loads with the sheet (not at spawn) so the model field can
  // list it; the same snapshot answers resolveSpawnSpec's error-message lookup.
  useEffect(() => {
    if (!open) return;
    setSelectedSpec(null);
    setThinkingOverride(null);
    setModelQuery("");
    let cancelled = false;
    paseo.providers
      .snapshot()
      .then((snapshot) => {
        if (!cancelled) setCatalog((snapshot.entries ?? []) as ProviderCatalogEntry[]);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, open, card?.id]);

  if (!card) return null;

  // Spawn lanes (amendment decision 8): the card's tracker picks the lane,
  // silently — work stays on the work model, personal stays off it. Read per
  // render so a settings edit mid-sheet never serves a stale lane.
  const jiraValues = config.status === "ready" ? config.values : null;
  const linearValues = linearConfig.status === "ready" ? linearConfig.values : null;
  const fallback = jiraValues?.spawnProvider ?? "opencode";
  const provider =
    card.source === "jira"
      ? (jiraValues?.spawnProviderJira ?? "") || fallback
      : card.source === "linear"
        ? (linearValues?.spawnProviderLinear ?? "") || fallback
        : fallback;

  // Creative work is James's (ties-go-creative doctrine): unrouted counts as
  // creative. The board warns; the judgment stays his — no hard block.
  const needsCreativeConfirm = card.source === "linear" && card.route !== "rote";

  const spec = selectedSpec ?? provider;
  const options = catalog === null ? [] : spawnOptions(catalog);
  const activeOption = options.find((option) => option.spec === spec) ?? null;
  const thinkingChoices = activeOption?.thinking ?? [];
  const thinkingLabel = (thinkingOverride && thinkingChoices.find((choice) => choice.id === thinkingOverride)?.label) || "Default";

  const modelNeedle = modelQuery.trim().toLowerCase();
  const filteredOptions = modelNeedle
    ? options.filter((option) => option.label.toLowerCase().includes(modelNeedle) || option.spec.toLowerCase().includes(modelNeedle))
    : options;

  const workspaceNeedle = workspaceQuery.trim().toLowerCase();
  const filteredWorkspaces = workspaceNeedle
    ? workspaces.filter(
        (workspace) =>
          workspace.name.toLowerCase().includes(workspaceNeedle) ||
          (workspace.directory ?? "").toLowerCase().includes(workspaceNeedle),
      )
    : workspaces;
  // The directory line earns its place only when it tells rows apart.
  const directoriesDiffer = new Set(workspaces.map((workspace) => workspace.directory)).size > 1;

  const targetWorkspace = target?.kind === "workspace" ? workspaces.find((workspace) => workspace.id === target.workspaceId) : undefined;
  const targetField =
    target?.kind === "workspace" && targetWorkspace
      ? {
          value: targetWorkspace.name,
          detail: joinDetail(targetWorkspace.directory && middleTruncate(targetWorkspace.directory, 44), relativeTime(targetWorkspace.activityAt)),
        }
      : target?.kind === "directory"
        ? { value: target.path.split("/").filter(Boolean).pop() ?? target.path, detail: `New workspace at ${middleTruncate(target.path, 36)}` }
        : target?.kind === "worktree"
          ? { value: `New worktree, PR #${target.number}`, detail: "Checks out the pull request" }
          : workspacesLoaded
            ? { value: "Choose a workspace", detail: "No recent workspaces yet" }
            : { value: "Loading workspaces…", detail: "" };

  async function spawn(source: SpawnSource) {
    if (!card || spawning) return;
    setSpawning(true);
    try {
      // An emptied field falls back to the seed; a run never sends nothing.
      const firstMessage = prompt.trim() || titleSeed(card);
      // agent.create requires provider/model; resolve the effective spec
      // against the live catalog so a bare provider errors with the fix.
      const providerSpec = resolveSpawnSpec(spec, catalog ?? []);
      const workspace =
        source.kind === "workspace"
          ? paseo.workspaces.ref(source.workspaceId)
          : source.kind === "directory"
            ? await paseo.workspaces.create({ source: { kind: "directory", path: source.path } })
            : await paseo.workspaces.create({
                source: {
                  kind: "worktree",
                  action: "checkout",
                  checkoutSource: { kind: "change_request", forge: "github", number: source.number },
                },
              });
      const agent = await workspace.agents.create({
        config: { provider: providerSpec, ...(thinkingOverride ? { thinkingOptionId: thinkingOverride } : {}) },
        prompt: firstMessage,
        title: card.jiraKey ?? card.title,
      });
      onSpawned(card.id, {
        agentId: agent.id,
        workspaceId: workspace.id,
        startedAt: new Date().toISOString(),
      });
      toast.show(`${card.jiraKey ?? card.title} is running`, { variant: "success" });
      // The run is the board's job; the chat is where the work happens. Land
      // the user in the agent so Run and the conversation are one motion.
      onOpenAgent?.(agent.id);
      onOpenChange(false);
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    } finally {
      setSpawning(false);
    }
  }

  function submit() {
    if (!target || spawning) return;
    if (needsCreativeConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void spawn(target);
  }

  // RN-web passes modifier flags on the key event; native keyboards never
  // send ⌘↵, so this is a web accelerator only.
  function onPromptKey(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const { key, metaKey, ctrlKey } = event.nativeEvent as TextInputKeyPressEventData & { metaKey?: boolean; ctrlKey?: boolean };
    if (key === "Enter" && (metaKey || ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  function chooseTarget(source: SpawnSource) {
    setTarget(source);
    setView("form");
  }

  /** Validate before accepting: a wrong path fails here, not after Run. */
  async function acceptPath() {
    const path = repoPath.trim();
    if (!path) return;
    try {
      const { exists } = await checkPath({ path });
      if (!exists) {
        setPathError(`No such directory: ${path}`);
        return;
      }
    } catch {
      // Validation is a courtesy; the spawn error path still reports failures.
    }
    setPathError(null);
    chooseTarget({ kind: "directory", path });
  }

  const isWeb = Platform.OS === "web";
  const runDisabled = !target || spawning;
  const routeText = card.route === "creative" ? "Marked creative" : "Unrouted, so treated as creative";

  const workspacePicker = (
    <PickerView
      theme={theme}
      title="Choose a workspace"
      onBack={() => setView("form")}
      search={{
        value: workspaceQuery,
        onChange: setWorkspaceQuery,
        placeholder: "Search workspaces…",
        onSubmit: () => {
          const first = filteredWorkspaces[0];
          if (first) chooseTarget({ kind: "workspace", workspaceId: first.id });
        },
      }}
      footer={
        <View style={{ gap: 2, borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 10 }}>
          {card.github ? (
            <OptionRow
              theme={theme}
              icon="GitPullRequest"
              title={`New worktree, checkout PR #${card.github.number}`}
              selected={target?.kind === "worktree"}
              onPress={() => chooseTarget({ kind: "worktree", number: card.github!.number })}
            />
          ) : null}
          {pathEntryOpen ? (
            <View style={{ gap: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={repoPath}
                  onChangeText={(text) => {
                    setPathError(null);
                    setRepoPath(text);
                  }}
                  placeholder="~/path/to/repo"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void acceptPath()}
                  style={{
                    flex: 1,
                    color: theme.colors.foreground,
                    backgroundColor: theme.colors.surface1,
                    borderWidth: 1,
                    borderColor: pathError ? theme.colors.statusDanger : theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    fontSize: 13,
                    fontFamily: monoFont,
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Use this path"
                  accessibilityHint="Checks the directory exists and selects it as the run's workspace"
                  disabled={repoPath.trim().length === 0}
                  onPress={() => void acceptPath()}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    opacity: repoPath.trim().length === 0 ? 0.5 : pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>Use</Text>
                </Pressable>
              </View>
              {pathError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{pathError}</Text> : null}
            </View>
          ) : (
            <OptionRow
              theme={theme}
              icon="Folder"
              title="Enter a path…"
              detail="Creates a new workspace"
              selected={target?.kind === "directory"}
              onPress={() => setPathEntryOpen(true)}
            />
          )}
        </View>
      }
    >
      {!workspacesLoaded ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 10 }}>Loading workspaces…</Text>
      ) : filteredWorkspaces.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 10 }}>
          {workspaceNeedle ? "No workspaces match." : "No recent workspaces — enter a path below."}
        </Text>
      ) : null}
      {filteredWorkspaces.map((workspace) => (
        <OptionRow
          key={workspace.id}
          theme={theme}
          title={workspace.name}
          detail={joinDetail(directoriesDiffer && workspace.directory ? middleTruncate(workspace.directory) : "", relativeTime(workspace.activityAt))}
          selected={target?.kind === "workspace" && target.workspaceId === workspace.id}
          onPress={() => chooseTarget({ kind: "workspace", workspaceId: workspace.id })}
        />
      ))}
    </PickerView>
  );

  const modelPicker = (
    <PickerView
      theme={theme}
      title="Choose a model"
      onBack={() => setView("form")}
      search={{
        value: modelQuery,
        onChange: setModelQuery,
        placeholder: "Search models…",
        onSubmit: () => {
          const first = filteredOptions[0];
          if (!first) return;
          setSelectedSpec(first.spec);
          setThinkingOverride(null);
          setView("form");
        },
      }}
    >
      {filteredOptions.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 10 }}>No models match.</Text>
      ) : null}
      {filteredOptions.map((option) => (
        <OptionRow
          key={option.spec}
          theme={theme}
          title={option.label}
          detail={option.spec}
          mono
          selected={option.spec === spec}
          onPress={() => {
            setSelectedSpec(option.spec);
            setThinkingOverride(null);
            setView("form");
          }}
        />
      ))}
    </PickerView>
  );

  const thinkingPicker = (
    <PickerView theme={theme} title="Thinking level" onBack={() => setView("form")}>
      <OptionRow
        theme={theme}
        title="Default"
        detail="The model's own default"
        selected={thinkingOverride === null}
        onPress={() => {
          setThinkingOverride(null);
          setView("form");
        }}
      />
      {thinkingChoices.map((choice) => (
        <OptionRow
          key={choice.id}
          theme={theme}
          title={choice.label}
          selected={thinkingOverride === choice.id}
          onPress={() => {
            setThinkingOverride(choice.id);
            setView("form");
          }}
        />
      ))}
    </PickerView>
  );

  const form = (
    <>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* The task stays named outside the editable prompt — the anchor for
            "wait, which card did I hit Run on?" */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ paddingTop: 2 }}>
            <Icon name={sourceGlyph(card.source)} size={13} color={theme.colors.foregroundMuted} />
          </View>
          <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
            {card.title}
          </Text>
        </View>
        <SelectField
          theme={theme}
          label="Workspace"
          value={targetField.value}
          detail={targetField.detail}
          disabled={!workspacesLoaded}
          onPress={() => {
            setWorkspaceQuery("");
            setPathEntryOpen(target?.kind === "directory");
            setView("workspace");
          }}
        />
        <View style={{ gap: 6 }}>
          <GroupLabel theme={theme} text="Prompt" />
          <TextInput
            value={prompt}
            onChangeText={(text) => {
              editedRef.current = true;
              setPrompt(text);
            }}
            onKeyPress={onPromptKey}
            multiline
            scrollEnabled
            autoFocus={isWeb}
            placeholder="Empty runs the task title"
            placeholderTextColor={theme.colors.foregroundMuted}
            accessibilityLabel="Prompt sent to the agent"
            style={{
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              lineHeight: 19,
              minHeight: 96,
              maxHeight: 172,
              textAlignVertical: "top",
            }}
          />
        </View>
        {/* The one paired row: both are short, related run settings. */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 3, minWidth: 0 }}>
            <SelectField
              theme={theme}
              label="Model"
              value={activeOption?.label ?? spec}
              detail={selectedSpec !== null ? "Override for this run" : "Lane default"}
              disabled={options.length === 0}
              action={
                selectedSpec !== null
                  ? {
                      label: "Reset",
                      onPress: () => {
                        setSelectedSpec(null);
                        setThinkingOverride(null);
                      },
                    }
                  : undefined
              }
              onPress={() => {
                setModelQuery("");
                setView("model");
              }}
            />
          </View>
          <View style={{ flex: 2, minWidth: 0 }}>
            <SelectField
              theme={theme}
              label="Thinking"
              value={thinkingChoices.length > 0 ? thinkingLabel : "Default"}
              detail={thinkingChoices.length === 0 ? "Not offered by this model" : thinkingOverride ? "Override" : "Model default"}
              disabled={thinkingChoices.length === 0}
              onPress={() => setView("thinking")}
            />
          </View>
        </View>
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{ flex: 1, fontSize: 12, color: confirming ? theme.colors.statusWarning : theme.colors.foregroundMuted }}
          numberOfLines={2}
        >
          {confirming ? `${routeText}. This one is yours.` : spawning ? "Starting agent…" : ""}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirming ? "Back out of the run" : "Cancel"}
          onPress={() => (confirming ? setConfirming(false) : onOpenChange(false))}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirming ? "Run anyway" : "Run"}
          accessibilityHint={target ? "Starts the agent in the chosen workspace" : "Choose a workspace first"}
          accessibilityState={{ disabled: runDisabled, busy: spawning }}
          disabled={runDisabled}
          onPress={submit}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: theme.colors.accent,
            opacity: runDisabled && !spawning ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {spawning ? (
            <ActivityIndicator size="small" color={theme.colors.accentForeground} />
          ) : (
            <Icon name="Play" size={13} color={theme.colors.accentForeground} />
          )}
          <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>
            {confirming ? "Run anyway" : "Run"}
          </Text>
          {isWeb && !spawning ? (
            <Text style={{ color: theme.colors.accentForeground, fontSize: 11, opacity: 0.65 }}>⌘↵</Text>
          ) : null}
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal
      title={card.jiraKey ? `Run ${card.jiraKey}` : "Run task"}
      icon={<Icon name="Play" size={16} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
        <View style={{ flexShrink: 1 }}>
          {view === "workspace" ? workspacePicker : view === "model" ? modelPicker : view === "thinking" ? thinkingPicker : form}
        </View>
      </Modal.Content>
    </Modal>
  );
}
