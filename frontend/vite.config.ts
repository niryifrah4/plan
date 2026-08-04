import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
  const env = loadEnv(mode, root("../"), "");

  return {
    plugins: [react()],
    resolve: {
      // Reused root components resolve React from the repo root; force a single
      // copy (the frontend's) to avoid duplicate-React runtime + type skew.
      // zod is hoisted to the repo root at v3 (backend dep); force the
      // frontend's own v4 so @hookform/resolvers can import zod/v4/core.
      dedupe: ["react", "react-dom", "zod"],
      alias: [
        { find: "server-only", replacement: root("./src/adapters/empty.ts") },
        { find: "@supabase/ssr", replacement: root("./src/adapters/supabase-ssr.ts") },
        
        // Map shared Supabase clients to the Vite singleton
        { find: "@/lib/supabase/browser", replacement: root("./src/lib/supabase.ts") },
        { find: "@/lib/supabase/client", replacement: root("./src/lib/supabase.ts") },
        { find: "@/lib/supabase/server", replacement: root("./src/lib/supabase.ts") },

        // App code: @/ resolves to the repo ROOT so the SPA reuses the existing
        // components/, lib/, hooks/, types/ verbatim. @shared per the root tsconfig.
        { find: "@shared", replacement: root("../lib/_shared") },
        // SPA-internal code lives under ~/ (→ src). Must come before @/ so it
        // isn't swallowed, and @/ maps to the repo root for reused app code.
        { find: /^~\//, replacement: root("./src/") },
        { find: /^@\//, replacement: root("../") },
      ],
    },
    define: {
      // Shared browser Supabase code reads Vite's VITE_* variables.
      // Map those to the Vite VITE_* values so it works without edits.
      "process.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ""),
      "process.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""),
      "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: "http://localhost:3001", changeOrigin: true },
      },
    },
  };
});
