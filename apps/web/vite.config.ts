import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The single .env lives at the repo root. Only these two public values reach the browser:
// the project URL and the anon key (safe by design; RLS protects the data). Never the service_role.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.SUPABASE_URL ?? ""),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY ?? ""),
    },
    server: {
      port: 5173,
      // Same origin in dev and in production, so no CORS: /api/* goes to the Hono API.
      proxy: {
        "/api": {
          target: `http://localhost:${env.PORT ?? 8787}`,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
