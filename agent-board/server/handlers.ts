import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { DEFAULT_ASSIGNED_JQL, jiraConfigDoc, type JiraConfig } from "../shared/settings";
import { issueGetRpc, issueListRpc, issueSearchRpc } from "../shared/contracts";
import { createJiraAdapter } from "./jira";
import type { IssueAdapter } from "../shared/tracker";

/**
 * RPC handlers. Each call re-reads the config document, so token edits in the
 * settings screen take effect without a plugin reload.
 */

export interface AdapterStore {
  readConfig(): Promise<JiraConfig>;
}

export function createHandlers(store: AdapterStore) {
  // The adapter is rebuilt per call when config changes; this cache only avoids
  // rebuilding within a single unchanged-config stretch.
  let cached: { config: JiraConfig; adapter: IssueAdapter } | null = null;

  function adapter(config: JiraConfig): IssueAdapter {
    if (cached && cached.config === config) return cached.adapter;
    const built = createJiraAdapter({ ...config, defaultJql: DEFAULT_ASSIGNED_JQL });
    cached = { config, adapter: built };
    return built;
  }

  async function current(): Promise<IssueAdapter> {
    return adapter(await store.readConfig());
  }

  return {
    async search({ query }: RpcInput<typeof issueSearchRpc>) {
      return { items: await (await current()).search(query) };
    },

    async list(_input: RpcInput<typeof issueListRpc>) {
      return { items: await (await current()).listAssigned() };
    },

    async get({ key }: RpcInput<typeof issueGetRpc>) {
      return (await current()).get(key);
    },
  };
}

/** Config source backed by the registered settings document. */
export function settingsStore(
  settings: {
    read(): Promise<{ status: "ready"; values: JiraConfig } | { status: "invalid"; error: string }>;
  },
  _context?: PluginHandlerContext,
): AdapterStore {
  return {
    async readConfig() {
      const state = await settings.read();
      if (state.status === "ready") return state.values;
      throw new Error(`Jira config is invalid: ${"error" in state ? state.error : "unknown"}`);
    },
  };
}