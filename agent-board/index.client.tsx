import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { jiraAttachments } from "./shared/contracts";
import { BoardScreen } from "./client/board";
import { CardDetailScreen } from "./client/detail";
import { ConfigScreen } from "./client/config";

/**
 * Client entry: the board screen, the card detail screen, the settings screen,
 * the sidebar row, the Command Center item, and the Jira attachment source.
 */

const BOARD_ICON = "SquareKanban";

function BoardItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon={BOARD_ICON}
      active={currentScreen?.screenId === "board"}
      onPress={() => openScreen({ screenId: "board" })}
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
    Component: CardDetailScreen,
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

  return () => {};
}