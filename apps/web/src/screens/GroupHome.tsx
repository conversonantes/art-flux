import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useApi } from "../api/ApiProvider";
import type { ProjectDto, SessionDto } from "../api/api";
import { formatSessionDate, sessionLabel, sessionSlug } from "../sessionFormat";
import { ErrorNote, Mono, Tag } from "../ui";

/** A project session lives under its project; a group session right under the group. */
function SessionLink({
  handle,
  projectSlug,
  session,
  className,
  children,
}: {
  handle: string;
  projectSlug: string | undefined;
  session: SessionDto;
  className: string;
  children: ReactNode;
}) {
  return projectSlug ? (
    <Link
      to="/$handle/$slug/$session"
      params={{ handle, slug: projectSlug, session: sessionSlug(session.number) }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link to="/$handle/$slug" params={{ handle, slug: sessionSlug(session.number) }} className={className}>
      {children}
    </Link>
  );
}

interface Props {
  group: { id: string; handle: string };
  projects: ProjectDto[] | undefined;
}

/** HU-09: "lo mío" — what is left to record, what I bring, and the sessions coming up. */
export function GroupHome({ group, projects }: Props) {
  const api = useApi();
  const home = useQuery({ queryKey: ["home", group.id], queryFn: () => api.home(group.id) });

  const slugOf = (s: SessionDto) => projects?.find((p) => p.id === s.projectId)?.slug;
  /** "cristina · S02", or just "S02" for a group session. */
  const where = (s: SessionDto) => [slugOf(s), sessionLabel(s.number)].filter(Boolean).join(" · ");
  const link = (s: SessionDto, className: string, children: ReactNode) => (
    <SessionLink handle={group.handle} projectSlug={slugOf(s)} session={s} className={className}>
      {children}
    </SessionLink>
  );

  if (home.isPending) return <Mono className="mt-6 block">Cargando lo tuyo…</Mono>;
  if (home.isError) {
    return (
      <div className="mt-6">
        <ErrorNote error={home.error} />
      </div>
    );
  }

  const { toRecord, mine, upcoming } = home.data;
  const nothing = toRecord.length + mine.length + upcoming.length === 0;

  return (
    <div>
      {nothing && (
        <p className="mt-6 rounded-3xl border border-dashed border-gris/50 p-5 font-lectura text-lg text-grafito/80">
          Nada pendiente por ahora. Cuando planees una sesión, aparece aquí.
        </p>
      )}

      {toRecord.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold">Falta registrar</h2>
            <Mono>{toRecord.length === 1 ? "1 sesión" : `${toRecord.length} sesiones`}</Mono>
          </div>
          <ul className="mt-3 space-y-3">
            {toRecord.map((s) => (
              <li key={s.id}>
                {link(
                  s,
                  "block min-h-tactil rounded-3xl border border-linea bg-hoja p-5",
                  <>
                    <span className="flex items-center gap-2">
                      <Tag tone="status">realizada</Tag>
                      <Mono>{where(s)}</Mono>
                    </span>
                    <span className="mt-2 block text-xl font-bold">{s.objective ?? "Sin objetivo todavía"}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold">A tu cargo</h2>
            <Mono>{mine.length}</Mono>
          </div>
          <ul className="mt-2 border-t border-linea">
            {mine.map(({ approach, session }) => (
              <li key={approach.id} className="border-b border-linea">
                {link(
                  session,
                  "flex min-h-tactil items-center gap-4 py-4",
                  <>
                    <span className="flex-1">
                      <span className="block text-xl font-bold">{approach.text}</span>
                      <Mono>{where(session)}</Mono>
                    </span>
                    <span aria-hidden className="text-2xl">›</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">Próximas sesiones</h2>
          <Link
            to="/$handle/sesiones/nueva"
            params={{ handle: group.handle }}
            className="inline-flex min-h-tactil items-center px-2 text-lg font-semibold text-verde"
          >
            + Nueva
          </Link>
        </div>
        {upcoming.length === 0 && <p className="py-2 text-lg text-gris">No hay sesiones planeadas.</p>}
        <ul className="mt-1 space-y-3">
          {upcoming.map(({ session, approachCount }) => (
            <li key={session.id}>
              {link(
                session,
                "block min-h-tactil rounded-3xl border border-linea bg-hoja p-5",
                <>
                  <Mono>
                    {where(session)} · {session.date ? formatSessionDate(session.date) : "fecha pendiente"}
                  </Mono>
                  <span className="mt-1 block text-xl font-bold">{session.objective ?? "Sin objetivo todavía"}</span>
                  <span className="mt-1 block text-base text-gris">
                    {approachCount === 1 ? "1 planteamiento" : `${approachCount} planteamientos`}
                  </span>
                </>,
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
