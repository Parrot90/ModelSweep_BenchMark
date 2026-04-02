/**
 * Theme-aware utility functions for adaptive text and component colors
 * Adapts to light and dark themes automatically
 */

/** 
 * Returns Tailwind classes that adapt to light/dark theme
 * Light mode: dark text, Light mode: light backgrounds
 * Dark mode: light text, dark mode: dark backgrounds
 */

export const themeColors = {
  // Text colors
  text: {
    primary: "text-[var(--text-primary)]",
    secondary: "text-[var(--text-secondary)]",
    muted: "text-[var(--text-muted)]",
  },

  // Background colors
  bg: {
    base: "bg-[var(--bg-base)]",
    elevated: "bg-[var(--bg-elevated)]",
    card: "bg-[var(--bg-card)]",
    cardAlt: "bg-[var(--bg-card-alt)]",
    hover: "bg-[var(--bg-hover)]",
    surface: "bg-[var(--bg-surface)]",
  },

  // Border colors
  border: {
    primary: "border-[var(--border-primary)] border",
    strong: "border-[var(--border-strong)] border",
    subtle: "border-[var(--border-subtle)] border",
  },

  // Accent colors
  accent: {
    default: "text-[var(--accent)]",
    strong: "text-[var(--accent-strong)]",
    muted: "text-[var(--accent-muted)]",
  },
};

/**
 * Get adaptive text color class based on theme
 * Usage: className={themeAdaptiveText()}
 */
export const themeAdaptiveText = (variant: "primary" | "secondary" | "muted" = "primary") => {
  return themeColors.text[variant];
};

/**
 * Get adaptive background class based on theme
 */
export const themeAdaptiveBg = (variant: "base" | "elevated" | "card" | "cardAlt" | "hover" | "surface" = "card") => {
  return themeColors.bg[variant];
};

/**
 * Get adaptive border class based on theme
 */
export const themeAdaptiveBorder = (variant: "primary" | "strong" | "subtle" = "primary") => {
  return themeColors.border[variant];
};

/**
 * Common patterns for cards and containers
 */
export const cardStyles = {
  default: `${themeColors.bg.card} ${themeColors.border.primary} backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:${themeColors.border.strong} transition-colors`,
  elevated: `${themeColors.bg.elevated} ${themeColors.border.primary} backdrop-blur-xl rounded-2xl shadow-lg`,
};

/**
 * Node styling for flow diagrams
 */
export const nodeStyles = {
  userMessage: `w-[420px] ${themeColors.bg.card} ${themeColors.border.primary} backdrop-blur-xl rounded-xl px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:${themeColors.border.strong} transition-colors`,
  modelResponse: `w-[420px] ${themeColors.bg.card} ${themeColors.border.primary} backdrop-blur-xl rounded-xl px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]`,
  scoreNode: `flex items-center gap-2 ${themeColors.bg.card} ${themeColors.border.primary} backdrop-blur-xl rounded-lg px-3 py-2`,
};

/**
 * Text styling utilities
 */
export const textStyles = {
  label: `${themeColors.text.secondary} text-xs uppercase tracking-widest font-semibold`,
  body: `${themeColors.text.primary} text-sm leading-7 whitespace-pre-wrap break-words font-medium`,
  small: `${themeColors.text.muted} text-xs font-mono`,
};
