import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";

/**
 * Stop an agent by shelling to the daemon's CLI. The plugin SDK has no
 * cancel on the agent handle (the upstream PR never landed), so this is the
 * same path better-paseo uses: PASEO_CLI first, then `paseo` on PATH. The
 * board hides its stop control when neither resolves.
 */

const AGENT_ID = /^[\w-]+$/;
const STOP_TIMEOUT_MS = 10_000;

let resolvedCli: string | null | undefined;

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = `${dir}/${name}`;
    if (executable(candidate)) return candidate;
  }
  return null;
}

export function resolveCli(): string | null {
  if (resolvedCli !== undefined) return resolvedCli;
  const fromEnv = process.env.PASEO_CLI;
  resolvedCli = (fromEnv && executable(fromEnv) ? fromEnv : null) ?? findOnPath("paseo");
  return resolvedCli;
}

export function stopAgent(agentId: string): Promise<void> {
  if (!AGENT_ID.test(agentId)) {
    return Promise.reject(new Error(`Invalid agent id: ${agentId}`));
  }
  const cli = resolveCli();
  if (!cli) {
    return Promise.reject(new Error("No paseo CLI found on this host"));
  }
  return new Promise((resolve, reject) => {
    execFile(cli, ["agent", "stop", agentId, "--json"], { timeout: STOP_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve();
      }
    });
  });
}
