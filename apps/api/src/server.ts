// Composition root for local dev: `pnpm --filter @art-flux/api dev`.
// Production runs the same app as a Netlify Function. This is where an identity/storage
// provider is chosen; the routes in app.ts know nothing about which one.
import { serve } from "@hono/node-server";
import { supabaseWiring } from "@art-flux/adapters";
import { createApp } from "./app";

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
const app = createApp(supabaseWiring({ SUPABASE_URL, SUPABASE_ANON_KEY }));
serve({ fetch: app.fetch, port }, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
