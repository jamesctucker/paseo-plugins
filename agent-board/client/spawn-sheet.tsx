import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { issueGetRpc } from "../shared/contracts";
import { jiraConfigDoc, type BoardCard, type CardRun } from "../shared/settings";

/**
 * Run flow: source picker sheet ("Run in which workspace?"), then workspace +
 * agent creation seeded with the issue body, then the link lands back on the
 * card via onSpawned. Existing workspaces spawn in place; a repo path creates a
 * directory workspace; GitHub cards can cut a worktree at the pull request.
 */

export interface SpawnSheetProps {
  theme: PluginTheme;
  card: BoardCard | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSpawned(cardId: string, run: CardRun): void;
}

interface WorkspaceLite {
  id: string;
  name: string;
  directory: string | null;
  activityAt: string;
}

export function SpawnSheet({ theme, card, open, onOpenChange, onSpawned }: SpawnSheetProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const getIssue = useRpc(issueGetRpc);
  const config = useSettings(jiraConfigDoc);
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([]);
  const [repoPath, setRepoPath] = useState("");
  const [spawning, setSpawning] = useState(false);

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
        const prompt = await seedPrompt(card, getIssue);
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
          prompt,
          title: card.jiraKey ?? card.title,
        });
        onSpawned(card.id, {
          agentId: agent.id,
          workspaceId: workspace.id,
          startedAt: new Date().toISOString(),
        });
        toast.show(`${card.jiraKey ?? card.title} is running`, { variant: "success" });
        onOpenChange(false);
        setRepoPath("");
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
      } finally {
        setSpawning(false);
      }
    },
    // card/provider captured per render is intended: the sheet re-renders per card
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, provider, spawning],
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

async function seedPrompt(
  card: BoardCard,
  getIssue: (input: { key: string }) => Promise<{ identifier: string; title: string; body: string; url: string; status: string }>,
): Promise<string> {
  if (card.jiraKey) {
    try {
      const issue = await getIssue({ key: card.jiraKey });
      return [`Work ${issue.identifier}: ${issue.title}`, "", issue.body, "", `Issue: ${issue.url}`].join("\n");
    } catch {
      // Prompt seeding degrades to the card snapshot; the spawn still goes out.
      return `Work ${card.jiraKey}: ${card.title}`;
    }
  }
  if (card.github) {
    return `Work on ${card.github.repo}#${card.github.number}: ${card.title}`;
  }
  return [`Work on: ${card.title}`, "", card.body].filter(Boolean).join("\n");
}