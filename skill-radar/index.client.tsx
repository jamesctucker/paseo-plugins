import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { startRadar } from "./client/controller";
import { SkillRadarScreen } from "./client/screen";

function SkillRadarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Radar"
      active={currentScreen?.screenId === "radar"}
      onPress={() => openScreen({ screenId: "radar" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "radar", title: "Skill Radar", Component: SkillRadarScreen });
  client.addSidebarHeaderItem({ id: "radar", title: "Skill Radar", Component: SkillRadarItem });

  client.addCommandCenterItem({
    id: "open-skill-radar",
    title: "Open Skill Radar",
    icon: "Radar",
    keywords: ["skills", "suggestions", "classify", "recall"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "radar" });
    },
  });

  const stopRadar = startRadar(client);
  return () => {
    stopRadar();
  };
}
