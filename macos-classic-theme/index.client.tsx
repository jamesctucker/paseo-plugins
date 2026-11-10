import type { PluginClientContext } from "@getpaseo/plugin/client";

export default function contribute(client: PluginClientContext) {
  client.addTheme({
    id: "macos-classic-light",
    name: "macOS Classic Light",
    appearance: "light",
    colors: {
      background: "#ffffff",
      foreground: "#000000",
      raised: "#f7f7f7",
      control: "#e9e9e9",
      border: "#d2d2d2",
      accent: "#1f6ae2",
      mutedForeground: "#505050",
      ring: "#929292",
    },
  });

  client.addTheme({
    id: "macos-classic-dark",
    name: "macOS Classic Dark",
    appearance: "dark",
    colors: {
      background: "#131313",
      foreground: "#dddddd",
      raised: "#1e1d1e",
      control: "#373636",
      border: "#404040",
      accent: "#307bf6",
      mutedForeground: "#9e9e9e",
      ring: "#8f8f8f",
    },
  });

  return () => {};
}
