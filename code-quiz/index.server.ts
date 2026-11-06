import type { PluginServerContext } from "@getpaseo/plugin/server";
import { launchTeacher, listRepos } from "./shared/quiz";
import { handleLaunchTeacher, handleListRepos } from "./server/launch";

export default function contribute(server: PluginServerContext) {
  server.handle(listRepos, handleListRepos);
  server.handle(launchTeacher, handleLaunchTeacher);
  return () => {};
}
