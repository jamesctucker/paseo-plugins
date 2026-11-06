import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { DEFAULT_ASSIGNED_JQL, type GitHubConfig, type JiraConfig, type LinearConfig } from "../shared/settings";
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
  spawnPathCheckRpc,
} from "../shared/contracts";
import { createJiraAdapter, type JiraAdapter } from "./jira";
import { createGitHubAdapter, type GitHubAdapter } from "./github";
import { createLinearAdapter, type LinearAdapter } from "./linear";
import { resolveCli, stopAgent } from "./stop";

/**
 * RPC handlers. Each call re-reads the config document, so token edits in the
 * settings screen take effect without a plugin reload.
 */

export interface AdapterStore<C> {
  readConfig(): Promise<C>;
}

export function createHandlers(
  jiraStore: AdapterStore<JiraConfig>,
  githubStore: AdapterStore<GitHubConfig>,
  linearStore: AdapterStore<LinearConfig>,
) {
  // The adapter is rebuilt per call when config changes; this cache only avoids
  // rebuilding within a single unchanged-config stretch.
  let cached: { config: JiraConfig; adapter: JiraAdapter } | null = null;

  function adapter(config: JiraConfig): JiraAdapter {
    if (cached && cached.config === config) return cached.adapter;
    const built = createJiraAdapter({ ...config, defaultJql: DEFAULT_ASSIGNED_JQL });
    cached = { config, adapter: built };
    return built;
  }

  async function jira(): Promise<JiraAdapter> {
    return adapter(await jiraStore.readConfig());
  }

  async function github(): Promise<GitHubAdapter> {
    return createGitHubAdapter(await githubStore.readConfig());
  }

  async function linear(): Promise<LinearAdapter> {
    return createLinearAdapter(await linearStore.readConfig());
  }

  return {
    jira: {
      async search({ query }: RpcInput<typeof issueSearchRpc>) {
        return { items: await (await jira()).search(query) };
      },

      async list(_input: RpcInput<typeof issueListRpc>) {
        return { items: await (await jira()).listAssigned() };
      },

      async get({ key }: RpcInput<typeof issueGetRpc>) {
        return (await jira()).get(key);
      },

      async statuses({ keys }: RpcInput<typeof jiraStatusesRpc>) {
        return { statuses: await (await jira()).statuses(keys) };
      },
    },

    github: {
      async search({ query }: RpcInput<typeof githubSearchRpc>) {
        return { items: await (await github()).search(query) };
      },

      async list(_input: RpcInput<typeof githubListRpc>) {
        return { items: await (await github()).listAssigned() };
      },

      async get({ key }: RpcInput<typeof githubGetRpc>) {
        return (await github()).get(key);
      },

      async reviewGates(_input: RpcInput<typeof githubReviewGatesRpc>) {
        return (await github()).reviewGates();
      },
    },

    linear: {
      async search({ query }: RpcInput<typeof linearSearchRpc>) {
        return { items: await (await linear()).search(query) };
      },

      async list(_input: RpcInput<typeof linearListRpc>) {
        return { items: await (await linear()).listAssigned() };
      },

      async get({ key }: RpcInput<typeof linearGetRpc>) {
        return (await linear()).get(key);
      },

      async statuses({ keys }: RpcInput<typeof linearStatusesRpc>) {
        return { statuses: await (await linear()).statuses(keys) };
      },

      async chain({ key }: RpcInput<typeof linearChainRpc>) {
        return (await linear()).chain(key);
      },
    },

    board: {
      async stop({ agentId }: RpcInput<typeof boardStopRpc>) {
        await stopAgent(agentId);
        return { ok: true as const };
      },

      async capabilities(_input: RpcInput<typeof boardCapabilitiesRpc>) {
        return { canStop: resolveCli() !== null };
      },
    },

    spawn: {
      async pathCheck({ path }: RpcInput<typeof spawnPathCheckRpc>) {
        // The sheet accepts "~/" because humans type it; Node doesn't.
        const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
        try {
          return { exists: statSync(expanded).isDirectory() };
        } catch {
          return { exists: false };
        }
      },
    },
  };
}

/** Config source backed by a registered settings document. */
export function settingsStore<C>(
  settings: {
    read(): Promise<{ status: "ready"; values: C } | { status: "invalid"; error: string }>;
  },
  _context?: PluginHandlerContext,
): AdapterStore<C> {
  return {
    async readConfig() {
      const state = await settings.read();
      if (state.status === "ready") return state.values;
      throw new Error(`Channel config is invalid: ${"error" in state ? state.error : "unknown"}`);
    },
  };
}