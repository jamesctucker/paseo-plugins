import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { issueGetRpc } from "../shared/contracts";
import { jiraConfigDoc, type BoardCard, type CardRun } from "../shared/settings";
import { fullSeed, titleSeed } from "../shared/prompt";
import { GroupLabel } from "./ui";

/**
 * Run flow: the prompt field pre-seeds with issue context and is editable —
 * the human layer before anything runs. Then the source picker ("Run in which
 * workspace?"), then workspace + agent creation whose first message is
 * whatever the field holds, then the link lands back on the card.
 *
 * Existing workspaces spawn in place; a repo path creates a directory
 * workspace; GitHub cards can cut a worktree at the pull request.
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

export function SpawnSheet({ theme, card, open, onOpenChange, onSpawned, onOpenAgent }: SpawnSheetProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const getIssue = useRpc(issueGetRpc);
  const config = useSettings(jiraConfigDoc);
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([]);
  const [repoPath, setRepoPath] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const editedRef = useRef(false);

  // The human layer: seed the field with issue context, then enrich it with
  // the fetched body. Typing wins — the enrich pass never overwrites an edit.
  useEffect(() => {
    editedRef.current = false;
    if (!open || !card) {
      setPrompt("");
      return;
    }
    setPrompt(titleSeed(card));
    if (!card.jiraKey) return;
    let cancelled = false;
    getIssue({ key: card.jiraKey })
      .then((issue) => {
        if (!cancelled && !editedRef.current) setPrompt(fullSeed(card, issue));
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
        setWorkspaces(active.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, open]);

  const provider = config.status === "ready" ? config.values.spawnProvider : "opencode";

  const spawn = useCallback(
    async (source: { kind: "workspace"; workspaceId: string } | { kind: "directory"; path: string } | { kind: "worktree"; number: number }) => {
      if (!card || spawning) return;
      setSpawning(true);
      try {
        // An emptied field falls back to the seed; a run never sends nothing.
        const firstMessage = prompt.trim() || titleSeed(card);
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
          config: { provider },
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
        setRepoPath("");
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
      } finally {
        setSpawning(false);
      }
    },
    // card/provider/prompt captured per render is intended: the sheet re-renders per card and per keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, provider, spawning, prompt],
  );

  if (!card) return null;

  return (
    <Modal
      title="Run in which workspace?"
      icon={<Text style={{ color: theme.colors.foreground, fontSize: 16 }}>▶</Text>}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Content>
        <View style={{ gap: 2, paddingVertical: 8 }}>
          <GroupLabel theme={theme} text="Prompt" />
          <TextInput
            value={prompt}
            onChangeText={(text) => {
              editedRef.current = true;
              setPrompt(text);
            }}
            multiline
            placeholder="Edit before it runs…"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={{
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              fontSize: 12,
              minHeight: 72,
              textAlignVertical: "top",
            }}
          />
          <View style={{ height: 10 }} />
          <GroupLabel theme={theme} text="Workspace" />
          {workspaces.map((workspace, index) => (
            <Pressable
              key={workspace.id}
              accessibilityRole="button"
              accessibilityLabel={`Run in ${workspace.name}`}
              disabled={spawning}
              onPress={() => void spawn({ kind: "workspace", workspaceId: workspace.id })}
              style={({ pressed }) => ({
                paddingVertical: 7,
                paddingHorizontal: 8,
                borderRadius: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "500" }}>
                {index === 0 ? "Current workspace" : workspace.name}
              </Text>
              {workspace.directory ? (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }} numberOfLines={1}>
                  {workspace.directory}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {card.github ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Checkout pull request ${card.github.number}`}
              disabled={spawning}
              onPress={() => void spawn({ kind: "worktree", number: card.github!.number })}
              style={{ paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8 }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 13, fontWeight: "600" }}>
                New worktree, checkout PR #{card.github.number}
              </Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingTop: 6 }}>
            <TextInput
              value={repoPath}
              onChangeText={setRepoPath}
              placeholder="Repo path…"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Run in repo path"
              disabled={spawning || repoPath.trim().length === 0}
              onPress={() => void spawn({ kind: "directory", path: repoPath.trim() })}
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                opacity: spawning || repoPath.trim().length === 0 ? 0.5 : 1,
              }}
            >
              <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" }}>Run</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}