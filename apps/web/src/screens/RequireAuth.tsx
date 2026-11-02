import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Loading } from "../ui";

/** Renders its children only for a signed-in person; everyone else goes to /entrar. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === "loading") return <Loading />;
  if (state.status === "out") return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}
