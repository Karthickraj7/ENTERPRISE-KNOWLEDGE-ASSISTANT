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
        inset: "var(--bg-inset)",
        ink: "var(--text-primary)",
        muted: "var(--text-secondary)",
        faint: "var(--text-tertiary)",
        subtle: "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          soft: "var(--accent-soft)",
          muted: "var(--accent-muted)"
        },
        cyan: {
          DEFAULT: "var(--accent-cyan)",
          soft: "var(--accent-cyan-soft)",
          border: "var(--accent-cyan-border)"
        },
        violet: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)"
        },
        status: {
          indexed: "var(--status-indexed)",
          "indexed-bg": "var(--status-indexed-bg)",
          "indexed-border": "var(--status-indexed-border)",
          processing: "var(--status-processing)",
          "processing-bg": "var(--status-processing-bg)",
          "processing-border": "var(--status-processing-border)",
          failed: "var(--status-failed)",
          "failed-bg": "var(--status-failed-bg)",
          "failed-border": "var(--status-failed-border)",
          warning: "var(--status-warning)",
          "warning-bg": "var(--status-warning-bg)",
          "warning-border": "var(--status-warning-border)",
          info: "var(--status-info)",
          "info-bg": "var(--status-info-bg)",
          "info-border": "var(--status-info-border)"
        }
      },
      borderRadius: {
        panel: "6px",
        control: "4px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        overlay: "var(--shadow-overlay)",
        "glow-violet": "var(--glow-violet)",
        "glow-cyan": "var(--glow-cyan)"
      },
      transitionTimingFunction: {
        default: "var(--ease-default)",
        spring: "var(--ease-spring)"
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)"
      },
      maxWidth: {
        content: "1280px",
        reading: "800px"
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed-width)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" }
        }
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "slide-up": "slide-up 180ms ease-out",
        "pulse-subtle": "pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      }
    }
  },
  plugins: []
};

export default config;
