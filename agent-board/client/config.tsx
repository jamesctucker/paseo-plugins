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
import { githubConfigDoc, jiraConfigDoc, linearConfigDoc, type GitHubConfig, type JiraConfig, type LinearConfig } from "../shared/settings";

/**
 * Channel token config. SettingsInput keeps drafts local until Save, so a
 * stale revision never clobbers a concurrent edit from another client.
 */

export function ConfigScreen({ theme }: PluginSurfaceProps) {
  const jira = useSettings(jiraConfigDoc);
  const github = useSettings(githubConfigDoc);
  const linear = useSettings(linearConfigDoc);
  const [jiraDraft, setJiraDraft] = useState<JiraConfig | null>(null);
  const [githubDraft, setGithubDraft] = useState<GitHubConfig | null>(null);
  const [linearDraft, setLinearDraft] = useState<LinearConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const jiraValues = jira.status === "ready" ? jira.values : null;
  const githubValues = github.status === "ready" ? github.values : null;
  const linearValues = linear.status === "ready" ? linear.values : null;
  const jiraCurrent = jiraDraft ?? jiraValues;
  const githubCurrent = githubDraft ?? githubValues;
  const linearCurrent = linearDraft ?? linearValues;
  const dirty =
    (jiraDraft !== null && JSON.stringify(jiraDraft) !== JSON.stringify(jiraValues)) ||
    (githubDraft !== null && JSON.stringify(githubDraft) !== JSON.stringify(githubValues)) ||
    (linearDraft !== null && JSON.stringify(linearDraft) !== JSON.stringify(linearValues));

  function jiraField<K extends keyof JiraConfig>(key: K): {
    initialValue: string;
    onChangeText(text: string): void;
  } {
    return {
      initialValue: jiraCurrent ? String(jiraCurrent[key]) : "",
      onChangeText: (text: string) => {
        setSaved(false);
        setJiraDraft({ ...(jiraCurrent ?? jiraDefaults()), [key]: text } as JiraConfig);
      },
    };
  }

  const githubTokenField = {
    initialValue: githubCurrent?.token ?? "",
    onChangeText: (text: string) => {
      setSaved(false);
      setGithubDraft({ token: text });
    },
  };

  function linearField<K extends keyof LinearConfig>(key: K): {
    initialValue: string;
    onChangeText(text: string): void;
  } {
    return {
      initialValue: linearCurrent ? String(linearCurrent[key]) : "",
      onChangeText: (text: string) => {
        setSaved(false);
        setLinearDraft({ ...(linearCurrent ?? linearDefaults()), [key]: text } as LinearConfig);
      },
    };
  }

  async function save() {
    if (jira.status !== "ready" || github.status !== "ready" || linear.status !== "ready") return;
    let ok = true;
    if (jiraDraft) ok = (await jira.save(jiraDraft, jira.revision)) && ok;
    if (githubDraft) ok = (await github.save(githubDraft, github.revision)) && ok;
    if (linearDraft) ok = (await linear.save(linearDraft, linear.revision)) && ok;
    setSaved(ok);
    setFailed(!ok);
    if (ok) {
      setJiraDraft(null);
      setGithubDraft(null);
      setLinearDraft(null);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <SettingsSection title="Jira">
        <SettingsCard>
          <SettingsInput label="Site domain" hint="Site name, host, or URL, e.g. acme" placeholder="acme" {...jiraField("domain")} />
          <SettingsInput label="Email" placeholder="you@example.com" {...jiraField("email")} />
          <SettingsInput
            label="API token"
            hint="Atlassian API token, kept daemon-side"
            secureTextEntry
            {...jiraField("token")}
          />
          <SettingsInput
            label="Assigned JQL"
            hint="Overrides the default assigned-to-me list when non-empty"
            placeholder="assignee = currentUser() AND ..."
            {...jiraField("jql")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="GitHub">
        <SettingsCard>
          <SettingsInput
            label="Personal access token"
            hint="Token with repo scope, kept daemon-side"
            placeholder="ghp_..."
            secureTextEntry
            {...githubTokenField}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Linear">
        <SettingsCard>
          <SettingsInput
            label="API key"
            hint="Linear personal API key, kept daemon-side"
            placeholder="lin_api_..."
            secureTextEntry
            {...linearField("apiKey")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Board">
        <SettingsCard>
          <SettingsInput
            label="Jira spawn provider"
            hint="Work lane for Jira cards, e.g. opencode/openrouter/moonshotai/kimi-k3"
            placeholder="opencode/openrouter/moonshotai/kimi-k3"
            {...jiraField("spawnProviderJira")}
          />
          <SettingsInput
            label="Linear spawn provider"
            hint="Personal lane for Linear cards"
            placeholder="opencode/deepseek/deepseek-flash"
            {...linearField("spawnProviderLinear")}
          />
          <SettingsInput
            label="Fallback spawn provider"
            hint="Prompt and GitHub cards spawn here"
            placeholder="opencode/deepseek/deepseek-flash"
            {...jiraField("spawnProvider")}
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
      {jira.status === "invalid" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 16 }}>
          Stored Jira settings are invalid: {jira.error}
        </Text>
      ) : null}
      {github.status === "invalid" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 16 }}>
          Stored GitHub settings are invalid: {github.error}
        </Text>
      ) : null}
      {linear.status === "invalid" ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 16 }}>
          Stored Linear settings are invalid: {linear.error}
        </Text>
      ) : null}
    </View>
  );
}

function jiraDefaults(): JiraConfig {
  return { domain: "", email: "", token: "", jql: "", spawnProvider: "opencode", spawnProviderJira: "opencode" };
}

function linearDefaults(): LinearConfig {
  return { apiKey: "", spawnProviderLinear: "opencode" };
}
