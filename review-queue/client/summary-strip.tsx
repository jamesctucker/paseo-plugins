import type { PluginTheme } from "@getpaseo/plugin";
import { Text } from "react-native";
import { useReviewWorkspaces } from "./review-workspaces";
import { useReviewRequests } from "./use-review-requests";

function age(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function syncedAgo(epochMs: number): string {
  const seconds = Math.max(0, (Date.now() - epochMs) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function SummaryStrip({ theme }: { theme: PluginTheme }) {
  const queue = useReviewRequests();
  const workspaces = useReviewWorkspaces();
  if (!queue.data) return null;

  const prs = queue.data.prs;
  const assignedOnly = prs.filter((pr) => pr.assigned && !pr.reviewRequested).length;
  const oldest = prs.reduce<string | null>(
    (min, pr) => (min == null || pr.updatedAt < min ? pr.updatedAt : min),
    null,
  );
  const workspaceCount = (workspaces.data ?? []).length;

  const segments = [
    `${prs.length} waiting`,
    ...(assignedOnly > 0 ? [`${assignedOnly} assigned`] : []),
    ...(oldest ? [`oldest ${age(oldest)}`] : []),
    ...(workspaceCount > 0
      ? [`${workspaceCount} review workspace${workspaceCount === 1 ? "" : "s"}`]
      : []),
    `synced ${syncedAgo(queue.dataUpdatedAt)}`,
  ];
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
      {segments.join(" · ")}
    </Text>
  );
}
