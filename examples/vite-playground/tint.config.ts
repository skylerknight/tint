import { defineConfig } from "@skylerknight/tint";

const tokens = {
  surface: {
    $role: "surface",
    well: { ls: 0 },
    DEFAULT: { ls: 1 },
    raised: { ls: 2, $reference: true },
    lowlight: { ls: 3 },
    highlight: { ls: 4 },
    selection: { ls: 6 },
  },
  text: {
    $on: "surface",
    $role: "text",
    heading: { lc: 90 },
    body: { lc: 75 },
    muted: { lc: 50 },
    placeholder: { lc: 40, $decorative: true },
  },
  border: {
    $on: "surface",
    $role: "border",
    $decorative: true,
    DEFAULT: { lc: 25 },
    subtle: { ls: 3 },
    strong: { lc: 40 },
  },
  action: {
    $on: "surface",
    $role: "action",
    DEFAULT: { lc: 60, $reference: true },
    hover: { lc: 68 },
    active: { lc: 52 },
    disabled: { lc: 25, $decorative: true },
    soft: { ls: 3 },
    "soft-hover": { ls: 4 },
    "soft-active": { ls: 5 },
  },
  on: {
    $role: "text",
    action: { lc: 60, $on: "action" },
    "action-soft": { lc: 75, $on: "action.soft" },
    "action-disabled": { lc: 45, $on: "action.disabled", $decorative: true },
  },
  ring: {
    $on: "surface",
    $role: "border",
    DEFAULT: { lc: 65 },
  },
} as const;

export default defineConfig([
  {
    name: "light",
    mode: "light",
    // Class selector + OS preference: applies automatically, and either class can
    // force a mode (the automatic block excludes the other theme's selector).
    selector: ".light",
    prefersColorScheme: "light",
    colors: {
      base: "#ffffff",
      brand: "#7c3aed",
      info: "#2563eb",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
    },
    tokens,
  },
  {
    name: "dark",
    mode: "dark",
    selector: ".dark",
    prefersColorScheme: "dark",
    colors: {
      base: "#1c1c1f",
      brand: "#a78bfa",
      info: "#60a5fa",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
    },
    tokens,
  },
]);
