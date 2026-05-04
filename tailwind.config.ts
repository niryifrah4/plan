import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Botanical Wealth font stack — Manrope for headings (Latin), Inter for body (Latin).
        // Assistant fallback for Hebrew (both have strong Hebrew alternatives).
        sans: ["Inter", "Assistant", "system-ui", "sans-serif"],
        manrope: ["Manrope", "Assistant", "system-ui", "sans-serif"],
        heading: ["Manrope", "Assistant", "system-ui", "sans-serif"],
        body: ["Inter", "Assistant", "system-ui", "sans-serif"],
      },
      colors: {
        // ─── Botanical Wealth — Single Source of Truth ───
        botanical: {
          forest: "#1B4332", // Primary — headings, CTA, brand
          secondary: "#2B694D", // Secondary — growth charts, positive indicators
          deep: "#012D1D", // Deepest — max contrast text
          cream: "#F9FAF2", // Background — all screens
          surface: "#FFFFFF", // Cards / elevated surfaces
          line: "#E8E9E1", // Borders, dividers
          ink: "#414844", // Sidebar text, body text
          sage: "#5C6058", // Secondary text, muted labels
          "light-sage": "#F3F4EC", // Active background (sidebar, chips)
          accent: "#C1ECD4", // Pale mint highlight
        },
        // ─── Legacy verdant palette — mapped to botanical tokens ───
        // Kept as CSS-friendly aliases so existing classes don't break.
        verdant: {
          bg: "#F9FAF2", // = botanical.cream
          ink: "#012D1D", // = botanical.deep
          muted: "#5C6058", // = botanical.sage
          accent: "#1B4332", // = botanical.forest (was #0a7a4a)
          emerald: "#2B694D", // = botanical.secondary (was #10b981)
          line: "#E8E9E1", // = botanical.line (was #d8e0d0)
          red: "#b91c1c",
          amber: "#f59e0b",
        },
      },
      borderRadius: {
        card: "1rem", // 16px — standard card radius (Botanical spec)
        btn: "2rem", // 32px — pill buttons
        organic: "3rem", // 48px — hero cards
        input: "0.75rem", // 12px — form inputs
      },
      boxShadow: {
        // Botanical shadow system — subtle greens
        sm: "0 1px 2px rgba(27, 67, 50, 0.04)",
        card: "0 1px 3px rgba(27, 67, 50, 0.04), 0 4px 16px rgba(27, 67, 50, 0.06)",
        "card-hover": "0 2px 8px rgba(27, 67, 50, 0.08), 0 12px 32px rgba(27, 67, 50, 0.10)",
        soft: "0 20px 50px rgba(27, 67, 50, 0.08)",
        sidebar: "1px 0 0 rgba(27, 67, 50, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
