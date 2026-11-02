import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthClient, AuthSession } from "./AuthClient";

type State = { status: "loading" } | { status: "out" } | { status: "in"; session: AuthSession };

interface AuthContextValue {
  state: State;
  client: AuthClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const apply = (s: AuthSession | null) => {
      if (alive) setState(s ? { status: "in", session: s } : { status: "out" });
    };
    void client.getSession().then(apply);
    const unsubscribe = client.onChange(apply);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [client]);

  const value = useMemo(() => ({ state, client }), [state, client]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in session; only call inside screens that are wrapped in <RequireAuth>. */
export function useSession(): AuthSession {
  const { state } = useAuth();
  if (state.status !== "in") throw new Error("useSession needs a signed-in user");
  return state.session;
}
