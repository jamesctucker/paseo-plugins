import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startRadar } from "./client/controller";
import { SkillRadarPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "radar",
    title: "Skill Radar",
    icon: "Radar",
    context: "workspace",
    locations: ["explorer"],
    Component: SkillRadarPanel,
  });

  client.addCommandCenterItem({
    id: "open-skill-radar",
    title: "Open Skill Radar",
    icon: "Radar",
    keywords: ["skills", "suggestions", "classify", "recall"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("radar", { location: "explorer" });
    },
  });

  const stopRadar = startRadar(client);
  return () => {
    stopRadar();
  };
}
