// Single source of truth for JobGenius brand colors (the logo + signup +
// extension all use violet primary / orange accent). Import these instead of
// hard-coding hexes so surfaces stay consistent.
export const BRAND = {
  violet: "#7c3aed",
  violetDark: "#6d28d9",
  violet50: "#f5f3ff",
  violet100: "#ede9fe",
  orange: "#f97316",
  orange600: "#ea580c",
  orange50: "#fff7ed",
  ink: "#111827",
  gray: "#6b7280",
  gray200: "#e5e7eb",
} as const;
