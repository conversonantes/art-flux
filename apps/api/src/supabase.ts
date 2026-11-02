import { createClient } from "@supabase/supabase-js";
import { SupabaseGroupsRepo, SupabaseInvitesRepo } from "@art-flux/adapters";
import { randomTokenGenerator } from "@art-flux/core";
import type { AppOptions } from "./app";

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/**
 * Wires the app to Supabase. Only the *anon* key lives here: every request gets a client
 * carrying the user's own JWT, so RLS applies even if a route has a bug. The service_role
 * key is deliberately never used by the API.
 */
export function supabaseOptions(env: SupabaseEnv): AppOptions {
  const base = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, base);
  const clock = { now: () => new Date() };

  return {
    async authenticate(token) {
      // Asks Supabase Auth to validate the token (signature, expiry, revoked sessions).
      const { data, error } = await anon.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    depsFor(token) {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        ...base,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      return {
        groups: new SupabaseGroupsRepo(db),
        invites: new SupabaseInvitesRepo(db),
        clock,
        tokens: randomTokenGenerator,
      };
    },
  };
}
