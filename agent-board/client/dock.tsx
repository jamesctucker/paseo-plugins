import { Pressable, Text, View } from "react-native";
import type { PluginSvgIcon, PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { GITHUB_SVG, JIRA_SVG, LINEAR_SVG } from "./brand-icons";

/** Persistent identity for supporting panels and tracker channels. */
export type UtilityPanel = "backlog" | "agents";
export type Channel = "jira" | "github" | "linear";

const CHANNELS: { id: Channel; icon: PluginSvgIcon; label: string }[] = [
  { id: "jira", icon: { svg: JIRA_SVG }, label: "Open Jira channel" },
  { id: "github", icon: { svg: GITHUB_SVG }, label: "Open GitHub channel" },
  { id: "linear", icon: { svg: LINEAR_SVG }, label: "Open Linear channel" },
];

export function UtilityRail({
  theme,
  activePanel,
  activeChannel,
  backlogCount,
  runningCount,
  reviewCount,
  onOpenPanel,
  onOpenChannel,
}: {
  theme: PluginTheme;
  activePanel: UtilityPanel | null;
  activeChannel: Channel | null;
  backlogCount: number;
  runningCount: number;
  reviewCount: number;
  onOpenPanel(panel: UtilityPanel): void;
  onOpenChannel(channel: Channel): void;
}) {
  const agentCount = runningCount + reviewCount;
  return (
    <View
      style={{
        width: 48,
        borderLeftWidth: 1,
        borderLeftColor: theme.colors.border,
        alignItems: "center",
        paddingTop: 8,
        gap: 4,
      }}
    >
      <UtilityButton
        theme={theme}
        label="Backlog"
        accessibilityLabel={`${activePanel === "backlog" ? "Close" : "Open"} Backlog panel${backlogCount > 0 ? `, ${backlogCount} parked` : ""}`}
        icon="Inbox"
        count={backlogCount}
        active={activePanel === "backlog"}
        onPress={() => onOpenPanel("backlog")}
      />
      <UtilityButton
        theme={theme}
        label="Agents"
        accessibilityLabel={`${activePanel === "agents" ? "Close" : "Open"} Agents panel, ${runningCount} running, ${reviewCount} to review`}
        icon="Bot"
        count={agentCount}
        active={activePanel === "agents"}
        onPress={() => onOpenPanel("agents")}
      />
      <View style={{ width: 24, height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />
      {CHANNELS.map((channel) => {
        const isActive = activeChannel === channel.id;
        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            accessibilityLabel={channel.label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onOpenChannel(channel.id)}
            hitSlop={2}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              backgroundColor: isActive ? theme.colors.surface2 : pressed ? theme.colors.surface1 : "transparent",
            })}
          >
            <Icon icon={channel.icon} size={18} color={isActive ? theme.colors.accent : theme.colors.foregroundMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

function UtilityButton({
  theme,
  label,
  accessibilityLabel,
  icon,
  count,
  active,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  accessibilityLabel: string;
  icon: string;
  count: number;
  active: boolean;
  onPress(): void;
}) {
  const color = active ? theme.colors.accent : theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        minHeight: 50,
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active ? theme.colors.surface2 : pressed ? theme.colors.surface1 : "transparent",
      })}
    >
      <View>
        <Icon name={icon} size={18} color={color} />
        {count > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -6,
              right: -12,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 3,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
            }}
          >
            <Text style={{ color: active ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 9, fontWeight: "600" }}>
              {count > 99 ? "99+" : count}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color, fontSize: 9, fontWeight: active ? "600" : "500" }}>{label}</Text>
    </Pressable>
  );
}
