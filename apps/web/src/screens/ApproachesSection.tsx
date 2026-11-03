import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ApproachDto, MemberDto } from "../api/api";
import { reorderIds } from "../approachOrder";
import { approachSlug } from "../sessionFormat";
import { Avatar, Button, Chip, ErrorNote, Mono, TextButton } from "../ui";
import { useApproaches } from "./useApproaches";

const label = (index: number) => `P${index + 1}`;

/** Spanish texts for the drag-and-drop screen reader support (the library ships English). */
function announcements(titleOf: (id: string | number) => string, indexOf: (id: string | number) => number): Announcements {
  return {
    onDragStart: ({ active }) => `Tomaste ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} está sobre la posición ${indexOf(over.id) + 1}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Soltaste ${titleOf(active.id)} en la posición ${indexOf(over.id) + 1}.` : `Soltaste ${titleOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelaste el movimiento de ${titleOf(active.id)}.`,
  };
}

/** The text box and the "¿Quién lo trae?" chips, shared by "new" and "edit". */
function ApproachEditor({
  title,
  initialText,
  initialOwner,
  members,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialText: string;
  initialOwner: string;
  members: MemberDto[];
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (value: { text: string; ownerId: string }) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [ownerId, setOwnerId] = useState(initialOwner);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) onSubmit({ text, ownerId });
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border-2 border-grafito bg-hoja p-4">
      <p className="mb-3">
        <span className="text-lg font-semibold">{title.split(" ")[0]}</span>{" "}
        <Mono>{title.split(" ").slice(1).join(" ")}</Mono>
      </p>
      <textarea
        aria-label="Texto del planteamiento"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={3}
        autoFocus
        className="w-full rounded-2xl border border-linea bg-fondo p-3 font-lectura text-lg outline-none focus:border-grafito"
      />
      <fieldset className="mt-4">
        <legend className="mb-2 text-lg font-semibold">¿Quién lo trae?</legend>
        <div role="radiogroup" aria-label="¿Quién lo trae?" className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Chip
              key={m.userId}
              role="radio"
              aria-checked={ownerId === m.userId}
              selected={ownerId === m.userId}
              onClick={() => setOwnerId(m.userId)}
              className="inline-flex items-center gap-2 !px-2"
            >
              <Avatar name={m.displayName} seed={m.userId} size={32} />
              {m.displayName ?? "Sin nombre"}
            </Chip>
          ))}
        </div>
      </fieldset>
      {error != null && (
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="min-h-tactil px-3 text-lg text-gris">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="min-h-[48px] rounded-2xl bg-grafito px-6 text-lg font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** "Cómo lo planteo": the owner's note under the approach. Everyone reads it; only the owner writes it. */
function NoteBlock({
  approach,
  owner,
  canWrite,
  pending,
  error,
  onSave,
}: {
  approach: ApproachDto;
  owner: MemberDto | undefined;
  canWrite: boolean;
  pending: boolean;
  error: unknown;
  onSave: (note: string | null, done: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(approach.note ?? "");

  if (editing) {
    return (
      <form
        className="mt-3 rounded-2xl border-2 border-grafito bg-fondo p-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(text.trim() || null, () => setEditing(false));
        }}
      >
        <label className="block">
          <span className="mb-2 block text-base font-semibold">Cómo lo planteo</span>
          <textarea
            aria-label="Cómo lo planteo"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={4}
            autoFocus
            className="w-full rounded-xl border border-linea bg-hoja p-3 font-lectura text-lg outline-none focus:border-grafito"
          />
        </label>
        {error != null && (
          <div className="mt-2">
            <ErrorNote error={error} />
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setText(approach.note ?? "");
              setEditing(false);
            }}
            className="min-h-tactil px-3 text-lg text-gris"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-[48px] rounded-2xl bg-grafito px-6 text-lg font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar nota"}
          </button>
        </div>
      </form>
    );
  }

  if (!approach.note && !canWrite) return null;
  return (
    <div className="mt-3 border-t border-linea pt-3">
      {approach.note && (
        <>
          <Mono>Cómo lo plantea {owner?.displayName ?? "quien lo trae"}</Mono>
          <p className="mt-1 whitespace-pre-line font-lectura text-lg">{approach.note}</p>
        </>
      )}
      {canWrite && (
        <TextButton
          className="-ml-2 !text-base"
          onClick={() => {
            setText(approach.note ?? "");
            setEditing(true);
          }}
        >
          {approach.note ? "Editar mi nota" : "Anotar cómo lo planteo"}
        </TextButton>
      )}
    </div>
  );
}

function ApproachRow({
  approach,
  index,
  owner,
  editable,
  busy,
  onEdit,
  onRemove,
  note,
  findingTo,
}: {
  approach: ApproachDto;
  index: number;
  owner: MemberDto | undefined;
  editable: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  note: ReactNode;
  /** Where this approach's finding is written; set once the session was held. */
  findingTo: string | undefined;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: approach.id,
    disabled: !editable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-3xl border border-linea bg-hoja p-4 ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-3">
        {editable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Arrastrar ${label(index)}`}
            {...attributes}
            {...listeners}
            // touch-none: a touch that starts on the handle drags instead of scrolling the page.
            className="mt-0.5 inline-flex size-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl text-2xl text-gris active:cursor-grabbing"
          >
            ⠿
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-lg">
            <span className="mr-2 font-mono text-base text-gris">{label(index)}</span>
            {approach.text}
          </p>
          {findingTo && (
            <Link to={findingTo} className="-ml-2 mt-1 inline-flex min-h-tactil items-center px-2 text-base font-semibold text-verde">
              Hallazgo ›
            </Link>
          )}
          {editable && (
            <div className="-ml-2 mt-1 flex gap-1">
              <TextButton onClick={onEdit} disabled={busy} aria-label={`Editar ${label(index)}`} className="!text-base">
                Editar
              </TextButton>
              <TextButton onClick={onRemove} disabled={busy} aria-label={`Quitar ${label(index)}`} className="!text-base">
                Quitar
              </TextButton>
            </div>
          )}
        </div>
        <span className="flex shrink-0 flex-col items-center gap-1" title={owner?.displayName ?? "Sin nombre"}>
          <Avatar name={owner?.displayName} seed={approach.ownerId} size={44} />
          <span className="max-w-[4.5rem] truncate font-mono text-xs text-gris">{owner?.displayName ?? "—"}</span>
        </span>
      </div>
      {note}
    </li>
  );
}

/** HU-08: the approaches of a session, each with the member who brings it; reorder by dragging. */
export function ApproachesSection({
  sessionId,
  members,
  currentUserId,
  editable,
  findingPath,
}: {
  sessionId: string;
  members: MemberDto[];
  currentUserId: string;
  /** False once the session was held: planning is read-only then. */
  editable: boolean;
  /** The session's address (e.g. /grupo/obra/s02); with it each held approach links to its finding. */
  findingPath?: string;
}) {
  const { list, add, update, remove, reorder, setNote } = useApproaches(sessionId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short hold before a touch drag starts, so scrolling past a row still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = list.data ?? [];
  const ownerOf = (id: string) => members.find((m) => m.userId === id);
  const indexOf = (id: string | number) => items.findIndex((a) => a.id === id);
  const titleOf = (id: string | number) => label(Math.max(0, indexOf(id)));
  const busy = add.isPending || update.isPending || remove.isPending || reorder.isPending;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = reorderIds(items.map((a) => a.id), String(active.id), String(over.id));
    reorder.mutate(next);
  }

  const showAddCard = editable && (adding || (list.isSuccess && items.length === 0));

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl font-bold">Planteamientos</h2>
        {editable && items.length > 1 && <Mono>arrastra para ordenar</Mono>}
      </div>

      {list.isPending && <Mono>Cargando…</Mono>}
      {list.isError && (
        <div className="mt-3">
          <ErrorNote error={list.error} />
        </div>
      )}
      {reorder.isError && (
        <div className="mt-3">
          <ErrorNote error={reorder.error} />
        </div>
      )}
      {remove.isError && (
        <div className="mt-3">
          <ErrorNote error={remove.error} />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: announcements(titleOf, indexOf),
          screenReaderInstructions: {
            draggable:
              "Para reordenar, presiona espacio para tomar el planteamiento, mueve con las flechas arriba y abajo, y presiona espacio para soltarlo.",
          },
        }}
      >
        <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <ol className="mt-4 space-y-3" aria-label="Planteamientos">
            {items.map((a, index) =>
              editingId === a.id ? (
                <li key={a.id}>
                  <ApproachEditor
                    title={`${label(index)} editar`}
                    initialText={a.text}
                    initialOwner={a.ownerId}
                    members={members}
                    submitLabel="Guardar"
                    pending={update.isPending}
                    error={update.error}
                    onSubmit={(v) => update.mutate({ id: a.id, ...v }, { onSuccess: () => setEditingId(null) })}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <ApproachRow
                  key={a.id}
                  approach={a}
                  index={index}
                  owner={ownerOf(a.ownerId)}
                  editable={editable}
                  busy={busy}
                  onEdit={() => setEditingId(a.id)}
                  onRemove={() => remove.mutate(a.id)}
                  findingTo={!editable && findingPath ? `${findingPath}/${approachSlug(index + 1)}` : undefined}
                  note={
                    <NoteBlock
                      approach={a}
                      owner={ownerOf(a.ownerId)}
                      canWrite={editable && a.ownerId === currentUserId}
                      pending={setNote.isPending}
                      error={setNote.error}
                      onSave={(value, done) => setNote.mutate({ id: a.id, note: value }, { onSuccess: done })}
                    />
                  }
                />
              ),
            )}
          </ol>
        </SortableContext>
      </DndContext>

      {showAddCard ? (
        <div className="mt-3">
          <ApproachEditor
            title={`${label(items.length)} nuevo`}
            initialText=""
            initialOwner={currentUserId}
            members={members}
            submitLabel="Agregar"
            pending={add.isPending}
            error={add.error}
            onSubmit={(v) => add.mutate(v, { onSuccess: () => setAdding(false) })}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        editable && (
          <div className="mt-3">
            <Button variant="outline" onClick={() => setAdding(true)}>
              + Agregar planteamiento
            </Button>
          </div>
        )
      )}

      <p className="mt-6 text-base text-gris">
        Cada responsable ve su planteamiento en su inicio. Los ejercicios del catálogo llegan en el corte 2; mientras
        tanto, nómbralos en el texto.
      </p>
    </section>
  );
}
