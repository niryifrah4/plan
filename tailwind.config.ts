import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Assistant", "system-ui", "sans-serif"],
      },
      colors: {
        verdant: {
          bg: "#f9faf2",
          ink: "#012d1d",
          muted: "#5a7a6a",
          accent: "#0a7a4a",
          emerald: "#10b981",
          line: "#d8e0d0",
          red: "#b91c1c",
          amber: "#f59e0b",
        },
      },
      borderRadius: {
        card: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)",
      },
    },
  },
  plugins: [],
};

export default config;
