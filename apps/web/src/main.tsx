import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createHttpApi } from "./api/api";
import { createSupabaseAuth } from "./auth/supabaseAuth";
import "./index.css";

// Composition root of the web: the only place that picks Supabase as the identity provider.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const container = document.getElementById("root")!;

if (!url || !anonKey) {
  container.textContent = "Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el .env de la raíz del proyecto.";
} else {
  const auth = createSupabaseAuth(url, anonKey);
  const api = createHttpApi(async () => (await auth.getSession())?.credential ?? null);
  createRoot(container).render(
    <StrictMode>
      <App auth={auth} api={api} />
    </StrictMode>,
  );
}
