import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, useSession } from "../auth/AuthProvider";
import { lastGroup } from "../storage";
import { Avatar, ErrorNote, Lead, LinkButton, Loading, Mono, Page, RoleTag, TextButton } from "../ui";
import { useGroup } from "./useGroup";

const NEW_GROUP = "__nuevo__";

/** The group's home. For now: who is in it and how to invite; obras and sesiones come next. */
export function GroupScreen() {
  const { handle = "" } = useParams({ strict: false }) as { handle?: string };
  const navigate = useNavigate();
  const { client } = useAuth();
  const { user } = useSession();
  const { groups, group, members, role } = useGroup(handle);

  useEffect(() => {
    if (group) lastGroup.set(group.id);
  }, [group]);

  if (groups.isPending) return <Loading />;
  if (groups.isError) {
    return (
      <Page>
        <ErrorNote error={groups.error} />
      </Page>
    );
  }
  if (!group) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos ese grupo</h1>
        <p className="mt-3 text-lg text-gris">O todavía no eres parte de él.</p>
        <Link to="/" className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Ir al inicio
        </Link>
      </Page>
    );
  }

  const all = groups.data ?? [];
  return (
    <Page>
      <header className="flex items-center gap-3">
        <Avatar name={group.name} seed={group.id} size={48} />
        <div className="min-w-0 flex-1">
          {all.length > 1 ? (
            <select
              aria-label="Cambiar de grupo"
              value={group.handle}
              onChange={(e) =>
                void (e.target.value === NEW_GROUP
                  ? navigate({ to: "/grupos/nuevo" })
                  : navigate({ to: "/$handle", params: { handle: e.target.value } }))
              }
              className="w-full min-h-tactil rounded-2xl border border-linea bg-hoja px-3 text-lg font-bold"
            >
              {all.map((g) => (
                <option key={g.id} value={g.handle}>
                  {g.name}
                </option>
              ))}
              <option value={NEW_GROUP}>+ Crear otro grupo</option>
            </select>
          ) : (
            <p className="truncate text-xl font-bold">{group.name}</p>
          )}
          <Mono>
            {group.city ? `${group.city.toLowerCase()} · ` : ""}@{group.handle}
          </Mono>
        </div>
      </header>

      <h1 className="mt-8 text-5xl">{group.name}</h1>
      <div className="mt-3">
        <Lead>Aquí van a vivir las obras y las sesiones. Por ahora, invita a tu gente.</Lead>
      </div>

      {role === "admin" && (
        <div className="mt-6">
          <LinkButton to={`/${group.handle}/invitar`}>Invitar personas</LinkButton>
        </div>
      )}

      <h2 className="mt-8 border-b border-linea pb-2 text-xl font-bold">Miembros</h2>
      {members.isPending && <Mono>Cargando…</Mono>}
      {members.isError && <ErrorNote error={members.error} />}
      <ul>
        {members.data?.map((m) => (
          <li key={m.userId} className="flex items-center gap-4 border-b border-linea py-4">
            <Avatar name={m.displayName} seed={m.userId} />
            <span className="flex-1 text-lg">
              {m.displayName ?? "Sin nombre"}
              {m.userId === user.id && <span className="text-gris"> · tú</span>}
            </span>
            <RoleTag role={m.role} />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-center gap-6 pt-8">
        <Link to="/grupos/nuevo" className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde">
          Crear otro grupo
        </Link>
        <TextButton onClick={() => void client.signOut()}>Salir</TextButton>
      </div>
    </Page>
  );
}
