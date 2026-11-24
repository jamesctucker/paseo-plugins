import type { PluginThemeContribution } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";

// Paseo expands a contributed palette into the full token set its built-in themes use, so each
// theme only states the places a real macOS window has: window content, chrome, sidebar states,
// cards, controls, hairlines and the three label weights.
//
// Theme colors are opaque hex, so glass is suggested by layering rather than by alpha: a cooler
// sidebar against the content area, near-invisible separators, and a tertiary label weight all
// read as macOS chrome. Real backdrop blur belongs to the desktop window, which a theme cannot
// reach.

const classicLight: PluginThemeContribution = {
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
    sidebar: "#f2f2f2",
    sidebarHover: "#e8e8e8",
    sidebarSelected: "#dcdcdc",
    surface3: "#e9e9e9",
    surface4: "#dbdbdb",
    foregroundExtraMuted: "#767676",
  },
};

const classicDark: PluginThemeContribution = {
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
    sidebar: "#1a191a",
    sidebarHover: "#262526",
    sidebarSelected: "#333233",
    surface3: "#2b2a2b",
    surface4: "#3a393a",
    foregroundExtraMuted: "#787878",
  },
};

// Tahoe chrome: airier than the classic pair, cool-tinted rather than neutral, with separators
// close enough to their surface that panels read as layered panes instead of boxed regions.
const tahoeLight: PluginThemeContribution = {
  id: "macos-tahoe-light",
  name: "macOS Tahoe Light",
  appearance: "light",
  colors: {
    background: "#fbfbfd",
    foreground: "#16181d",
    raised: "#ffffff",
    control: "#eff1f5",
    border: "#e2e5ea",
    accent: "#007aff",
    mutedForeground: "#5f6470",
    ring: "#9aa0ad",
    sidebar: "#f3f5f8",
    sidebarHover: "#e9ecf1",
    sidebarSelected: "#dce1e9",
    surface3: "#eef0f5",
    surface4: "#e3e7ef",
    foregroundExtraMuted: "#8b90a0",
  },
};

const tahoeDark: PluginThemeContribution = {
  id: "macos-tahoe-dark",
  name: "macOS Tahoe Dark",
  appearance: "dark",
  colors: {
    background: "#17191d",
    foreground: "#e7e9ee",
    raised: "#23262c",
    control: "#2c3038",
    border: "#2f333b",
    accent: "#0a84ff",
    mutedForeground: "#9aa0ac",
    ring: "#767c89",
    sidebar: "#1c1f24",
    sidebarHover: "#262a31",
    sidebarSelected: "#30353d",
    surface3: "#262a31",
    surface4: "#333840",
    foregroundExtraMuted: "#767c89",
  },
};

export default function contribute(client: PluginClientContext) {
  for (const theme of [classicLight, classicDark, tahoeLight, tahoeDark]) {
    client.addTheme(theme);
  }
  return () => {};
}
