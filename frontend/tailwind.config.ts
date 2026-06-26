import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../app/**/*.{ts,tsx}",
    "../components/**/*.{ts,tsx}",
    "../lib/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      // ─── shadcn/ui token system (HSL vars defined in globals.css) ───
      // Mapped onto the Morning brand palette so shadcn primitives inherit
      // the existing forest-green look out of the box.
      fontFamily: {
        // Morning design (2026-05-18) — Heebo for body (rounded, warm Hebrew),
        // Rubik for display weights. Inter kept in fallback chain for
        // tabular-nums compatibility across hundreds of existing usages.
        sans: ["Heebo", "Rubik", "Assistant", "system-ui", "sans-serif"],
        display: ["Rubik", "Heebo", "Assistant", "system-ui", "sans-serif"],
        manrope: ["Rubik", "Heebo", "Assistant", "system-ui", "sans-serif"],
        heading: ["Rubik", "Heebo", "Assistant", "system-ui", "sans-serif"],
        body: ["Heebo", "Rubik", "Assistant", "system-ui", "sans-serif"],
      },
      colors: {
        // ─── shadcn/ui semantic tokens ───
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ─── Morning — Light / Forest design system (2026-05-18) ───
        morning: {
          bg: "#F4F5F0", // warm cream page background
          surface: "#FFFFFF", // cards
          "surface-2": "#FAFAF7", // hover / subtle elevation
          "surface-3": "#F0F1EB", // pressed / deep hover
          border: "#E5E7EB", // subtle dividers
          "border-strong": "#D1D5DB",
          ink: "#1A1A1A", // primary text
          muted: "#6B7280", // secondary text
          subtle: "#9CA3AF", // tertiary text
          // Brand — forest green
          forest: "#2C7A5A",
          "forest-deep": "#1F5A42", // hover / pressed
          "forest-soft": "#4A9B7A", // accents
          // Light green — pills, illustrations, soft accents
          leaf: "#C5E89A",
          "leaf-soft": "#E8F4D1",
          "leaf-tint": "#F0F8E3",
          // Accent — violet for secondary links/actions
          violet: "#8B5CF6",
          "violet-soft": "#F3E8FF",
          // Coral — urgency without being aggressive
          coral: "#E07A7A",
          "coral-soft": "#FEE2E2",
          // Standard semantic
          success: "#059669",
          "success-soft": "#D1FAE5",
          warning: "#D97706",
          "warning-soft": "#FEF3C7",
          danger: "#DC2626",
          "danger-soft": "#FEE2E2",
          info: "#2563EB",
          "info-soft": "#DBEAFE",
        },
        // ─── Eclipse legacy aliases — REMAPPED to Morning so existing
        //     JSX continues to compile while inheriting the new look.
        eclipse: {
          bg: "#F4F5F0",
          surface: "#FFFFFF",
          "surface-2": "#FAFAF7",
          border: "#E5E7EB",
          "border-strong": "#D1D5DB",
          ink: "#1A1A1A",
          muted: "#6B7280",
          subtle: "#9CA3AF",
          lime: "#2C7A5A", // was lime — now forest green
          "lime-soft": "#4A9B7A",
          "lime-deep": "#1F5A42",
          success: "#059669",
          warning: "#D97706",
          danger: "#DC2626",
          info: "#2563EB",
        },
        // ─── Botanical legacy aliases — REMAPPED to Morning ───
        botanical: {
          forest: "#2C7A5A",
          secondary: "#4A9B7A",
          deep: "#1A1A1A",
          cream: "#F4F5F0",
          surface: "#FFFFFF",
          line: "#E5E7EB",
          ink: "#1A1A1A",
          sage: "#6B7280",
          "light-sage": "#FAFAF7",
          accent: "#2C7A5A",
        },
        verdant: {
          bg: "#F4F5F0",
          ink: "#1A1A1A",
          muted: "#6B7280",
          accent: "#2C7A5A",
          emerald: "#2C7A5A",
          line: "#E5E7EB",
          red: "#DC2626",
          amber: "#D97706",
        },
      },
      borderRadius: {
        // shadcn radius scale (driven by --radius)
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Morning custom radii
        card: "0.75rem", // 12px — Morning's signature soft radius
        btn: "9999px", // pill buttons
        organic: "1rem", // 16px
        input: "0.5rem", // 8px — tighter than card
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      boxShadow: {
        // Morning shadows — soft, low-opacity, designed for light bg
        sm: "0 1px 2px rgba(16, 24, 40, 0.04)",
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.04)",
        "card-hover":
          "0 2px 4px rgba(16, 24, 40, 0.06), 0 12px 24px rgba(16, 24, 40, 0.08)",
        soft: "0 12px 32px rgba(16, 24, 40, 0.08)",
        sidebar: "1px 0 0 rgba(16, 24, 40, 0.06)",
        glow:
          "0 0 0 3px rgba(44, 122, 90, 0.12), 0 4px 12px rgba(44, 122, 90, 0.16)",
        fab:
          "0 4px 12px rgba(44, 122, 90, 0.24), 0 8px 24px rgba(44, 122, 90, 0.16)",
      },
    },
  },
  plugins: [animate],
};

export default config;
