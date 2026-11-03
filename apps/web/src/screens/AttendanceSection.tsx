import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApi } from "../api/ApiProvider";
import type { MemberDto, SessionDto } from "../api/api";
import { Avatar, Button, ErrorNote, Mono, TextButton } from "../ui";

/** The bottom sheet of the design: "¿Quiénes estuvieron?" with a checkbox per member. */
function AttendeeSheet({
  eyebrow,
  submitLabel,
  members,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  eyebrow: string;
  submitLabel: string;
  members: MemberDto[];
  initial: string[];
  pending: boolean;
  error: unknown;
  onSubmit: (attendeeIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initial));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const toggle = (userId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-grafito/50" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="¿Quiénes estuvieron?"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-fondo px-5 pb-6 pt-3"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1.5 w-20 rounded-full bg-linea" />
        <Mono>{eyebrow}</Mono>
        <h2 className="mt-2 text-4xl leading-tight">¿Quiénes estuvieron?</h2>

        <ul className="mt-4 border-t border-linea">
          {members.map((m) => (
            <li key={m.userId} className="border-b border-linea">
              <label className="flex min-h-[64px] cursor-pointer items-center gap-4 py-2">
                <Avatar name={m.displayName} seed={m.userId} size={48} />
                <span className="flex-1 text-xl">{m.displayName ?? "Sin nombre"}</span>
                <input
                  type="checkbox"
                  checked={selected.has(m.userId)}
                  onChange={() => toggle(m.userId)}
                  aria-label={m.displayName ?? "Sin nombre"}
                  className="size-7 accent-grafito"
                />
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-4 font-lectura text-lg text-grafito/80">
          Se cierra el «antes» y se abre el «después»: hallazgos, material, acuerdos. Puedes cambiar esto luego.
        </p>

        {error ? (
          <div className="mt-3">
            <ErrorNote error={error} />
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <Button disabled={pending} onClick={() => onSubmit([...selected])}>
            {submitLabel}
          </Button>
          <TextButton className="w-full" onClick={onCancel}>
            Cancelar
          </TextButton>
        </div>
      </div>
    </div>
  );
}

/** HU-11: close a planned session with who was there; after that, see and correct the attendees. */
export function AttendanceSection({
  session,
  members,
  label,
}: {
  session: SessionDto;
  members: MemberDto[];
  /** "S02", for the sheet's header. */
  label: string;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const held = session.status === "completed";

  const attendees = useQuery({
    queryKey: ["attendees", session.id],
    queryFn: () => api.attendees(session.id),
    enabled: held,
  });

  const save = useMutation({
    mutationFn: (ids: string[]): Promise<unknown> => (held ? api.setAttendees(session.id, ids) : api.completeSession(session.id, ids)),
    onSuccess: async () => {
      setOpen(false);
      // The session changes state, and so do the home lists and the group's session list.
      await Promise.all(
        ["session", "sessions", "home", "attendees"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    },
  });

  const close = () => {
    setOpen(false);
    save.reset();
  };

  const names = members.filter((m) => attendees.data?.includes(m.userId));

  return (
    <section className="mt-8">
      {held ? (
        <>
          <div className="flex items-center justify-between border-b border-linea pb-2">
            <h2 className="text-xl font-bold">Asistentes</h2>
            <TextButton disabled={!attendees.data} onClick={() => setOpen(true)}>
              Editar asistentes
            </TextButton>
          </div>
          {attendees.isError && <ErrorNote error={attendees.error} />}
          {attendees.data && names.length === 0 && <p className="py-4 text-lg text-gris">No se marcó a nadie.</p>}
          <ul>
            {names.map((m) => (
              <li key={m.userId} className="flex items-center gap-4 border-b border-linea py-3">
                <Avatar name={m.displayName} seed={m.userId} />
                <span className="text-lg">{m.displayName ?? "Sin nombre"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Button onClick={() => setOpen(true)}>Marcar realizada</Button>
      )}

      {open && (
        <AttendeeSheet
          eyebrow={held ? `${label} · realizada` : `${label} · planeada → realizada`}
          submitLabel={held ? "Guardar asistentes" : "Marcar realizada"}
          members={members}
          // First time everyone is marked, as in the design; later, who was marked.
          initial={held ? (attendees.data ?? []) : members.map((m) => m.userId)}
          pending={save.isPending}
          error={save.error}
          onSubmit={(ids) => save.mutate(ids)}
          onCancel={close}
        />
      )}
    </section>
  );
}
