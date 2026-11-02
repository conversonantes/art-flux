import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApi } from "../api/ApiProvider";
import { useSession } from "../auth/AuthProvider";
import { lastGroup, pendingInvite } from "../storage";
import { Avatar, ErrorNote, Lead, Loading, Mono, Page } from "../ui";

/** HU-02: after signing in, go to your group, pick one, or be offered to create one. */
export function HomeScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const pending = pendingInvite.get();

  // An invite opened before signing in is resumed first.
  useEffect(() => {
    if (pending) void navigate({ to: "/i/$token", params: { token: pending }, replace: true });
  }, [pending, navigate]);

  const start = useQuery({
    queryKey: ["start"],
    queryFn: () => api.start(lastGroup.get() ?? undefined),
    enabled: !pending,
  });

  const data = start.data;
  useEffect(() => {
    if (data?.destination === "group") {
      void navigate({ to: "/$handle", params: { handle: data.group.handle }, replace: true });
    }
  }, [data, navigate]);

  if (pending || start.isPending || data?.destination === "group") return <Loading />;
  if (start.isError) {
    return (
      <Page>
        <ErrorNote error={start.error} />
      </Page>
    );
  }
  if (data?.destination === "choose") return <ChooseGroup groups={data.groups} />;
  return <NoGroup />;
}

function NoGroup() {
  const { user } = useSession();
  return (
    <Page>
      <div className="flex items-center gap-4">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-grafito text-3xl font-bold text-white">
          {(user.name?.[0] ?? "?").toUpperCase()}
        </span>
        <div>
          <Mono>perfil creado desde Google</Mono>
          <p className="text-xl font-bold">{user.name ?? "Sin nombre"}</p>
        </div>
      </div>

      <h1 className="mt-8 text-5xl leading-tight">Todavía no estás en ningún grupo.</h1>
      <div className="mt-3">
        <Lead>Puedes abrir uno para tu proceso o mirar lo que otros grupos han decidido mostrar.</Lead>
      </div>

      <div className="mt-8 space-y-3">
        <Link
          to="/grupos/nuevo"
          className="flex items-center gap-4 rounded-3xl bg-grafito p-5 text-white"
        >
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-resaltador text-3xl text-grafito">
            +
          </span>
          <span className="flex-1">
            <span className="block text-xl font-bold">Crear un grupo</span>
            <span className="block text-base text-white/70">Quedas como admin y puedes invitar</span>
          </span>
          <span aria-hidden className="text-2xl">›</span>
        </Link>

        <div
          aria-disabled
          className="flex items-center gap-4 rounded-3xl border border-linea bg-hoja p-5 opacity-60"
        >
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl border border-linea bg-fondo text-2xl">
            ⌕
          </span>
          <span className="flex-1">
            <span className="block text-xl font-bold">Explorar procesos</span>
            <span className="block text-base text-gris">Pronto: lo que cada grupo marque como visible</span>
          </span>
        </div>
      </div>

      <p className="mt-auto rounded-3xl border border-dashed border-gris/50 p-5 font-lectura text-lg text-grafito/80">
        ¿Te invitaron a un grupo? Abre el enlace que te mandaron y entras directo.
      </p>
    </Page>
  );
}

function ChooseGroup({ groups }: { groups: { id: string; handle: string; name: string; city?: string }[] }) {
  return (
    <Page>
      <h1 className="text-5xl leading-tight">¿A qué grupo entras?</h1>
      <div className="mt-6 space-y-3">
        {groups.map((g) => (
          <Link
            key={g.id}
            to="/$handle"
            params={{ handle: g.handle }}
            className="flex items-center gap-4 rounded-3xl border border-linea bg-hoja p-5"
          >
            <Avatar name={g.name} seed={g.id} size={52} />
            <span className="flex-1">
              <span className="block text-xl font-bold">{g.name}</span>
              <Mono>{g.city ? `${g.city.toLowerCase()} · ` : ""}@{g.handle}</Mono>
            </span>
            <span aria-hidden className="text-2xl">›</span>
          </Link>
        ))}
      </div>
      <Link to="/grupos/nuevo" className="mt-6 inline-flex min-h-tactil items-center self-start px-2 text-lg font-semibold text-verde">
        Crear otro grupo
      </Link>
    </Page>
  );
}
