import { useEffect, useState } from "react";
import { usePaseo } from "@getpaseo/plugin/client";

/**
 * Live agent directory for the rail and card chips. One owned subscription per
 * mounted board; Paseo delivers a fresh snapshot after reconnects, so no manual
 * re-fetch plumbing is needed.
 */

export interface AgentEntry {
  id: string;
  status: "initializing" | "idle" | "running" | "error" | "closed";
  title: string | null;
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
  updatedAt: string;
}

interface DirectoryAgent {
  id: string;
  status: AgentEntry["status"];
  title?: string | null;
  requiresAttention?: boolean;
  attentionReason?: AgentEntry["attentionReason"];
  updatedAt: string;
  archivedAt?: string | null;
}

export function useAgentDirectory(): {
  agents: Map<string, AgentEntry>;
  offline: boolean;
} {
  const paseo = usePaseo();
  const [agents, setAgents] = useState<Map<string, AgentEntry>>(new Map());
  const [offline, setOffline] = useState(false);

  function toEntry(agent: DirectoryAgent): AgentEntry {
    return {
      id: agent.id,
      status: agent.status,
      title: agent.title ?? null,
      requiresAttention: agent.requiresAttention ?? false,
      attentionReason: agent.attentionReason ?? null,
      updatedAt: agent.updatedAt,
    };
  }

  function upsert(agent: DirectoryAgent) {
    setAgents((prev) => {
      const next = new Map(prev);
      if (agent.archivedAt) next.delete(agent.id);
      else next.set(agent.id, toEntry(agent));
      return next;
    });
  }

  useEffect(() => {
    let release: (() => void) | null = null;
    let stopped = false;

    setOffline(false);
    paseo.agents
      .list({ subscribe: {} })
      .then(({ subscription }) => {
        if (stopped) {
          void subscription.release();
          return;
        }
        release = () => void subscription.release();
        subscription.subscribe({
          snapshot: ({ entries }) => {
            const next = new Map<string, AgentEntry>();
            for (const { agent } of entries) {
              if (agent.archivedAt) continue;
              next.set(agent.id, toEntry(agent));
            }
            setAgents(next);
            setOffline(false);
          },
          update: (message) => {
            if (message.type !== "agent_update") return;
            const update = message.payload as
              | { kind: "upsert"; agent: DirectoryAgent }
              | { kind?: string; agentId?: string };
            if (update.kind === "upsert" && "agent" in update) upsert(update.agent);
            else if ("agentId" in update && update.agentId) {
              setAgents((prev) => {
                const next = new Map(prev);
                next.delete(update.agentId as string);
                return next;
              });
            }
          },
          error: () => setOffline(true),
        });
      })
      .catch(() => {
        if (!stopped) setOffline(true);
      });

    return () => {
      stopped = true;
      release?.();
    };
  }, [paseo]);

  return { agents, offline };
}

/** Re-render on an interval so elapsed labels tick without manual refresh. */
export function useTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}