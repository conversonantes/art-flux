import { Link, useNavigate } from "@tanstack/react-router";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApi } from "../api/ApiProvider";
import type { FindingFragmentDto, MemberDto } from "../api/api";
import { useSession } from "../auth/AuthProvider";
import { applyMark, type Mark } from "../findingText";
import { sessionLabel, sessionSlug } from "../sessionFormat";
import { BackLink, Button, ErrorNote, Loading, Mono, Page, TextButton, personColor } from "../ui";
import { FindingText } from "./FindingText";
import { useGroup } from "./useGroup";

/** How long to wait after the last keystroke before saving by itself. */
const AUTOSAVE_MS = 700;

const newId = () => crypto.randomUUID();
const hasMarks = (text: string) => /\*\*.+?\*\*|==.+?==|^\s*-\s/m.test(text);

/** Writes into a textarea the way typing would, so React sees the change. */
function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** B, list and highlighter: act on the fragment being written (the focused box). */
function Toolbar() {
  function apply(mark: Mark) {
    const el = document.activeElement;
    if (!(el instanceof HTMLTextAreaElement) || !el.dataset.finding) return;
    const edit = applyMark(el.value, el.selectionStart, el.selectionEnd, mark);
    setTextareaValue(el, edit.text);
    el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  }
  const button = "inline-flex size-12 items-center justify-center rounded-xl text-xl";
  return (
    <div role="toolbar" aria-label="Formato" className="inline-flex gap-1 rounded-2xl border border-linea bg-hoja p-1">
      {/* mouse-down is cancelled so the box keeps its focus and selection while the button is used */}
      <button type="button" aria-label="Negrita" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("bold")} className={`${button} font-bold`}>
        B
      </button>
      <button type="button" aria-label="Lista" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("list")} className={button}>
        ≡
      </button>
      <button type="button" aria-label="Resaltar" onMouseDown={(e) => e.preventDefault()} onClick={() => apply("highlight")} className={`${button} bg-resaltador`}>
        ✎
      </button>
    </div>
  );
}

