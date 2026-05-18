import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // ─── Eclipse design (2026-05-19) — Rubik does Hebrew + Latin in one
        //     family. Inter remains in the fallback chain because we have
        //     hundreds of tabular-nums usages that already work with it.
        sans: ["Rubik", "Inter", "Assistant", "system-ui", "sans-serif"],
        display: ["Rubik", "Heebo", "Assistant", "system-ui", "sans-serif"],
        manrope: ["Rubik", "Manrope", "Assistant", "system-ui", "sans-serif"],
        heading: ["Rubik", "Heebo", "Assistant", "system-ui", "sans-serif"],
        body: ["Rubik", "Inter", "Assistant", "system-ui", "sans-serif"],
      },
      colors: {
        // ─── Eclipse — Dark / Lime design system (2026-05-19) ───
        eclipse: {
          bg: "#0A1929", // page background — deep navy
          surface: "#131C2E", // cards, raised panels
          "surface-2": "#1A2438", // hover / elevated surface
          border: "#1F2A3F", // subtle dividers
          "border-strong": "#2A3754",
          ink: "#F8FAFC", // primary text
          muted: "#94A3B8", // secondary text
          subtle: "#64748B", // tertiary text
          // Brand accent — Eclipse lime
          lime: "#A8E040",
          "lime-soft": "#CDF075",
          "lime-deep": "#7BB930",
          // Functional semantics on dark
          success: "#4ADE80",
          warning: "#FBBF24",
          danger: "#F87171",
          info: "#60A5FA",
        },
        // ─── Botanical legacy aliases — REMAPPED to Eclipse so existing
        //     JSX continues to compile while inheriting the new palette.
        botanical: {
          forest: "#A8E040", // primary CTA → lime
          secondary: "#4ADE80", // positive → mint
          deep: "#F8FAFC", // primary text on dark
          cream: "#0A1929", // background
          surface: "#131C2E",
          line: "#1F2A3F",
          ink: "#F8FAFC",
          sage: "#94A3B8",
          "light-sage": "#1A2438",
          accent: "#A8E040",
        },
        verdant: {
          bg: "#0A1929",
          ink: "#F8FAFC",
          muted: "#94A3B8",
          accent: "#A8E040",
          emerald: "#A8E040",
          line: "#1F2A3F",
          red: "#F87171",
          amber: "#FBBF24",
        },
      },
      borderRadius: {
        card: "1rem", // 16px
        btn: "2rem", // 32px
        organic: "1.25rem", // 20px — Eclipse is less round than Botanical
        input: "0.75rem", // 12px
      },
      boxShadow: {
        // Eclipse shadows are dark-on-dark + an optional lime ambient glow.
        sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
        card: "0 1px 3px rgba(0, 0, 0, 0.25), 0 4px 14px rgba(0, 0, 0, 0.35)",
        "card-hover":
          "0 2px 8px rgba(0, 0, 0, 0.35), 0 12px 30px rgba(0, 0, 0, 0.45)",
        soft: "0 20px 50px rgba(0, 0, 0, 0.5)",
        sidebar: "1px 0 0 rgba(255, 255, 255, 0.04)",
        glow:
          "0 0 0 1px rgba(168, 224, 64, 0.25), 0 8px 24px rgba(168, 224, 64, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
