import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useApi } from "../api/ApiProvider";
import { useAuth } from "../auth/AuthProvider";
import { lastGroup, pendingInvite } from "../storage";
import { ErrorNote, Loading, Mono, Page } from "../ui";

/** HU-03: someone opens an invite link (/i/<code>). Signed out, they sign in first and come back. */
export function AcceptInviteScreen() {
  const { token = "" } = useParams({ strict: false }) as { token?: string };
  const { state } = useAuth();

  if (state.status === "loading") return <Loading />;
  if (state.status === "out") {
    pendingInvite.set(token);
    return <Navigate to="/entrar" replace />;
  }
  return <Accept token={token} />;
}

function Accept({ token }: { token: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async (group) => {
      pendingInvite.clear();
      lastGroup.set(group.id);
      await queryClient.invalidateQueries();
      await navigate({ to: "/$handle", params: { handle: group.handle }, replace: true });
    },
    onError: () => pendingInvite.clear(),
  });

  // Once per mount; React may mount effects twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    accept.mutate();
  }, [accept]);

  if (accept.isError) {
    return (
      <Page className="justify-center">
        <Mono>invitación</Mono>
        <h1 className="mt-2 text-4xl">No pudimos unirte</h1>
        <div className="my-5">
          <ErrorNote error={accept.error} />
        </div>
        <Link to="/" className="min-h-tactil text-lg font-semibold text-verde">
          Ir al inicio
        </Link>
      </Page>
    );
  }
  return <Loading text="Entrando al grupo…" />;
}
