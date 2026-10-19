import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import {
  CLASSIFY_DEBOUNCE_MS,
  CONTEXT_MESSAGES,
  PILL_THRESHOLD,
  PILL_TTL_MS,
  classifyContext,
} from "../shared/contracts";
import { agentRadarState, forgetAgent, patchAgentState } from "./store";

const RECENT_AGENT_WINDOW_MS = 12 * 60 * 60 * 1000;
const AUTO_CLASSIFY_WINDOW_MS = 2 * 60 * 60 * 1000;
const WATCHED_AGENT_LIMIT = 6;

interface DirectoryAgent {
  id: string;
  workspaceId?: string | null;
  updatedAt?: string;
  lastUserMessageAt?: string | null;
}

function activityOf(agent: DirectoryAgent): number {
  const stamp = agent.lastUserMessageAt ?? agent.updatedAt;
  const parsed = stamp ? Date.parse(stamp) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface Watcher {
  agentId: string;
  workspaceId: string;
  messages: string[];
  lastActivityAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  release: { release(): Promise<void> } | null;
  seeded: boolean;
}

interface Pill {
  registration: PluginButtonRegistration;
  label: string | null;
  copied: boolean;
  copyTimer: ReturnType<typeof setTimeout> | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
}

export function startRadar(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const watchers = new Map<string, Watcher>();
  const pills = new Map<string, Pill>();

  const stopped = () => lifetime.signal.aborted;

  const refreshPill = (agentId: string) => {
    const pill = pills.get(agentId);
    if (!pill) return;

    const state = agentRadarState(agentId);
    const top = state.status === "ready" ? state.matches[0] : undefined;
    if (!top || top.confidence < PILL_THRESHOLD) {
      if (pill.hideTimer) clearTimeout(pill.hideTimer);
      pill.hideTimer = null;
      pill.copied = false;
      pill.label = null;
      pill.registration.update({ visible: false });
      return;
    }

    if (pill.label !== top.name) {
      pill.copied = false;
      pill.label = top.name;
    }

    pill.registration.update({
      visible: true,
      label: pill.copied ? "Copied" : top.name,
      icon: pill.copied ? "Check" : "Lightbulb",
      title: pill.copied ? `Copied ${top.name}` : `Copy the ${top.name} skill name`,
    });

    if (pill.hideTimer) clearTimeout(pill.hideTimer);
    pill.hideTimer = setTimeout(() => {
      if (stopped()) return;
      pill.registration.update({ visible: false });
    }, PILL_TTL_MS);
  };

  const flashCopied = (agentId: string) => {
    const pill = pills.get(agentId);
    if (!pill) return;
    pill.copied = true;
    refreshPill(agentId);
    if (pill.copyTimer) clearTimeout(pill.copyTimer);
    pill.copyTimer = setTimeout(() => {
      if (stopped()) return;
      pill.copied = false;
      refreshPill(agentId);
    }, 2_000);
  };

  const copySuggestion = async (agentId: string) => {
    const top = agentRadarState(agentId).matches[0];
    if (!top) return;
    try {
      await copyText(top.name);
      flashCopied(agentId);
    } catch {
      // Clipboard permission is the client's call; the panel reports the failure.
    }
  };

  const scheduleClassify = (watcher: Watcher, delay: number) => {
    if (watcher.timer) clearTimeout(watcher.timer);
    watcher.timer = setTimeout(() => {
      watcher.timer = null;
      void runClassify(watcher);
    }, delay);
  };

  const runClassify = async (watcher: Watcher) => {
    if (stopped() || watcher.messages.length === 0) return;
    const messages = [...watcher.messages];

    try {
      const result = await client.rpc(classifyContext, { messages });
      if (stopped()) return;
      // A newer message arrived while this call was in flight; its own timer will handle it.
      if (watcher.messages.join("\u0000") !== messages.join("\u0000")) return;

      patchAgentState(
        watcher.agentId,
        {
          status: result.status === "ok" ? "ready" : "unavailable",
          matches: result.matches,
          reason: result.reason,
        },
        watcher.workspaceId,
      );
      refreshPill(watcher.agentId);
    } catch {
      if (stopped()) return;
      patchAgentState(
        watcher.agentId,
        {
          status: "unavailable",
          matches: [],
          reason: "Classification request failed",
        },
        watcher.workspaceId,
      );
      refreshPill(watcher.agentId);
    }
  };

  const noteMessage = (watcher: Watcher, text: string) => {
    const message = text.trim();
    if (!message) return;
    watcher.messages = [...watcher.messages, message].slice(-CONTEXT_MESSAGES);
    watcher.lastActivityAt = Date.now();

    patchAgentState(watcher.agentId, { status: "analyzing", matches: [], reason: null }, watcher.workspaceId);
    refreshPill(watcher.agentId);
    scheduleClassify(watcher, CLASSIFY_DEBOUNCE_MS);
  };

  const seed = async (watcher: Watcher, autoClassify: boolean) => {
    const handle = client.paseo.agents.ref(watcher.agentId);
    try {
      const page = await handle.timeline.refetch({ direction: "before", limit: 80 });
      if (stopped()) return;
      const messages = page.entries
        .map((entry) => entry.item)
        .filter((item): item is { type: "user_message"; text: string } => item.type === "user_message")
        .map((item) => item.text.trim())
        .filter(Boolean)
        .slice(-CONTEXT_MESSAGES);
      watcher.messages = messages;
      watcher.seeded = true;
      if (autoClassify && messages.length > 0) {
          patchAgentState(
          watcher.agentId,
          { status: "analyzing", matches: [], reason: null },
          watcher.workspaceId,
        );
        scheduleClassify(watcher, 0);
      }
    } catch {
      // A closed or unsubscribed agent simply has no history to read.
    }
  };

  const ensurePill = (agentId: string, workspaceId: string) => {
    if (pills.has(agentId)) return;
    const registration = client.addComposerPill({
      id: "suggest",
      workspaceId,
      agentId,
      button: {
        title: "Skill Radar suggestion",
        icon: "Lightbulb",
        label: "Skill",
        visible: false,
        behavior: { kind: "action", onPress: () => copySuggestion(agentId) },
      },
    });
    pills.set(agentId, { registration, label: null, copied: false, copyTimer: null, hideTimer: null });
  };

  const watch = (agent: DirectoryAgent, autoClassify: boolean) => {
    if (!agent.workspaceId || watchers.has(agent.id) || stopped()) return;
    ensurePill(agent.id, agent.workspaceId);

    const watcher: Watcher = {
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      messages: [],
      lastActivityAt: activityOf(agent),
      timer: null,
      release: null,
      seeded: false,
    };
    watchers.set(agent.id, watcher);

    const subscription = client.paseo.agents.ref(agent.id).timeline.subscribe((message) => {
      if (stopped()) return;
      const event = message.event;
      if (event.type === "timeline") {
        if (event.item.type === "user_message") noteMessage(watcher, event.item.text);
        return;
      }
      if (event.type === "subscription_restored" || event.type === "replacement") {
        void seed(watcher, false);
      }
    });
    watcher.release = subscription;

    void subscription.ready
      .then(() => seed(watcher, autoClassify))
      .catch(() => {
        // Establishment failed; the directory snapshot will reconcile on the next update.
      });
  };

  const unwatch = (agentId: string) => {
    const watcher = watchers.get(agentId);
    if (!watcher) return;
    if (watcher.timer) clearTimeout(watcher.timer);
    void watcher.release?.release().catch(() => {});
    watchers.delete(agentId);

    const pill = pills.get(agentId);
    if (pill) {
      if (pill.copyTimer) clearTimeout(pill.copyTimer);
      if (pill.hideTimer) clearTimeout(pill.hideTimer);
      pill.registration.remove();
      pills.delete(agentId);
    }
    forgetAgent(agentId);
  };

  const directory = new Map<string, DirectoryAgent>();

  const eligible = (agent: DirectoryAgent): boolean => {
    if (!agent.workspaceId) return false;
    return activityOf(agent) >= Date.now() - RECENT_AGENT_WINDOW_MS;
  };

  const reconcile = () => {
    const eligibleAgents = [...directory.values()]
      .filter(eligible)
      .sort((a, b) => activityOf(b) - activityOf(a))
      .slice(0, WATCHED_AGENT_LIMIT);

    const keep = new Set(eligibleAgents.map((agent) => agent.id));
    for (const agentId of [...watchers.keys()]) {
      if (!keep.has(agentId)) unwatch(agentId);
    }
    const mostRecent = eligibleAgents[0]?.id;
    for (const agent of eligibleAgents) {
      const autoClassify = agent.id === mostRecent && Date.now() - activityOf(agent) < AUTO_CLASSIFY_WINDOW_MS;
      watch(agent, autoClassify);
    }
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          directory.clear();
          for (const { agent } of entries) directory.set(agent.id, agent);
          reconcile();
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            directory.set(update.agent.id, update.agent);
            reconcile();
            return;
          }
          directory.delete(update.agentId);
          unwatch(update.agentId);
        },
      });
      return undefined;
    })
    .catch(() => {
      // Without the agent directory the panel still shows the catalog.
    });

  return () => {
    lifetime.abort();
    for (const watcher of watchers.values()) {
      if (watcher.timer) clearTimeout(watcher.timer);
      void watcher.release?.release().catch(() => {});
    }
    watchers.clear();
    for (const pill of pills.values()) {
      if (pill.copyTimer) clearTimeout(pill.copyTimer);
      if (pill.hideTimer) clearTimeout(pill.hideTimer);
      pill.registration.remove();
    }
    pills.clear();
  };
}
