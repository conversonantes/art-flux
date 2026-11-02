import { createClient, type Session } from "@supabase/supabase-js";
import type { AuthClient, AuthSession } from "./AuthClient";

const toSession = (s: Session | null): AuthSession | null =>
  s
    ? {
        credential: s.access_token,
        user: {
          id: s.user.id,
          ...(s.user.user_metadata?.full_name ? { name: String(s.user.user_metadata.full_name) } : {}),
          ...(s.user.email ? { email: s.user.email } : {}),
        },
      }
    : null;

/** The one place in the web that imports the Supabase SDK. */
export function createSupabaseAuth(url: string, anonKey: string): AuthClient {
  const supabase = createClient(url, anonKey, { auth: { flowType: "pkce" } });
  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    onChange(callback) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
  };
}
