import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { agentLabel, type AgentStateLike } from "../shared/agent-label";

export { agentLabel };

/**
 * Small shared primitives for the board. Colors always arrive as theme tokens;
 * nothing here may hardcode a color.
 */

/** The theme carries colors only, so the mono key face is picked per platform. */
export const monoFont = Platform.select({ ios: "Menlo", default: "monospace" });

/** The board's one repeating motion: a soft opacity pulse on live agents. */
export function PulseDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity }} />;
}

// The host's Lucide set has no brand icons: GitHub is GitPullRequest, not
// "Github" (an unknown name throws at registration/render).
const SOURCE_GLYPH: Record<string, string> = {
  jira: "CircleDot",
  prompt: "FileText",
  github: "GitPullRequest",
  linear: "Layers",
};

const SOURCE_LABEL: Record<string, string> = {
  jira: "Jira",
  github: "GitHub",
  linear: "Linear",
  prompt: "Prompt",
};

/** Brand-muted monochrome source identity, per the restrained direction. */
export function sourceGlyph(source: string): string {
  return SOURCE_GLYPH[source] ?? "FileText";
}

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? "Prompt";
}

/**
 * The glanceable form of source identity: quiet monochrome text at a fixed
 * spot in the row, so a vertical scan reads Jira/GitHub/Prompt instantly.
 */
export function SourceTag({ theme, source }: { theme: PluginTheme; source: string }) {
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, fontWeight: "600", letterSpacing: 0.6 }}>
      {sourceLabel(source)}
    </Text>
  );
}

export function statusColor(theme: PluginTheme, status: string): string {
  switch (status) {
    case "running":
    case "initializing":
      return theme.colors.accent;
    case "error":
      return theme.colors.statusDanger;
    case "closed":
      return theme.colors.foregroundMuted;
    default:
      return theme.colors.statusSuccess;
  }
}

/** The color that goes with agentLabel: attention first, then raw status. */
export function agentColor(theme: PluginTheme, agent: AgentStateLike): string {
  return agent.attentionReason ? attentionColor(theme, agent.attentionReason) : statusColor(theme, agent.status);
}

export function attentionColor(theme: PluginTheme, reason: string | null): string {
  switch (reason) {
    case "error":
      return theme.colors.statusDanger;
    case "permission":
      return theme.colors.statusWarning;
    default:
      return theme.colors.statusSuccess;
  }
}

export interface ChipProps {
  theme: PluginTheme;
  text: string;
  color: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/** Compact pill used for tracker badges and live agent chips. */
export function Chip({ theme, text, color, style, textStyle }: ChipProps) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        // Hidden so a shrunk chip clips its label instead of spilling past it.
        overflow: "hidden",
        ...style,
      }}
    >
      <Text style={{ color, fontSize: 11, ...textStyle }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function GroupLabel({ theme, text }: { theme: PluginTheme; text: string }) {
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>
      {text}
    </Text>
  );
}