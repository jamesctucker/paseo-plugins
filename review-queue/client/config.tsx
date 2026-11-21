import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_SPAWN_SPEC,
  DEFAULT_THINKING_OPTION,
  spawnConfigDoc,
  type SpawnConfig,
} from "../shared/review-requests";

/**
 * Review-agent spawn config. SettingsInput keeps drafts local until Save, so
 * a stale revision never clobbers a concurrent edit from another client.
 */
export function SpawnConfigScreen({ theme }: PluginSurfaceProps) {
  const config = useSettings(spawnConfigDoc);
  const [draft, setDraft] = useState<SpawnConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const values = config.status === "ready" ? config.values : null;
  const current = draft ?? values;

  function patch(change: Partial<SpawnConfig>) {
    setSaved(false);
    setDraft({
      spawnSpec: current?.spawnSpec ?? DEFAULT_SPAWN_SPEC,
      thinkingOptionId: current?.thinkingOptionId ?? DEFAULT_THINKING_OPTION,
      promptTemplate: current?.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
      ...change,
    });
  }

  async function save() {
    if (config.status !== "ready" || !draft) return;
    const ok = await config.save(draft, config.revision);
    setSaved(ok);
    setFailed(!ok);
    if (ok) setDraft(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <SettingsSection title="Review agent" info="Used by New review workspace to start the review agent">
        <SettingsCard>
          <SettingsInput
            label="Provider and model"
            hint="Must exist on this daemon"
            placeholder={DEFAULT_SPAWN_SPEC}
            initialValue={current?.spawnSpec ?? ""}
            onChangeText={(text) => patch({ spawnSpec: text })}
          />
          <SettingsInput
            label="Thinking level"
            hint="Meaning depends on the provider"
            placeholder={DEFAULT_THINKING_OPTION}
            initialValue={current?.thinkingOptionId ?? ""}
            onChangeText={(text) => patch({ thinkingOptionId: text })}
          />
          <SettingsInput
            label="Prompt"
            hint="The placeholders {repo}, {number}, and {url} are filled in per pull request"
            placeholder={DEFAULT_PROMPT_TEMPLATE}
            initialValue={current?.promptTemplate ?? ""}
            onChangeText={(text) => patch({ promptTemplate: text })}
          />
        </SettingsCard>
        <SettingsAction
          label="Save"
          hint={saved ? "Saved" : failed ? "Could not save, try again" : undefined}
          actionLabel={draft !== null ? "Save" : "Saved"}
          disabled={draft === null}
          onPress={() => void save()}
        />
      </SettingsSection>
    </View>
  );
}
