import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { useSession } from "../auth/AuthProvider";
import { ApproachesSection } from "./ApproachesSection";
import { formatSessionDate, isPastDate, sessionLabel } from "../sessionFormat";
import { BackLink, ErrorNote, Loading, Mono, Page, Tag } from "../ui";
import { useGroup } from "./useGroup";

/**
 * A session's page: what is planned (objective, date, place) and, below, its approaches.
 * `projectSlug` is absent for group-level sessions.
 */
export function SessionScreen({ handle, projectSlug, number }: { handle: string; projectSlug?: string; number: number }) {
  const api = useApi();
  const { groups, group, members } = useGroup(handle);
  const { user } = useSession();

  const session = useQuery({
    queryKey: ["session", group?.id, projectSlug ?? null, number],
    queryFn: () => api.session(group!.id, number, projectSlug),
    enabled: !!group,
  });

  if (groups.isPending || (group && (session.isPending || members.isPending))) return <Loading />;
  if (session.isError || !group || !session.data) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos esa sesión</h1>
        {session.isError && (
          <div className="mt-3">
            <ErrorNote error={session.error} />
          </div>
        )}
        <Link
          to={projectSlug ? `/${handle}/${projectSlug}` : `/${handle}`}
          className="mt-4 min-h-tactil text-lg font-semibold text-verde"
        >
          Volver
        </Link>
      </Page>
    );
  }

  const s = session.data;
  const where = [s.date ? formatSessionDate(s.date) : "fecha pendiente", s.place].filter(Boolean).join(" · ");
  return (
    <Page>
      <header className="flex items-center gap-3">
        <BackLink to={projectSlug ? `/${handle}/${projectSlug}` : `/${handle}`} label="Volver" />
        <span className="flex-1 truncate font-mono text-sm text-gris">
          {handle}/{projectSlug ? `${projectSlug}/` : ""}
          <span className="text-grafito">{sessionLabel(s.number).toLowerCase()}</span>
        </span>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Mono>sesión #{String(s.number).padStart(2, "0")}</Mono>
        <span className="rounded-af-chico border border-dashed border-grafito px-2 py-0.5 font-mono text-sm">
          {s.status === "planned" ? "planeada" : "realizada"}
        </span>
        {s.date && isPastDate(s.date) && s.status === "planned" && <Tag>pasada</Tag>}
      </div>

      <h1 className="mt-3 text-5xl leading-tight">{s.objective ?? "Sin objetivo todavía"}</h1>
      <p className="mt-3 font-mono text-base text-gris">{where}</p>

      <ApproachesSection
        sessionId={s.id}
        members={members.data ?? []}
        currentUserId={user.id}
        editable={s.status === "planned"}
      />
    </Page>
  );
}
