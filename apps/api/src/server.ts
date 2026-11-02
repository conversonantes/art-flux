// Local dev server: `pnpm --filter @art-flux/api dev`. Production runs the same app as a Netlify Function.
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { supabaseOptions } from "./supabase";

try {
  process.loadEnvFile("../../.env");
} catch {
  // Variables may already be in the environment (CI, hosting).
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(supabaseOptions({ SUPABASE_URL, SUPABASE_ANON_KEY })).fetch, port }, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
