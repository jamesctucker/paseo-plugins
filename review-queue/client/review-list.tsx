import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, usePaseo } from "@getpaseo/plugin/client";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PullRequest } from "../shared/review-requests";
import { useReviewRequests } from "./use-review-requests";

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// One tag vocabulary for the whole plugin: small caps, muted unless a state color applies.
export function tagStyle(theme: PluginTheme, color?: string) {
  return {
    color: color ?? theme.colors.foregroundMuted,
    fontSize: 10,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
  };
}

type CreateState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created" }
  | { status: "error"; message: string };

function CreateWorkspaceButton({ pr, theme }: { pr: PullRequest; theme: PluginTheme }) {
  const paseo = usePaseo();
  const [state, setState] = useState<CreateState>({ status: "idle" });

  async function createReviewWorkspace() {
    if (state.status === "creating" || state.status === "created") return;
    setState({ status: "creating" });
    try {
      const workspace = await paseo.workspaces.create({
        title: `Code review for ${pr.author}'s PR: ${pr.repo}#${pr.number}`,
        source: {
          kind: "worktree",
          cwd: pr.localCheckoutPath!,
          action: "checkout",
          checkoutSource: { kind: "change_request", forge: "github", number: pr.number },
        },
      });
      // The handle knows the new worktree's directory; a combined create would need
      // a cwd that does not exist yet.
      await workspace.agents.create({
        config: {
          // provider/model in one string; the daemon splits on the first slash.
          provider: "opencode/openrouter/moonshotai/kimi-k3",
          thinkingOptionId: "high",
        },
        // The code-review skill is project-scoped to the-garage, so the agent in the
        // PR worktree can only reach it by absolute path.
        prompt:
          `Read /Users/james/the-garage/.opencode/skills/engineering/code-review/SKILL.md and follow it ` +
          `as a Mode A review of PR #${pr.number} (${pr.repo}): ${pr.url}. ` +
          `The PR is already checked out in this workspace. Produce the tiered findings report; do not merge or push.`,
      });
      setState({ status: "created" });
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : "Could not create the workspace.",
      });
    }
  }

  const label =
    state.status === "creating"
      ? "Creating review workspace…"
      : state.status === "created"
        ? "Review agent started — see sidebar"
        : "New review workspace";
  const filled = useMemo(
    () => ({
      alignSelf: "flex-start" as const,
      backgroundColor: pr.localCheckoutPath
        ? state.status === "created"
          ? theme.colors.statusSuccess
          : theme.colors.accent
        : theme.colors.surface2,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 8,
      opacity: state.status === "creating" ? 0.7 : 1,
    }),
    [theme, state.status, pr.localCheckoutPath],
  );
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Create a review workspace for ${pr.repo} number ${pr.number}`}
        onPress={() => void createReviewWorkspace()}
        disabled={
          !pr.localCheckoutPath || (state.status !== "idle" && state.status !== "error")
        }
        style={({ pressed }: { pressed: boolean }) => [
          filled,
          pressed && pr.localCheckoutPath && { opacity: 0.85 },
        ]}
      >
        <Text
          style={{
            color: pr.localCheckoutPath
              ? theme.colors.accentForeground
              : theme.colors.foregroundMuted,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </Pressable>
      {!pr.localCheckoutPath ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          Clone the repo locally to review it in a workspace.
        </Text>
      ) : null}
      {state.status === "error" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{state.message}</Text>
      ) : null}
    </View>
  );
}

function PullRequestRow({
  pr,
  theme,
  compact,
}: {
  pr: PullRequest;
  theme: PluginTheme;
  compact: boolean;
}) {
  const styles = useMemo(
    () => ({
      link: {
        paddingVertical: 8,
        paddingHorizontal: compact ? 4 : 8,
        borderRadius: 8,
        gap: 2,
      },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      buttonLane: { paddingHorizontal: compact ? 4 : 8, paddingBottom: 8 },
    }),
    [theme, compact],
  );
  // The link pressable wraps only the text; the create button is a sibling so the
  // two actions never share a tap target.
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${pr.repo} number ${pr.number} on GitHub: ${pr.title}`}
        onPress={() => void openExternalUrl(pr.url)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          styles.link,
          (hovered || pressed) && { backgroundColor: theme.colors.surface1 },
        ]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {pr.title}
        </Text>
        <Text style={styles.meta}>
          {pr.isDraft ? <Text style={tagStyle(theme)}>DRAFT · </Text> : null}
          {pr.assigned && !pr.reviewRequested ? (
            <Text style={tagStyle(theme)}>ASSIGNED TO YOU · </Text>
          ) : null}
          {pr.repo}#{pr.number} · @{pr.author} · updated {relativeTime(pr.updatedAt)}
        </Text>
      </Pressable>
      <View style={styles.buttonLane}>
        <CreateWorkspaceButton pr={pr} theme={theme} />
      </View>
    </View>
  );
}

export function ReviewList({ theme, compact }: { theme: PluginTheme; compact: boolean }) {
  const query = useReviewRequests();
  const styles = useMemo(
    () => ({
      status: { color: theme.colors.foregroundMuted, fontSize: 13, padding: 8 },
      error: { color: theme.colors.statusDanger, fontSize: 13, padding: 8 },
    }),
    [theme],
  );

  if (query.isPending) {
    return <Text style={styles.status}>Checking GitHub…</Text>;
  }
  if (query.isError) {
    return (
      <Text style={styles.error}>
        {query.error instanceof Error ? query.error.message : "Could not load review requests."}
      </Text>
    );
  }
  if (query.data.prs.length === 0) {
    return <Text style={styles.status}>Nothing waiting on your review.</Text>;
  }
  return (
    <View style={{ gap: 4 }}>
      {query.data.prs.map((pr) => (
        <PullRequestRow key={pr.url} pr={pr} theme={theme} compact={compact} />
      ))}
    </View>
  );
}
