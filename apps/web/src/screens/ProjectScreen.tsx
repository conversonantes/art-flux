import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { formatSessionDate, sessionLabel, sessionSlug } from "../sessionFormat";
import { Avatar, BackLink, ErrorNote, Loading, Mono, Page, Tag } from "../ui";
import { STATUS_LABEL, rolesText } from "../projectLabels";
import { useSession } from "../auth/AuthProvider";
import { MediaList } from "./MediaList";
import { useProject } from "./useProject";

/** HU-05 / HU-06: the project's page. Sessions and counters arrive with HU-07 onwards. */
export function ProjectScreen() {
  const { handle = "", slug = "" } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const { groups, group, members, role, project, team } = useProject(handle, slug);
  const api = useApi();
  const { user } = useSession();
  const sessions = useQuery({
    queryKey: ["sessions", group?.id, project.data?.id],
    queryFn: () => api.sessions(group!.id, { project: project.data!.id }),
    enabled: !!group && !!project.data,
  });

  if (groups.isPending || (group && project.isPending)) return <Loading />;
  if (project.isError || !group || !project.data) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos esa obra</h1>
        <p className="mt-3 text-lg text-gris">Puede que no exista o que no seas parte del grupo.</p>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }

  const p = project.data;
  const isAdmin = role === "admin";
  const names = new Map(members.data?.map((m) => [m.userId, m.displayName]) ?? []);

  return (
    <Page>
      <header className="flex items-center gap-3">
        <BackLink to={`/${handle}`} label="Volver al grupo" />
        <span className="flex-1 truncate font-mono text-sm text-gris">
          {handle}/<span className="text-grafito">{p.slug}</span>
        </span>
        {isAdmin && (
          <Link
            to="/$handle/$slug/editar"
            params={{ handle, slug }}
            aria-label="Editar obra"
            className="inline-flex size-12 items-center justify-center rounded-2xl border border-linea bg-hoja text-xl"
          >
            ✎
          </Link>
        )}
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <Tag tone="status">{STATUS_LABEL[p.status].toLowerCase()}</Tag>
        <Tag>⚿ solo el grupo</Tag>
      </div>
      <h1 className="mt-3 text-6xl leading-none">{p.title}</h1>
      {p.themes.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Temas">
          {p.themes.map((t) => (
            <li key={t}>
              <Tag>#{t}</Tag>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 border-t-2 border-grafito pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">Equipo</h2>
          {isAdmin && (
            <Link
              to="/$handle/$slug/equipo"
              params={{ handle, slug }}
              className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
            >
              Editar
            </Link>
          )}
        </div>
        {team.isError && <ErrorNote error={team.error} />}
        {team.data?.length === 0 && (
          <p className="mt-3 text-lg text-gris">
            Todavía no hay equipo.{isAdmin ? " Agrega a quienes participan y sus roles." : ""}
          </p>
        )}
        <ul className="mt-2">
          {team.data?.map((m) => {
            const name = m.displayName ?? names.get(m.userId);
            return (
              <li key={m.userId} className="flex items-center gap-4 py-3">
                <Avatar name={name} seed={m.userId} size={56} />
                <span className="flex-1 text-xl">{name ?? "Sin nombre"}</span>
                <Mono>{rolesText(m.roles)}</Mono>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">Sesiones</h2>
          <Link
            to="/$handle/$slug/sesiones/nueva"
            params={{ handle, slug }}
            className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
          >
            + Nueva
          </Link>
        </div>
        {sessions.isError && <ErrorNote error={sessions.error} />}
        {sessions.data?.length === 0 && (
          <p className="mt-3 text-lg text-gris">Todavía no hay sesiones. Crea la primera para empezar a planear.</p>
        )}
        <ol className="mt-4">
          {[...(sessions.data ?? [])].reverse().map((s) => (
            <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
              <span
                aria-hidden
                className={`z-10 mt-1 size-6 shrink-0 rounded-full border-2 border-grafito ${
                  s.status === "completed" ? "bg-grafito" : "border-dashed bg-fondo"
                }`}
              />
              <Link
                to="/$handle/$slug/$session"
                params={{ handle, slug, session: sessionSlug(s.number) }}
                className="min-w-0 flex-1"
              >
                <Mono className="block">
                  {sessionLabel(s.number)} · {s.status === "planned" ? "planeada" : "realizada"} ·{" "}
                  {s.date ? formatSessionDate(s.date) : "fecha pendiente"}
                  {s.place ? ` · ${s.place}` : ""}
                </Mono>
                <span className="mt-1 block text-xl font-bold">{s.objective ?? "Sin objetivo todavía"}</span>
                {s.id === p.originSessionId && (
                  <span className="mt-2 inline-block rounded-af-chico bg-resaltador px-2 py-0.5 font-mono text-sm">
                    origen de la obra
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">Material</h2>
          <Link
            to="/$handle/registrar"
            params={{ handle }}
            search={{ obra: p.id }}
            className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
          >
            + Registrar
          </Link>
        </div>
        <p className="mt-1 text-base text-gris">Lo que se registra sin sesión queda aquí, para ordenarlo después.</p>
        <div className="mt-3">
          <MediaList
            projectId={p.id}
            members={members.data ?? []}
            currentUserId={user.id}
            isAdmin={isAdmin}
            unassignedOnly
            label="Material de la obra"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-3xl font-bold">Acuerdo de visibilidad</h2>
        {p.visibilityAgreement ? (
          <p className="mt-3 whitespace-pre-line font-lectura text-xl leading-relaxed">{p.visibilityAgreement}</p>
        ) : (
          <p className="mt-3 font-lectura text-xl text-gris">
            Todavía no hay un acuerdo escrito sobre qué mostrar fuera del grupo.
            {isAdmin && (
              <>
                {" "}
                <Link to="/$handle/$slug/editar" params={{ handle, slug }} className="font-interfaz font-semibold text-verde">
                  Escribirlo
                </Link>
              </>
            )}
          </p>
        )}
      </section>
    </Page>
  );
}
