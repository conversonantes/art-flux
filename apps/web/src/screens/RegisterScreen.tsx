import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { useApi } from "../api/ApiProvider";
import type { MediaInput, MediaKind } from "../api/api";
import { useSession } from "../auth/AuthProvider";
import { formatDuration, KIND_ICON } from "../mediaFormat";
import { sessionLabel, sessionSlug } from "../sessionFormat";
import { BackLink, Button, Chip, ErrorNote, Loading, Mono, Page, TextButton } from "../ui";
import { MediaList } from "./MediaList";
import { canRecord, MAX_RECORDING_SECONDS, useVoiceRecorder } from "./useVoiceRecorder";
import { useGroup } from "./useGroup";

/** One thing being sent: what it is, how far it got, and how to try again if it failed. */
interface Sending {
  key: string;
  label: string;
  kind: MediaKind;
  status: "sending" | "done" | "error";
  progress: number;
  error?: string;
  retry: () => void;
}

const kindOf = (file: File): MediaKind =>
  file.type.startsWith("image/") ? "photo" : file.type.startsWith("audio/") ? "audio" : "document";

const nameOf = (file: File) => file.name.replace(/\.[^.]+$/, "");

/**
 * HU-13: register material in an obra — photo, voice note, file, link or written note — and say
 * where it goes: the obra, one of its sessions, or one approach. `/<group>/registrar?obra=&sesion=&planteamiento=`
 */
