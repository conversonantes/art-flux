import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApi } from "../api/ApiProvider";
import { STATUS_LABEL } from "../projectLabels";
import { formatSessionDate, sessionLabel, sessionSlug } from "../sessionFormat";
import { useAuth, useSession } from "../auth/AuthProvider";
import { lastGroup } from "../storage";
import { Avatar, ErrorNote, Lead, LinkButton, Loading, Mono, Page, RoleTag, Tag, TextButton } from "../ui";
import { GroupHome } from "./GroupHome";
import { useGroup } from "./useGroup";

const NEW_GROUP = "__nuevo__";

/** The group's home. For now: who is in it and how to invite; obras and sesiones come next. */
export function GroupScreen() {
  const { handle = "" } = useParams({ strict: false }) as { handle?: string };
  const navigate = useNavigate();
  const { client } = useAuth();
  const { user } = useSession();
  const { groups, group, members, role } = useGroup(handle);
  const api = useApi();
  const groupSessions = useQuery({
    queryKey: ["sessions", group?.id, "none"],
    queryFn: () => api.sessions(group!.id, "none"),
    enabled: !!group,
  });
  const projects = useQuery({
    queryKey: ["projects", group?.id],
    queryFn: () => api.projects(group!.id),
    enabled: !!group,
  });

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

      <h1 className="mt-8 text-5xl">Hola, {user.name?.split(" ")[0] ?? "bienvenida"}.</h1>
      <div className="mt-3">
        <Lead>Esto es lo que te toca.</Lead>
      </div>

      <GroupHome group={group} projects={projects.data} />

      <section className="mt-8">
        <div className="flex items-center justify-between border-b border-linea pb-2">
          <h2 className="text-xl font-bold">Obras</h2>
          {role === "admin" && (
            <Link
              to="/$handle/obras/nueva"
              params={{ handle: group.handle }}
              className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
            >
              + Nueva obra
            </Link>
          )}
        </div>
        {projects.isPending && <Mono>Cargando…</Mono>}
        {projects.isError && <ErrorNote error={projects.error} />}
        {projects.data?.length === 0 && (
          <p className="py-4 text-lg text-gris">
            Todavía no hay obras.{role === "admin" ? " Crea la primera para empezar a registrar." : ""}
          </p>
        )}
        <ul>
          {projects.data?.map((p) => (
            <li key={p.id} className="border-b border-linea">
              <Link
                to="/$handle/$slug"
                params={{ handle: group.handle, slug: p.slug }}
                className="flex items-center gap-4 py-4"
              >
                <span className="flex-1">
                  <span className="block text-xl font-bold">{p.title}</span>
                  <Mono>
                    {group.handle}/{p.slug}
                  </Mono>
                </span>
                <Tag>{STATUS_LABEL[p.status].toLowerCase()}</Tag>
                <span aria-hidden className="text-2xl">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between border-b border-linea pb-2">
          <h2 className="text-xl font-bold">Sesiones del grupo</h2>
          <Link
            to="/$handle/sesiones/nueva"
            params={{ handle: group.handle }}
            className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
          >
            + Nueva sesión
          </Link>
        </div>
        {groupSessions.isError && <ErrorNote error={groupSessions.error} />}
        {groupSessions.data?.length === 0 && (
          <p className="py-4 text-lg text-gris">Las sesiones que aún no son de una obra aparecen aquí.</p>
        )}
        <ul>
          {[...(groupSessions.data ?? [])].reverse().map((s) => (
            <li key={s.id} className="border-b border-linea">
              <Link
                to="/$handle/$slug"
                params={{ handle: group.handle, slug: sessionSlug(s.number) }}
                className="flex items-center gap-4 py-4"
              >
                <span className="flex-1">
                  <Mono className="block">
                    {sessionLabel(s.number)} · {s.date ? formatSessionDate(s.date) : "fecha pendiente"}
                  </Mono>
                  <span className="block text-xl font-bold">{s.objective ?? "Sin objetivo todavía"}</span>
                </span>
                <span aria-hidden className="text-2xl">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {role === "admin" && (
        <div className="mt-6">
          <LinkButton to={`/${group.handle}/invitar`} variant="outline">
            Invitar personas
          </LinkButton>
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
