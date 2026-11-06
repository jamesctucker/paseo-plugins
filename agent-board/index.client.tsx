import { useMemo } from "react";
import { Text, View } from "react-native";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { githubAttachments, jiraAttachments, linearAttachments } from "./shared/contracts";
import { laneCounts, type Lane } from "./shared/lanes";
import { useAgentDirectory } from "./client/agent-directory";
import { useBoardDoc } from "./client/board-doc";
import { useGates } from "./client/gates";
import { BoardScreen } from "./client/board";
import { CardDetailScreen } from "./client/detail";
import { ConfigScreen } from "./client/config";

/**
 * Client entry: the board screen, the card detail screen, the settings screen,
 * the sidebar row with live counts, the Command Center item, and the Jira and
 * GitHub attachment sources.
 */

const BOARD_ICON = "SquareKanban";

const LANE_STYLE: Record<Lane, { label: string; color(theme: PluginTheme): string }> = {
  needsYou: { label: "needs you", color: (theme) => theme.colors.statusWarning },
  running: { label: "running", color: (theme) => theme.colors.accent },
  review: { label: "to review", color: (theme) => theme.colors.statusSuccess },
};

function Counts({ theme, counts }: { theme: PluginTheme; counts: Record<Lane, number> }) {
  const lanes = (Object.keys(LANE_STYLE) as Lane[]).filter((lane) => counts[lane] > 0);
  if (lanes.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {lanes.map((lane) => (
        <View
          key={lane}
          accessibilityLabel={`${counts[lane]} ${LANE_STYLE[lane].label}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LANE_STYLE[lane].color(theme) }} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{counts[lane]}</Text>
        </View>
      ))}
    </View>
  );
}

function BoardItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  // This item is always mounted, which keeps the shared agent directory and
  // the gate cache warm: the counts stay live and the board opens on warm data.
  const { agents } = useAgentDirectory();
  const board = useBoardDoc();
  const gatesApi = useGates(board);
  const counts = useMemo(() => {
    const counts = laneCounts(board.values.cards, agents);
    // Gates are needs-you items: chain stalls, not-Done nags, review asks,
    // and manual reminders all wait on James, not on an agent.
    return { ...counts, needsYou: counts.needsYou + gatesApi.gates.length };
  }, [board.values.cards, agents, gatesApi.gates]);
  return (
    <SidebarRow
      icon={BOARD_ICON}
      active={currentScreen?.screenId === "board"}
      onPress={() => openScreen({ screenId: "board" })}
      trailing={<Counts theme={theme} counts={counts} />}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  const openBoard = () => client.openScreen({ screenId: "board" });
  const openSettings = () => client.openSettings("config");

  client.addScreen({
    id: "board",
    title: "Agent Board",
    Component: (props) => <BoardScreen {...props} onOpenSettings={openSettings} onOpenCard={openCard} />,
  });

  function openCard(cardId: string) {
    client.openScreen({ screenId: "card", params: { cardId } });
  }

  client.addScreen({
    id: "card",
    title: "Card",
    Component: (props) => <CardDetailScreen {...props} onOpenCard={openCard} onOpenBoard={openBoard} />,
  });

  client.addSettingsScreen({
    id: "config",
    title: "Agent Board",
    icon: BOARD_ICON,
    Component: ConfigScreen,
  });

  client.addSidebarHeaderItem({
    id: "agent-board",
    title: "Agent Board",
    Component: BoardItem,
  });

  client.addCommandCenterItem({
    id: "open-agent-board",
    title: "Open Agent Board",
    icon: BOARD_ICON,
    context: "global",
    keywords: ["board", "today", "jira"],
    onSelect() {
      openBoard();
    },
  });

  client.addAttachmentSource(jiraAttachments);
  client.addAttachmentSource(githubAttachments);
  client.addAttachmentSource(linearAttachments);

  return () => {};
}