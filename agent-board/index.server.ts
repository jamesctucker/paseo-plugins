import type { PluginServerContext } from "@getpaseo/plugin/server";
import { boardDoc, githubConfigDoc, jiraConfigDoc, linearConfigDoc } from "./shared/settings";
import {
  boardCapabilitiesRpc,
  boardStopRpc,
  githubGetRpc,
  githubListRpc,
  githubReviewGatesRpc,
  githubSearchRpc,
  issueGetRpc,
  issueListRpc,
  issueSearchRpc,
  jiraStatusesRpc,
  linearChainRpc,
  linearGetRpc,
  linearListRpc,
  linearSearchRpc,
  linearStatusesRpc,
} from "./shared/contracts";
import { createHandlers, settingsStore } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  const jiraConfig = server.registerSettings(jiraConfigDoc);
  const githubConfig = server.registerSettings(githubConfigDoc);
  const linearConfig = server.registerSettings(linearConfigDoc);
  server.registerSettings(boardDoc);

  const handlers = createHandlers(settingsStore(jiraConfig), settingsStore(githubConfig), settingsStore(linearConfig));
  server.handle(issueSearchRpc, handlers.jira.search);
  server.handle(issueListRpc, handlers.jira.list);
  server.handle(issueGetRpc, handlers.jira.get);
  server.handle(jiraStatusesRpc, handlers.jira.statuses);
  server.handle(githubSearchRpc, handlers.github.search);
  server.handle(githubListRpc, handlers.github.list);
  server.handle(githubGetRpc, handlers.github.get);
  server.handle(githubReviewGatesRpc, handlers.github.reviewGates);
  server.handle(linearSearchRpc, handlers.linear.search);
  server.handle(linearListRpc, handlers.linear.list);
  server.handle(linearGetRpc, handlers.linear.get);
  server.handle(linearStatusesRpc, handlers.linear.statuses);
  server.handle(linearChainRpc, handlers.linear.chain);
  server.handle(boardStopRpc, handlers.board.stop);
  server.handle(boardCapabilitiesRpc, handlers.board.capabilities);
  return () => {};
}