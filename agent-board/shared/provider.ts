/**
 * Spawn provider selection. `agent.create` requires `provider/model`; a bare
 * provider is rejected by the SDK before reaching the daemon, so this module
 * owns the one rule that keeps the board's Run button honest: a full spec runs
 * verbatim, an empty value falls back to the default lane, and a bare provider
 * is a config error that names the fix instead of silently picking a model.
 */

export const DEFAULT_SPAWN_SPEC = "opencode/deepseek/deepseek-flash";

/**
 * The work lane (amendment decision 8): Jira cards spawn on the Work—Builder
 * model so work agents stay on `openrouter/*` and personal agents stay off it.
 */
export const WORK_SPAWN_SPEC = "opencode/openrouter/moonshotai/kimi-k3";

export interface ProviderCatalogEntry {
  provider: string;
  enabled?: boolean;
  models?: {
    id: string;
    label?: string;
    isDefault?: boolean;
    isSelectable?: boolean;
    thinkingOptions?: { id: string; label: string; isDefault?: boolean }[];
  }[];
}

export interface ThinkingOption {
  id: string;
  label: string;
}

export interface SpawnOption {
  /** provider/model-id, the form `agent.create` accepts. */
  spec: string;
  /** Human model name, falling back to the raw id. */
  label: string;
  provider: string;
  isDefault: boolean;
  /** Reasoning levels the model exposes; absent when it has none. */
  thinking?: ThinkingOption[];
}

/**
 * The selectable set for the run sheet's model row: enabled providers'
 * selectable models, in catalog order (the daemon already ranks them).
 */
export function spawnOptions(catalog: readonly ProviderCatalogEntry[]): SpawnOption[] {
  const options: SpawnOption[] = [];
  for (const entry of catalog) {
    if (entry.enabled === false) continue;
    for (const model of entry.models ?? []) {
      if (model.isSelectable === false) continue;
      const thinking = (model.thinkingOptions ?? []).map((option) => ({ id: option.id, label: option.label }));
      options.push({
        spec: `${entry.provider}/${model.id}`,
        label: model.label ?? model.id,
        provider: entry.provider,
        isDefault: model.isDefault === true,
        ...(thinking.length > 0 ? { thinking } : {}),
      });
    }
  }
  return options;
}

export class SpawnConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpawnConfigError";
  }
}

export function resolveSpawnSpec(configured: string, catalog: readonly ProviderCatalogEntry[] = []): string {
  const trimmed = configured.trim();
  if (!trimmed) return DEFAULT_SPAWN_SPEC;
  if (trimmed.includes("/")) return trimmed;
  const entry = catalog.find((candidate) => candidate.provider === trimmed);
  const example = entry?.models?.[0]?.id
    ? `${trimmed}/${entry.models[0].id}`
    : `${trimmed}/<model>`;
  throw new SpawnConfigError(
    `Spawn provider needs provider/model, e.g. ${example}. Open the Agent Board settings.`,
  );
}