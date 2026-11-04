import type { PluginServerContext } from "@getpaseo/plugin/server";
import { boardDoc, jiraConfigDoc } from "./shared/settings";
import { issueGetRpc, issueListRpc, issueSearchRpc } from "./shared/contracts";
import { createHandlers, settingsStore } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  const config = server.registerSettings(jiraConfigDoc);
  server.registerSettings(boardDoc);

  const handlers = createHandlers(settingsStore(config));
  server.handle(issueSearchRpc, handlers.search);
  server.handle(issueListRpc, handlers.list);
  server.handle(issueGetRpc, handlers.get);
  return () => {};
}