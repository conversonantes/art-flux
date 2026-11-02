import { Link, useParams } from "@tanstack/react-router";
import { Avatar, BackLink, ErrorNote, Loading, Mono, Page, Tag } from "../ui";
import { STATUS_LABEL, rolesText } from "../projectLabels";
import { useProject } from "./useProject";

/** HU-05 / HU-06: the project's page. Sessions and counters arrive with HU-07 onwards. */
export function ProjectScreen() {
  const { handle = "", slug = "" } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const { groups, group, members, role, project, team } = useProject(handle, slug);

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
        <h2 className="text-3xl font-bold">Sesiones</h2>
        <p className="mt-3 text-lg text-gris">Pronto podrás planear y registrar aquí las sesiones de la obra.</p>
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
