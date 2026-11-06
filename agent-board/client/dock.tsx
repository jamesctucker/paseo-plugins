import { Pressable, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";

/**
 * The channel dock: a narrow strip at the board's far right edge where the
 * integrations live (Sunsama's pattern). One icon per channel; the active
 * channel's icon is lit while its sheet is open. Desktop only — on compact
 * layouts the channels are buttons in the Today header instead.
 */

export type Channel = "jira" | "github" | "linear";

const CHANNELS: { id: Channel; icon: string; label: string }[] = [
  { id: "jira", icon: "CircleDot", label: "Open Jira channel" },
  { id: "github", icon: "GitPullRequest", label: "Open GitHub channel" },
  { id: "linear", icon: "Layers", label: "Open Linear channel" },
];

export function ChannelDock({
  theme,
  active,
  onOpen,
}: {
  theme: PluginTheme;
  active: Channel | null;
  onOpen(channel: Channel): void;
}) {
  return (
    <View
      style={{
        width: 48,
        borderLeftWidth: 1,
        borderLeftColor: theme.colors.border,
        alignItems: "center",
        paddingTop: 12,
        gap: 4,
      }}
    >
      {CHANNELS.map((channel) => {
        const isActive = active === channel.id;
        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            accessibilityLabel={channel.label}
            onPress={() => onOpen(channel.id)}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: 8,
              backgroundColor: isActive ? theme.colors.surface1 : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon
              name={channel.icon}
              size={18}
              color={isActive ? theme.colors.accent : theme.colors.foregroundMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
