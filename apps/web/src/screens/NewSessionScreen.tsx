import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useApi } from "../api/ApiProvider";
import { isPastDate, sessionLabel, sessionSlug, todayIso } from "../sessionFormat";
import { BackLink, Button, ErrorNote, Field, Loading, Mono, Page } from "../ui";
import { useGroup } from "./useGroup";

type DateMode = "today" | "other" | "pending";
const DATE_MODES: { value: DateMode; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "other", label: "Otra fecha" },
  { value: "pending", label: "Pendiente" },
];

const GROUP = "";

/** HU-07: any member plans a session of the group or of a project. */
export function NewSessionScreen() {
  const { handle = "", slug } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { groups, group, members } = useGroup(handle);

  const projects = useQuery({
    queryKey: ["projects", group?.id],
    queryFn: () => api.projects(group!.id),
    enabled: !!group,
  });

  // The session belongs to a project (by slug) or to the group (empty value).
  const [belongs, setBelongs] = useState<string>(slug ?? GROUP);
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [otherDate, setOtherDate] = useState("");
  const [place, setPlace] = useState("");
  const [objective, setObjective] = useState("");

  const project = projects.data?.find((p) => p.slug === belongs);
  const scope = project ? { project: project.id } : ("none" as const);
  const existing = useQuery({
    queryKey: ["sessions", group?.id, scope === "none" ? "none" : scope.project],
    queryFn: () => api.sessions(group!.id, scope),
    enabled: !!group && projects.isSuccess,
  });
  const nextNumber = existing.data ? Math.max(0, ...existing.data.map((s) => s.number)) + 1 : null;

  const date = dateMode === "today" ? todayIso() : dateMode === "other" ? otherDate : null;
  const missingDate = dateMode === "other" && !otherDate;

  const create = useMutation({
    mutationFn: () =>
      api.createSession(group!.id, {
        ...(project ? { projectId: project.id } : {}),
        date,
        ...(place.trim() ? { place } : {}),
        ...(objective.trim() ? { objective } : {}),
      }),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions", group?.id] });
      const path = project ? `/${handle}/${project.slug}/${sessionSlug(session.number)}` : `/${handle}/${sessionSlug(session.number)}`;
      await navigate({ to: path });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!missingDate) create.mutate();
  }

  if (groups.isPending || (group && (members.isPending || projects.isPending))) return <Loading />;
  if (!group) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos ese grupo</h1>
        <Link to="/" className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Ir al inicio
        </Link>
      </Page>
    );
  }

  const back = project ? `/${handle}/${project.slug}` : `/${handle}`;
  return (
    <Page>
      <div className="flex items-center gap-4">
        <BackLink to={back} label="Cancelar" />
        <Mono>{project ? `${project.slug}/sesiones/nueva` : `${handle}/sesiones/nueva`}</Mono>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-5xl">Nueva sesión</h1>
          {nextNumber !== null && (
            <span aria-label={`Número ${nextNumber}`} className="mt-3 rounded-af-chico bg-grafito px-3 py-1 font-mono text-lg text-white">
              {sessionLabel(nextNumber)}
            </span>
          )}
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label htmlFor="belongs-to" className="mb-2 block text-lg font-semibold">
              Pertenece a
            </label>
            <select
              id="belongs-to"
              aria-describedby="belongs-hint"
              value={belongs}
              onChange={(e) => setBelongs(e.target.value)}
              className="min-h-[52px] w-full rounded-2xl border border-linea bg-hoja px-4 text-lg"
            >
              <option value={GROUP}>Sesión del grupo</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.slug}>
                  Obra · {p.title}
                </option>
              ))}
            </select>
            <p id="belongs-hint" className="mt-2 text-base text-gris">
              O déjala como sesión del grupo, si todavía no hay obra.
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 text-lg font-semibold">Fecha</legend>
            <div role="radiogroup" aria-label="Fecha" className="grid grid-cols-3 gap-1 rounded-2xl bg-linea/50 p-1">
              {DATE_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={dateMode === m.value}
                  onClick={() => setDateMode(m.value)}
                  className={`min-h-[48px] rounded-xl text-lg ${
                    dateMode === m.value ? "bg-hoja font-semibold shadow-sm" : "text-grafito/80"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {dateMode === "other" && (
              <div className="mt-3">
                <input
                  type="date"
                  aria-label="Elegir fecha"
                  value={otherDate}
                  onChange={(e) => setOtherDate(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-linea bg-hoja px-4 font-mono text-lg outline-none focus:border-2 focus:border-grafito"
                />
                {otherDate && isPastDate(otherDate) && (
                  <p className="mt-2 flex items-center gap-2 text-base text-gris">
                    <span className="rounded-af-chico bg-resaltador px-2 py-0.5 font-mono text-grafito">pasada</span>
                    Sirve para registrar una sesión que ya ocurrió.
                  </p>
                )}
              </div>
            )}
            {dateMode === "pending" && <p className="mt-2 text-base text-gris">Sin fecha por ahora; la pones cuando la acuerden.</p>}
          </fieldset>

          <Field label="Lugar" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} />

          <label className="block">
            <span className="mb-2 block text-lg font-semibold">Objetivo</span>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full rounded-2xl border border-linea bg-hoja p-4 font-lectura text-lg outline-none focus:border-2 focus:border-grafito"
            />
          </label>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {create.isError && <ErrorNote error={create.error} />}
          <Button type="submit" disabled={missingDate || create.isPending}>
            {create.isPending ? "Creando…" : "Crear y agregar planteamientos"}
          </Button>
          <p className="text-center font-mono text-sm text-gris">nace como planeada</p>
        </div>
      </form>
    </Page>
  );
}
