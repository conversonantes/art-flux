import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { ROLE_OPTIONS } from "../projectLabels";
import { Avatar, BackLink, Chip, ErrorNote, Lead, LinkButton, Loading, Mono, Page, TextButton } from "../ui";
import { useProject } from "./useProject";

/** HU-06: an admin builds the project's team and gives each person artistic roles. */
export function TeamScreen() {
  const { handle = "", slug = "" } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const api = useApi();
  const queryClient = useQueryClient();
  const { groups, group, members, role, project, team } = useProject(handle, slug);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team", project.data?.id] });

  const setRoles = useMutation({
    mutationFn: (v: { userId: string; roles: string[] }) => api.setRoles(project.data!.id, v.userId, v.roles),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeFromTeam(project.data!.id, userId),
    onSuccess: refresh,
  });

  if (groups.isPending || (group && (members.isPending || project.isPending || team.isPending))) return <Loading />;
  if (!group || !project.data) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos esa obra</h1>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }
  if (role !== "admin") {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">Solo los admins editan el equipo</h1>
        <Link to="/$handle/$slug" params={{ handle, slug }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver a la obra
        </Link>
      </Page>
    );
  }

  const onTeam = team.data ?? [];
  const names = new Map(members.data?.map((m) => [m.userId, m.displayName]) ?? []);
  const candidates = (members.data ?? []).filter((m) => !onTeam.some((t) => t.userId === m.userId));
  const busy = setRoles.isPending || remove.isPending;

  function toggle(userId: string, current: string[], value: string) {
    const next = current.includes(value) ? current.filter((r) => r !== value) : [...current, value];
    setRoles.mutate({ userId, roles: next });
  }

  return (
    <Page>
      <div className="flex items-center gap-4">
        <BackLink to={`/${handle}/${slug}`} label="Volver a la obra" />
        <Mono>{slug}/equipo</Mono>
      </div>

      <h1 className="mt-6 text-5xl">Equipo de la obra</h1>
      <div className="mt-3">
        <Lead>Los roles son artísticos: dicen quién hace qué, no cambian lo que cada uno puede hacer en la app.</Lead>
      </div>

      {(setRoles.isError || remove.isError || team.isError) && (
        <div className="mt-4">
          <ErrorNote error={setRoles.error ?? remove.error ?? team.error} />
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {onTeam.map((m) => {
          const name = m.displayName ?? names.get(m.userId) ?? "Sin nombre";
          return (
            <li key={m.userId} className="rounded-3xl border border-linea bg-hoja p-5">
              <div className="flex items-center gap-4">
                <Avatar name={name} seed={m.userId} size={56} />
                <span className="flex-1 text-xl font-semibold">{name}</span>
                <TextButton onClick={() => remove.mutate(m.userId)} disabled={busy} aria-label={`Quitar a ${name} del equipo`}>
                  Quitar
                </TextButton>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <Chip
                    key={r.value}
                    selected={m.roles.includes(r.value)}
                    disabled={busy}
                    onClick={() => toggle(m.userId, m.roles, r.value)}
                  >
                    {r.label}
                  </Chip>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-4 rounded-3xl border border-dashed border-gris/60 p-4">
        <h2 className="text-lg font-semibold">+ Agregar a alguien del grupo</h2>
        {candidates.length === 0 ? (
          <p className="mt-2 text-base text-gris">Ya están todas las personas del grupo.</p>
        ) : (
          <ul className="mt-2">
            {candidates.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2">
                <Avatar name={m.displayName} seed={m.userId} size={40} />
                <span className="flex-1 text-lg">{m.displayName ?? "Sin nombre"}</span>
                <TextButton
                  onClick={() => setRoles.mutate({ userId: m.userId, roles: [] })}
                  disabled={busy}
                  aria-label={`Agregar a ${m.displayName ?? "esta persona"}`}
                >
                  Agregar
                </TextButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-auto pt-8">
        <LinkButton to={`/${handle}/${slug}`}>Listo</LinkButton>
      </div>
    </Page>
  );
}
