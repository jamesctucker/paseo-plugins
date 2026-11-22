import { promises as fs } from "node:fs";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { launchTeacher, listRepos } from "../shared/quiz";
import { getFocusesForRepo } from "../shared/focuses";
import { discoverRepos, isValidRepoPath, lessonDirFor } from "./repos";
import { readPrefs, writePrefs } from "./prefs";

export async function handleListRepos(
  _input: RpcInput<typeof listRepos>,
  context: PluginHandlerContext,
) {
  const result = await context.paseo.workspaces.list({});
  const repos = await discoverRepos(result.entries);
  return {
    repos: repos.map(({ id, path: repoPath, name, workspaceId, workspaceName }) => ({
      id,
      path: repoPath,
      name,
      workspaceId,
      workspaceName,
    })),
    last: await readPrefs(),
  };
}

/**
 * The teaching loop, inlined. The agent gets everything it needs to run a
 * calibrating quiz and build persistent lessons without depending on any skill
 * installed in the workspace.
 */
export function buildPrompt(repoPath: string, repoName: string, topic?: string): string {
  const location = repoPath === "." ? "this workspace's root repo" : `the repo at \`${repoPath}/\``;
  const focus = topic?.trim()
    ? `the "${topic.trim()}" part of ${location}`
    : `the overall architecture of ${location}`;
  const lessonDir = lessonDirFor(repoPath);
  return [
    `Teach me ${focus}.`,
    "",
    "How to teach:",
    `- The code is the primary resource: read the repo's README and the relevant source files before writing anything.`,
    `- Start by quizzing me with a few questions about the code to calibrate what I already know. Ask one question at a time and wait for my answer.`,
    `- Then build the first lesson from my answers: a short, self-contained HTML page saved under \`${lessonDir}/\`, plus a plain-text reference sheet for the durable facts (commands, terminology, file locations).`,
    `- Resume from whatever already exists under \`${lessonDir}/\` if I have been here before.`,
    "",
    `The repo to teach is \`${repoName}\`, already inside this workspace.`,
  ].join("\n");
}

// Preferred teacher model: fast and cheap for quiz-style lessons. Any OpenCode
// model can run them, so a host without this exact model falls back to the
// catalog's first available instead of failing the launch.
const PREFERRED_MODEL = "openrouter/deepseek/deepseek-v4.1-flash";

async function resolveProviderSpec(context: PluginHandlerContext): Promise<string> {
  const snapshot = await context.paseo.providers.snapshot();
  const entries = (snapshot.entries ?? []) as { provider: string; models?: { id: string }[] }[];
  const models = entries.find((entry) => entry.provider === "opencode")?.models ?? [];
  const model = models.find((candidate) => candidate.id === PREFERRED_MODEL)?.id ?? models[0]?.id;
  if (!model) {
    throw new Error("No OpenCode models are configured on this host.");
  }
  return `opencode/${model}`;
}

export async function handleLaunchTeacher(
  input: RpcInput<typeof launchTeacher>,
  context: PluginHandlerContext,
) {
  const { workspaceId, repoPath, focusId, topic } = input;
  const trimmedTopic = topic?.trim();
  // Same precedence as the screen: custom text beats a chip.
  const focusPrompt = focusId
    ? getFocusesForRepo(path.basename(repoPath)).find((focus) => focus.id === focusId)?.prompt
    : undefined;
  const effectiveTopic = trimmedTopic || focusPrompt || undefined;

  const listed = await context.paseo.workspaces.list({});
  const entry = listed.entries.find((candidate) => candidate.id === workspaceId);
  const workspaceDirectory = entry?.workspaceDirectory ?? entry?.projectRootPath;
  if (!workspaceDirectory) {
    throw new Error("That workspace is not open on this host.");
  }

  // repoPath normally echoes a discovered repo, but treat it as untrusted: the
  // segment charset rules out traversal, and the stat must land inside the
  // workspace root (realpath on both, so a symlink cannot redirect it).
  if (!isValidRepoPath(repoPath)) {
    throw new Error("Not a valid repo path.");
  }
  const root = await fs.realpath(workspaceDirectory);
  const repoDir = path.join(root, repoPath);
  const realRepo = await fs.realpath(repoDir).catch(() => null);
  if (
    !realRepo ||
    !(realRepo === root || realRepo.startsWith(root + path.sep)) ||
    !(await fs.stat(realRepo).then((stat) => stat.isDirectory()).catch(() => false))
  ) {
    throw new Error(`No repo named "${repoPath}" in that workspace.`);
  }
  const repoName = path.basename(realRepo);

  const workspace = context.paseo.workspaces.ref(workspaceId);
  const provider = await resolveProviderSpec(context);
  const title = effectiveTopic ? `Learn ${repoName}: ${trimmedTopic || focusId}` : `Learn ${repoName}`;
  const agent = await workspace.agents.create({
    config: { provider },
    prompt: buildPrompt(repoPath, repoName, effectiveTopic),
    title,
  });
  await writePrefs({
    repo: repoPath,
    ...(focusId ? { focusId } : {}),
    ...(trimmedTopic ? { topic: trimmedTopic } : {}),
  }).catch(() => {
    // The teacher is already running; losing the remembered repo and focus
    // is cosmetic and must not turn a successful launch into an error.
  });
  return { agentId: agent.id, workspaceId: workspace.id, title };
}
