import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        ink: "var(--text-primary)",
        muted: "var(--text-secondary)",
        subtle: "var(--border-subtle)",
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)"
        },
        status: {
          indexed: "var(--status-indexed)",
          processing: "var(--status-processing)",
          failed: "var(--status-failed)",
          warning: "var(--status-warning)"
        }
      },
      borderRadius: {
        panel: "6px",
        control: "4px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