/** One of my fragments: a box that saves by itself while I write. */
function FragmentEditor({
  id,
  approachId,
  kind,
  fragment,
  label,
  onDiscard,
}: {
  id: string;
  approachId: string;
  kind: FindingFragmentDto["kind"];
  fragment: FindingFragmentDto | undefined;
  label: string;
  onDiscard: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [text, setText] = useState(fragment?.text ?? "");
  const saved = useRef(fragment?.text ?? "");

  const save = useMutation({
    mutationKey: ["finding"],
    mutationFn: (value: string) => api.saveFinding(id, { approachId, kind, text: value }),
    onSuccess: () => Promise.all(["findings", "home"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
    onError: (_e, value) => {
      if (saved.current === value) saved.current = fragment?.text ?? ""; // let the next change try again
    },
  });
  const remove = useMutation({
    mutationFn: () => api.removeFinding(id),
    onSuccess: async () => {
      await Promise.all(["findings", "home"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      onDiscard();
    },
  });

  const flush = (value: string) => {
    if (!value.trim() || value === saved.current) return;
    saved.current = value;
    save.mutate(value);
  };

  useEffect(() => {
    if (!text.trim() || text === saved.current) return;
    const timer = setTimeout(() => flush(text), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const isSaved = !!fragment || save.isSuccess;
  return (
    <div className="rounded-3xl border-2 border-grafito bg-hoja p-3">
      <textarea
        aria-label={label}
        data-finding="true"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => flush(text)}
        maxLength={4000}
        rows={4}
        className="w-full resize-y rounded-2xl bg-hoja p-2 font-lectura text-xl leading-relaxed outline-none"
      />
      {hasMarks(text) && (
        <div className="mt-2 rounded-2xl bg-fondo p-3" aria-label="Así se verá">
          <FindingText text={text} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <Mono>{save.isPending ? "guardando…" : save.isError ? "no se guardó" : isSaved ? "guardado" : "se guarda solo"}</Mono>
        {(isSaved || text) && (
          <TextButton
            className="!text-base"
            disabled={remove.isPending}
            onClick={() => (isSaved ? remove.mutate() : onDiscard())}
            aria-label={`Quitar ${label.toLowerCase()}`}
          >
            Quitar
          </TextButton>
        )}
      </div>
      {save.isError && <ErrorNote error={save.error} />}
      {remove.isError && <ErrorNote error={remove.error} />}
    </div>
  );
}

/** "Qué encontramos" / "Qué faltó": what others wrote (read-only, with their color) and my own boxes. */
function KindSection({
  kind,
  title,
  approachId,
  fragments,
  members,
  meId,
}: {
  kind: FindingFragmentDto["kind"];
  title: string;
  approachId: string;
  fragments: FindingFragmentDto[];
  members: MemberDto[];
  meId: string;
}) {
  const ofKind = fragments.filter((f) => f.kind === kind);
  const others = ofKind.filter((f) => f.authorId !== meId);
  const mine = ofKind.filter((f) => f.authorId === meId);
  // A blank box to write in, unless I already have fragments here (then "+ Agregar otro" opens another).
  const [drafts, setDrafts] = useState<string[]>(() => (mine.length === 0 ? [newId()] : []));
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "Alguien";

  // My boxes: the saved ones, then the ones still being written. Same id = same box (no remount on first save).
  const ids = [...new Set([...mine.map((f) => f.id), ...drafts])];
  useEffect(() => {
    if (ids.length === 0) setDrafts([newId()]);
  }, [ids.length]);

  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="text-2xl font-bold">{title}</h2>

      {others.length > 0 && (
        <ul className="mt-3 space-y-3">
          {others.map((f) => (
            <li key={f.id} className="flex gap-3">
              <span aria-hidden className={`w-1.5 shrink-0 rounded-full ${personColor(f.authorId)}`} />
              <div className="min-w-0 flex-1">
                <FindingText text={f.text} />
                <Mono>{nameOf(f.authorId)}</Mono>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-3">
        {ids.map((id) => (
          <FragmentEditor
            key={id}
            id={id}
            approachId={approachId}
            kind={kind}
            fragment={mine.find((f) => f.id === id)}
            label={kind === "found" ? "Lo que encontramos" : "Lo que faltó"}
            onDiscard={() => setDrafts((current) => current.filter((d) => d !== id))}
          />
        ))}
      </div>
      {mine.length > 0 && drafts.every((d) => mine.some((f) => f.id === d)) && (
        <TextButton className="mt-1" onClick={() => setDrafts((current) => [...current, newId()])}>
          + Agregar otro
        </TextButton>
      )}
    </section>
  );
}

/**
 * HU-12: the finding of one approach of a held session, written in fragments by whoever wants to
 * add to it. `/<group>/<project>/S02/P3`, or `/<group>/S02/P3` for a group session.
 */
export function FindingScreen({
  handle,
  projectSlug,
  number,
  approachNumber,
}: {
  handle: string;
  projectSlug?: string;
  number: number;
  approachNumber: number;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useSession();
  const { groups, group, members } = useGroup(handle);
  const saving = useIsMutating({ mutationKey: ["finding"] });

  const sessionPath = projectSlug ? `/${handle}/${projectSlug}/${sessionSlug(number)}` : `/${handle}/${sessionSlug(number)}`;

  const session = useQuery({
    queryKey: ["session", group?.id, projectSlug ?? null, number],
    queryFn: () => api.session(group!.id, number, projectSlug),
    enabled: !!group,
  });
  const approaches = useQuery({
    queryKey: ["approaches", session.data?.id],
    queryFn: () => api.approaches(session.data!.id),
    enabled: !!session.data,
  });
  const approach = approaches.data?.[approachNumber - 1];
  const fragments = useQuery({
    queryKey: ["findings", approach?.id],
    queryFn: () => api.findings(approach!.id),
    enabled: !!approach && session.data?.status === "completed",
  });

  const loading =
    groups.isPending || (!!group && (session.isPending || members.isPending)) || (!!session.data && approaches.isPending);
  if (loading) return <Loading />;

  if (session.isError || !group || !session.data || !approach) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos ese planteamiento</h1>
        {session.isError && (
          <div className="mt-3">
            <ErrorNote error={session.error} />
          </div>
        )}
        <Link to={sessionPath} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver a la sesión
        </Link>
      </Page>
    );
  }

  const path = [handle, projectSlug, sessionLabel(number), `P${approachNumber}`].filter(Boolean).join("/");
  const owner = members.data?.find((m) => m.userId === approach.ownerId);

  return (
    <Page>
      <header className="flex items-center gap-3">
        <BackLink to={sessionPath} label="Volver a la sesión" />
        <span className="flex-1 truncate font-mono text-sm text-gris">{path}</span>
        <Mono className="text-verde">{saving > 0 ? "guardando…" : "✓ guardado"}</Mono>
      </header>

      <Mono className="mt-6">{owner?.displayName ? `a cargo de ${owner.displayName}` : "planteamiento"}</Mono>
      <h1 className="mt-2 text-4xl leading-tight">{approach.text}</h1>

      {approach.note && (
        <div className="mt-4 rounded-2xl border border-linea bg-hoja p-3">
          <Mono>Cómo lo planteó {owner?.displayName ?? "quien lo traía"}</Mono>
          <p className="mt-1 whitespace-pre-line font-lectura text-lg">{approach.note}</p>
        </div>
      )}

      {session.data.status !== "completed" ? (
        <p className="mt-6 rounded-3xl border border-dashed border-gris/50 p-5 font-lectura text-lg text-grafito/80">
          El hallazgo se escribe después de la sesión. Cuando la marquen como realizada, vuelve aquí.
        </p>
      ) : (
        <>
          <div className="mt-5">
            <Toolbar />
          </div>
          {fragments.isError && (
            <div className="mt-4">
              <ErrorNote error={fragments.error} />
            </div>
          )}
          {fragments.isPending && <Mono className="mt-4 block">Cargando…</Mono>}
          {fragments.data && (
            <>
              <KindSection kind="found" title="Qué encontramos" approachId={approach.id} fragments={fragments.data} members={members.data ?? []} meId={user.id} />
              <KindSection kind="missing" title="Qué faltó" approachId={approach.id} fragments={fragments.data} members={members.data ?? []} meId={user.id} />
              <AuthorLegend fragments={fragments.data} members={members.data ?? []} />
            </>
          )}
          <div className="mt-8">
            <Button onClick={() => void navigate({ to: sessionPath })}>Listo</Button>
          </div>
        </>
      )}
    </Page>
  );
}

/** Who wrote what: the color of each author, as in the design. */
function AuthorLegend({ fragments, members }: { fragments: FindingFragmentDto[]; members: MemberDto[] }) {
  const authors = [...new Set(fragments.map((f) => f.authorId))];
  if (authors.length === 0) return null;
  return (
    <ul className="mt-6 flex flex-wrap gap-4" aria-label="Autores">
      {authors.map((id) => (
        <li key={id} className="flex items-center gap-2">
          <span aria-hidden className={`size-4 rounded-sm ${personColor(id)}`} />
          <Mono>{(members.find((m) => m.userId === id)?.displayName ?? "alguien").toLowerCase()}</Mono>
        </li>
      ))}
    </ul>
  );
}
