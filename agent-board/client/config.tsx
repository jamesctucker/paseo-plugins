import { useState } from "react";
import { Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { jiraConfigDoc, type JiraConfig } from "../shared/settings";

/**
 * Jira token config. SettingsInput keeps drafts local until Save, so a stale
 * revision never clobbers a concurrent edit from another client.
 */

export function ConfigScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(jiraConfigDoc);
  const [draft, setDraft] = useState<JiraConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const values = settings.status === "ready" ? settings.values : null;
  const current = draft ?? values;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(values);

  function field<K extends keyof JiraConfig>(key: K): {
    initialValue: string;
    onChangeText(text: string): void;
  } {
    return {
      initialValue: current ? String(current[key]) : "",
      onChangeText: (text: string) => {
        setSaved(false);
        setDraft({ ...(current ?? defaults()), [key]: text } as JiraConfig);
      },
    };
  }

  async function save() {
    if (settings.status !== "ready" || !draft) return;
    const ok = await settings.save(draft, settings.revision);
    setSaved(ok);
    setFailed(!ok);
    if (ok) setDraft(null);
  }

  return (
    <View style={{ gap: 8 }}>
      <SettingsSection title="Jira">
        <SettingsCard>
          <SettingsInput label="Site domain" hint="Site name, host, or URL, e.g. acme" placeholder="acme" {...field("domain")} />
          <SettingsInput label="Email" placeholder="you@example.com" {...field("email")} />
          <SettingsInput
            label="API token"
            hint="Atlassian API token, kept daemon-side"
            secureTextEntry
            {...field("token")}
          />
          <SettingsInput
            label="Assigned JQL"
            hint="Overrides the default assigned-to-me list when non-empty"
            placeholder="assignee = currentUser() AND ..."
            {...field("jql")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Board">
        <SettingsCard>
          <SettingsInput
            label="Spawn provider"
            hint="Provider/model for new agents, e.g. opencode/deepseek/deepseek-flash"
            placeholder="opencode/deepseek/deepseek-flash"
            {...field("spawnProvider")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsAction
        label="Save"
        hint={saved ? "Saved" : failed ? "Could not save, try again" : undefined}
        actionLabel={dirty ? "Save" : "Saved"}
        disabled={!dirty}
        onPress={() => void save()}
      />
      {settings.status === "invalid" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 16 }}>
          Stored settings are invalid: {settings.error}
        </Text>
      ) : null}
    </View>
  );
}

function defaults(): JiraConfig {
  return { domain: "", email: "", token: "", jql: "", spawnProvider: "opencode" };
}