export function RegisterScreen({ handle }: { handle: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const search = useSearch({ strict: false }) as { obra?: string; sesion?: string; planteamiento?: string };
  const { groups, group, members, role } = useGroup(handle);

  const projects = useQuery({
    queryKey: ["projects", group?.id],
    queryFn: () => api.projects(group!.id),
    enabled: !!group,
  });
  const project = projects.data?.find((p) => p.id === search.obra);
  const sessions = useQuery({
    queryKey: ["sessions", group?.id, "project", project?.id],
    queryFn: () => api.sessions(group!.id, { project: project!.id }),
    enabled: !!group && !!project,
  });

  const [sessionId, setSessionId] = useState<string | undefined>(search.sesion);
  const [approachId, setApproachId] = useState<string | undefined>(search.planteamiento);
  const approaches = useQuery({
    queryKey: ["approaches", sessionId],
    queryFn: () => api.approaches(sessionId!),
    enabled: !!sessionId,
  });

  const [sending, setSending] = useState<Sending[]>([]);
  const [form, setForm] = useState<"link" | "note" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const patch = (key: string, changes: Partial<Sending>) =>
    setSending((all) => all.map((s) => (s.key === key ? { ...s, ...changes } : s)));

  /** Registers, uploads (files) and confirms. Retrying reuses the same id, so nothing is duplicated. */
  function send(input: Omit<MediaInput, "sessionId" | "approachId">, label: string, blob?: Blob) {
    if (!project) return;
    const where = { ...(sessionId ? { sessionId } : {}), ...(approachId ? { approachId } : {}) };
    const key = input.id;
    const run = async () => {
      patch(key, { status: "sending", progress: 0 });
      try {
        const { media, upload } = await api.registerMedia(project.id, { ...input, ...where });
        if (upload && blob) {
          await api.uploadFile(upload, blob, (fraction) => patch(key, { progress: fraction }));
          await api.confirmMedia(media.id);
        }
        patch(key, { status: "done", progress: 1 });
        await queryClient.invalidateQueries({ queryKey: ["media"] });
      } catch (e) {
        patch(key, { status: "error", error: e instanceof Error ? e.message : "No se pudo registrar. Intenta de nuevo." });
      }
    };
    setSending((all) => [{ key, label, kind: input.kind, status: "sending", progress: 0, retry: () => void run() }, ...all]);
    void run();
  }

  function sendFile(file: File, kind: MediaKind = kindOf(file)) {
    send(
      {
        id: crypto.randomUUID(),
        kind,
        title: nameOf(file),
        mime: file.type,
        sizeBytes: file.size,
      },
      nameOf(file),
      file,
    );
  }

  const recorder = useVoiceRecorder((audio, seconds) =>
    send(
      { id: crypto.randomUUID(), kind: "audio", title: "Nota de voz", mime: audio.type, sizeBytes: audio.size, durationSeconds: seconds },
      "Nota de voz",
      audio,
    ),
  );

  function pick(onFile: (file: File) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // the same file can be chosen again
      if (file) onFile(file);
    };
  }

  function submitLink(e: FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    send({ id: crypto.randomUUID(), kind: "link", url: linkUrl.trim(), ...(linkTitle.trim() ? { title: linkTitle.trim() } : {}) }, linkTitle.trim() || linkUrl.trim());
    setLinkUrl("");
    setLinkTitle("");
    setForm(null);
  }

  function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    send({ id: crypto.randomUUID(), kind: "note", body: noteText.trim() }, noteText.trim().split("\n")[0]!.slice(0, 40));
    setNoteText("");
    setForm(null);
  }

  if (groups.isPending || (group && (projects.isPending || members.isPending))) return <Loading />;
  if (!group || !project) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos esa obra</h1>
        <p className="mt-3 text-lg text-gris">El material se registra dentro de una obra.</p>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }

  const session = sessions.data?.find((s) => s.id === sessionId);
  const approachIndex = approaches.data?.findIndex((a) => a.id === approachId) ?? -1;
  const back = session ? `/${handle}/${project.slug}/${sessionSlug(session.number)}` : `/${handle}/${project.slug}`;
  const placeName = approachId
    ? "En este planteamiento"
    : session
      ? "En esta sesión"
      : "En la obra, sin sesión";
  const path = ["registrar", [project.slug, session ? sessionLabel(session.number) : null, approachIndex >= 0 ? `P${approachIndex + 1}` : null].filter(Boolean).join("/")].join(" · ");

  function chooseSession(id: string | undefined) {
    setSessionId(id);
    setApproachId(undefined);
  }

  return (
    <Page>
      <header className="flex items-center gap-3">
        <BackLink to={back} label="Volver" />
        <span className="flex-1 truncate font-mono text-sm text-gris">{path}</span>
      </header>

      <h1 className="mt-6 text-5xl leading-tight">Registrar</h1>

      <h2 className="mt-6 text-xl font-bold">¿Dónde va?</h2>
      <div role="group" aria-label="¿Dónde va?" className="mt-2 flex flex-wrap gap-2">
        <Chip selected={!sessionId} onClick={() => chooseSession(undefined)}>
          Obra
        </Chip>
        {(sessions.data ?? []).map((s) => (
          <Chip key={s.id} selected={sessionId === s.id} onClick={() => chooseSession(s.id)}>
            {sessionLabel(s.number)}
          </Chip>
        ))}
      </div>
      {sessionId && (approaches.data?.length ?? 0) > 0 && (
        <div role="group" aria-label="Planteamiento" className="mt-2 flex flex-wrap gap-2">
          <Chip selected={!approachId} onClick={() => setApproachId(undefined)}>
            Toda la sesión
          </Chip>
          {approaches.data!.map((a, i) => (
            <Chip key={a.id} selected={approachId === a.id} onClick={() => setApproachId(a.id)}>
              P{i + 1} · {a.text.length > 18 ? `${a.text.slice(0, 18)}…` : a.text}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          className="flex min-h-[132px] flex-col justify-between rounded-3xl bg-grafito p-4 text-left text-xl font-bold text-white"
        >
          <span aria-hidden className="text-3xl text-resaltador">{KIND_ICON.photo}</span>
          Tomar foto
        </button>
        {canRecord() ? (
          <button
            type="button"
            onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
            className={`flex min-h-[132px] flex-col justify-between rounded-3xl p-4 text-left text-xl font-bold ${
              recorder.recording ? "bg-resaltador text-grafito" : "bg-grafito text-white"
            }`}
          >
            <span aria-hidden className={`text-3xl ${recorder.recording ? "" : "text-resaltador"}`}>{KIND_ICON.audio}</span>
            {recorder.recording ? (
              <span>
                Detener <Mono className="!text-grafito">{formatDuration(recorder.seconds)} / {formatDuration(MAX_RECORDING_SECONDS)}</Mono>
              </span>
            ) : (
              "Grabar audio"
            )}
          </button>
        ) : (
          // Browsers that cannot record in the page still offer the phone's own recorder.
          <button
            type="button"
            onClick={() => audioInput.current?.click()}
            className="flex min-h-[132px] flex-col justify-between rounded-3xl bg-grafito p-4 text-left text-xl font-bold text-white"
          >
            <span aria-hidden className="text-3xl text-resaltador">{KIND_ICON.audio}</span>
            Grabar audio
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex min-h-[132px] flex-col justify-between rounded-3xl border border-linea bg-hoja p-4 text-left text-xl font-bold"
        >
          <span aria-hidden className="text-3xl">{KIND_ICON.document}</span>
          Subir archivo
        </button>
        <button
          type="button"
          aria-pressed={form === "link"}
          onClick={() => setForm(form === "link" ? null : "link")}
          className="flex min-h-[132px] flex-col justify-between rounded-3xl border border-linea bg-hoja p-4 text-left text-xl font-bold"
        >
          <span aria-hidden className="text-3xl">{KIND_ICON.link}</span>
          Pegar enlace
        </button>
      </div>
      <div className="mt-3">
        <Button variant="outline" aria-pressed={form === "note"} onClick={() => setForm(form === "note" ? null : "note")}>
          Nota escrita
        </Button>
      </div>

      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden aria-label="Elegir foto" onChange={pick((f) => sendFile(f, "photo"))} />
      <input ref={fileInput} type="file" hidden aria-label="Elegir archivo" onChange={pick((f) => sendFile(f))} />
      <input ref={audioInput} type="file" accept="audio/*" capture hidden aria-label="Elegir audio" onChange={pick((f) => sendFile(f, "audio"))} />

      {recorder.error && (
        <div className="mt-3">
          <ErrorNote error={new Error(recorder.error)} />
        </div>
      )}

      {form === "link" && (
        <form onSubmit={submitLink} className="mt-4 rounded-3xl border-2 border-grafito bg-hoja p-4">
          <label className="block">
            <span className="mb-2 block text-lg font-semibold">Enlace</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="min-h-[52px] w-full rounded-2xl border border-linea bg-fondo px-4 text-lg outline-none focus:border-grafito"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-2 block text-lg font-semibold">
              Título <span className="font-normal text-gris">· opcional</span>
            </span>
            <input
              value={linkTitle}
              maxLength={120}
              onChange={(e) => setLinkTitle(e.target.value)}
              className="min-h-[52px] w-full rounded-2xl border border-linea bg-fondo px-4 text-lg outline-none focus:border-grafito"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <TextButton onClick={() => setForm(null)}>Cancelar</TextButton>
            <button type="submit" disabled={!linkUrl.trim()} className="min-h-[48px] rounded-2xl bg-grafito px-6 text-lg font-semibold text-white disabled:opacity-50">
              Guardar enlace
            </button>
          </div>
        </form>
      )}

      {form === "note" && (
        <form onSubmit={submitNote} className="mt-4 rounded-3xl border-2 border-grafito bg-hoja p-4">
          <label className="block">
            <span className="mb-2 block text-lg font-semibold">Nota</span>
            <textarea
              value={noteText}
              maxLength={4000}
              rows={4}
              autoFocus
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full rounded-2xl border border-linea bg-fondo p-3 font-lectura text-lg outline-none focus:border-grafito"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <TextButton onClick={() => setForm(null)}>Cancelar</TextButton>
            <button type="submit" disabled={!noteText.trim()} className="min-h-[48px] rounded-2xl bg-grafito px-6 text-lg font-semibold text-white disabled:opacity-50">
              Guardar nota
            </button>
          </div>
        </form>
      )}

      {sending.length > 0 && (
        <ul aria-label="Enviando" className="mt-6 space-y-3">
          {sending.map((s) => (
            <li key={s.key} className="rounded-3xl border border-linea bg-hoja p-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="text-2xl">{KIND_ICON[s.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-lg font-semibold">{s.label}</span>
                <Mono>{s.status === "sending" ? "subiendo…" : s.status === "done" ? "listo" : "falló"}</Mono>
              </div>
              {s.status === "sending" && (
                <span
                  role="progressbar"
                  aria-label={`Subiendo ${s.label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(s.progress * 100)}
                  className="mt-3 block h-2 overflow-hidden rounded-full bg-linea"
                >
                  <span className="block h-full bg-grafito" style={{ width: `${s.progress * 100}%` }} />
                </span>
              )}
              {s.status === "error" && (
                <div className="mt-2">
                  <ErrorNote error={new Error(s.error)} />
                  <TextButton className="mt-1" onClick={s.retry}>
                    Reintentar
                  </TextButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-xl font-bold">{placeName}</h2>
      <div className="mt-3">
        <MediaList
          projectId={project.id}
          sessionId={sessionId}
          approachId={approachId}
          members={members.data ?? []}
          currentUserId={user.id}
          isAdmin={role === "admin"}
          label="Material"
        />
      </div>

      <div className="mt-6 space-y-2 text-base text-gris">
        <p>🔒 Solo el grupo lo ve, como la sesión.</p>
        <p>ⓘ Hasta 20 MB por archivo (fotos 10 MB, audio 15 MB); las notas de voz duran hasta 3 minutos. Para algo más largo, pega un enlace.</p>
      </div>
    </Page>
  );
}

export function RegisterRoute() {
  const { handle = "" } = useParams({ strict: false }) as { handle?: string };
  return <RegisterScreen handle={handle} />;
}
