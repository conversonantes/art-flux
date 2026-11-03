import { useState, type FormEvent, type KeyboardEvent } from "react";
import { PROJECT_STATUSES, type ProjectInput, type SessionDto } from "../api/api";
import { formatSessionDate, sessionLabel } from "../sessionFormat";
import { STATUS_LABEL } from "../projectLabels";
import { Button, Chip, ErrorNote, Field } from "../ui";

const clean = (t: string) => t.trim().replace(/^#+/, "").trim().toLowerCase();

/** Themes as removable "#tag" chips; Enter or comma adds one. */
function ThemesInput({ value, onChange }: { value: string[]; onChange: (themes: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const theme = clean(draft);
    setDraft("");
    if (theme && !value.includes(theme)) onChange([...value, theme]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="block">
      <span className="mb-2 block text-lg font-semibold">Temas</span>
      <div className="flex min-h-[52px] flex-wrap items-center gap-2 rounded-2xl border border-linea bg-hoja p-2 focus-within:border-2 focus-within:border-grafito">
        {value.map((theme) => (
          <span key={theme} className="inline-flex items-center gap-1 rounded-af-chico bg-fondo px-2 py-1 font-mono text-sm">
            #{theme}
            <button
              type="button"
              aria-label={`Quitar tema ${theme}`}
              onClick={() => onChange(value.filter((t) => t !== theme))}
              className="px-1 text-base"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="Agregar tema"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          maxLength={30}
          placeholder={value.length ? "" : "Escribe y pulsa enter"}
          className="min-w-[8rem] flex-1 bg-transparent px-2 py-2 text-lg outline-none"
        />
      </div>
    </div>
  );
}

/** Shared by "Nueva obra" and "Editar obra" (HU-05). */
export function ProjectForm({
  initial,
  submitLabel,
  pendingLabel,
  pending,
  error,
  origins,
  onSubmit,
}: {
  initial: ProjectInput;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: unknown;
  /** Group sessions that could become this project's origin (HU-05). Omit to hide the option. */
  origins?: SessionDto[] | undefined;
  onSubmit: (input: ProjectInput) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState(initial.status);
  const [themes, setThemes] = useState(initial.themes);
  const [agreement, setAgreement] = useState(initial.visibilityAgreement);
  const [originId, setOriginId] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) {
      onSubmit({ title, status, themes, visibilityAgreement: agreement, ...(originId ? { originSessionId: originId } : {}) });
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-1 flex-col">
      <div className="space-y-6">
        <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus />

        <fieldset>
          <legend className="mb-2 text-lg font-semibold">Estado</legend>
          <div className="grid grid-cols-2 gap-3">
            {PROJECT_STATUSES.map((s) => (
              <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <ThemesInput value={themes} onChange={setThemes} />

        {origins && origins.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-lg font-semibold">
              Nace de una sesión del grupo<span className="font-normal text-gris"> · opcional</span>
            </legend>
            <div role="radiogroup" aria-label="Sesión de origen" className="space-y-2">
              {origins.map((s) => {
                const on = originId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOriginId(on ? null : s.id)}
                    className={`flex min-h-[56px] w-full items-center gap-4 rounded-2xl border bg-hoja p-3 text-left ${
                      on ? "border-2 border-grafito" : "border-linea"
                    }`}
                  >
                    <span aria-hidden className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-grafito ${on ? "bg-grafito text-white" : "bg-hoja"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold">
                        {sessionLabel(s.number)} · {s.objective ?? "Sin objetivo"}
                      </span>
                      <span className="block font-mono text-sm text-gris">
                        {s.date ? formatSessionDate(s.date) : "fecha pendiente"}
                        {on ? " · se vuelve el origen" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="mb-2 block text-lg font-semibold">Acuerdo de visibilidad</span>
          <textarea
            value={agreement}
            onChange={(e) => setAgreement(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Qué acordamos mostrar fuera del grupo y qué no"
            className="w-full rounded-2xl border border-linea bg-hoja p-4 font-lectura text-lg outline-none placeholder:text-gris/70 focus:border-2 focus:border-grafito"
          />
          <span className="mt-2 block text-base text-gris">Nada se publica todavía: la obra nace privada.</span>
        </label>
      </div>

      <div className="mt-auto space-y-3 pt-8">
        {error != null && <ErrorNote error={error} />}
        <Button type="submit" disabled={!title.trim() || pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
