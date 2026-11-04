import { useEffect, useRef } from "react";
import { Animated, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";

/**
 * Small shared primitives for the board. Colors always arrive as theme tokens;
 * nothing here may hardcode a color.
 */

/** The board's one repeating motion: a soft opacity pulse on live agents. */
export function PulseDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity }} />;
}

const SOURCE_GLYPH: Record<string, string> = {
  jira: "CircleDot",
  prompt: "FileText",
  github: "Github",
};

/** Brand-muted monochrome source identity, per the restrained direction. */
export function sourceGlyph(source: string): string {
  return SOURCE_GLYPH[source] ?? "FileText";
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
      {text.toUpperCase()}
    </Text>
  );
}