import { promises as fs } from "node:fs";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { launchTeacher, listRepos } from "../shared/quiz";
import { getFocusesForRepo } from "../shared/focuses";
import { listWorkRepos, resolveGarageRoot } from "./garage";
import { readPrefs, writePrefs } from "./prefs";

export async function handleListRepos(
  _input: RpcInput<typeof listRepos>,
  context: PluginHandlerContext,
) {
  const result = await context.paseo.workspaces.list({});
  const garageRoot = await resolveGarageRoot(result.entries);
  return { garageRoot, repos: await listWorkRepos(garageRoot), last: await readPrefs() };
}

function buildPrompt(repo: string, topic?: string) {
  const focus = topic?.trim()
    ? `the "${topic.trim()}" part of the repo at \`work/${repo}/\``
    : `the overall architecture of the repo at \`work/${repo}/\``;
  return [
    `Use the teach skill to teach me about ${focus}.`,
    "",
    "The code itself is the primary resource: read the repo's README, AGENTS.md, and the relevant source files before writing RESOURCES.md.",
    `Set up (or resume) the learning workspace at \`learning/${repo}/\` per the skill.`,
    "",
    "Start by quizzing me with a few questions about the code to calibrate what I already know, then build the first lesson from my answers.",
  ].join("\n");
}

// The teacher always runs this model; check the live catalog so a missing
// model fails with a clear error instead of a daemon-side rejection. The teach
// skill only exists for OpenCode agents in the garage, so no other provider
// can satisfy a launch.
const TEACHER_MODEL = "openrouter/deepseek/deepseek-v4.1-flash";

async function resolveProviderSpec(context: PluginHandlerContext): Promise<string> {
  const snapshot = await context.paseo.providers.snapshot();
  const entries = (snapshot.entries ?? []) as { provider: string; models?: { id: string }[] }[];
  const models = entries.find((entry) => entry.provider === "opencode")?.models ?? [];
  if (!models.some((model) => model.id === TEACHER_MODEL)) {
    throw new Error(`Model ${TEACHER_MODEL} is not in this host's OpenCode catalog.`);
  }
  return `opencode/${TEACHER_MODEL}`;
}

export async function handleLaunchTeacher(
  input: RpcInput<typeof launchTeacher>,
  context: PluginHandlerContext,
) {
  const { repo, focusId, topic } = input;
  const trimmedTopic = topic?.trim();
  // Same precedence as the screen: custom text beats a chip.
  const focusPrompt = focusId
    ? getFocusesForRepo(repo).find((focus) => focus.id === focusId)?.prompt
    : undefined;
  const effectiveTopic = trimmedTopic || focusPrompt || undefined;

  const listed = await context.paseo.workspaces.list({});
  const garageRoot = await resolveGarageRoot(listed.entries);

  const repoPath = path.join(garageRoot, "work", repo);
  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`No repo named "${repo}" under ${path.join(garageRoot, "work")}.`);
  }

  const existing = listed.entries.find(
    (entry) => (entry.workspaceDirectory ?? entry.projectRootPath) === garageRoot,
  );
  const workspace = existing
    ? context.paseo.workspaces.ref(existing.id)
    : await context.paseo.workspaces.create({ source: { kind: "directory", path: garageRoot } });

  const provider = await resolveProviderSpec(context);
  const title = effectiveTopic ? `Learn ${repo}: ${trimmedTopic || focusId}` : `Learn ${repo}`;
  const agent = await workspace.agents.create({
    config: { provider },
    prompt: buildPrompt(repo, effectiveTopic),
    title,
  });
  await writePrefs({
    repo,
    ...(focusId ? { focusId } : {}),
    ...(trimmedTopic ? { topic: trimmedTopic } : {}),
  });
  return { agentId: agent.id, workspaceId: workspace.id, title };
}
