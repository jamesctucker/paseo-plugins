import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { QuizScreen } from "./client/quiz-screen";

function CodeQuizItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="GraduationCap"
      active={currentScreen?.screenId === "main"}
      onPress={() => openScreen({ screenId: "main" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "main", title: "Code Quiz", Component: QuizScreen });
  client.addSidebarHeaderItem({ id: "main", title: "Code Quiz", Component: CodeQuizItem });
  return () => {};
}
