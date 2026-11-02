import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { InviteDto } from "../api/api";
import { useApi } from "../api/ApiProvider";
import { Avatar, BackLink, Button, ErrorNote, Field, Lead, LinkButton, Loading, Mono, Page, TextButton } from "../ui";
import { useGroup } from "./useGroup";

const isPending = (i: InviteDto) => !i.acceptedAt && new Date(i.expiresAt).getTime() > Date.now();

const day = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });

/** HU-03: the admin creates single-use links (7 days), shares them and sees who joined. */
export function InviteScreen() {
  const { handle = "" } = useParams({ strict: false }) as { handle?: string };
  const api = useApi();
  const queryClient = useQueryClient();
  const { groups, group, members, role } = useGroup(handle);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  const invites = useQuery({
    queryKey: ["invites", group?.id],
    queryFn: () => api.invites(group!.id),
    enabled: !!group && role === "admin",
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invites", group?.id] });

  const create = useMutation({
    mutationFn: () => api.createInvite(group!.id, label.trim() ? { label } : {}),
    onSuccess: async () => {
      setLabel("");
      setCopied(false);
      await refresh();
    },
  });

  const replace = useMutation({
    mutationFn: async (inviteId: string) => {
      await api.revokeInvite(inviteId);
      return api.createInvite(group!.id, {});
    },
    onSuccess: async () => {
      setCopied(false);
      await refresh();
    },
  });

  if (groups.isPending || (group && members.isPending)) return <Loading />;
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
  if (role !== "admin") {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">Solo los admins invitan</h1>
        <p className="mt-3 text-lg text-gris">Pídele a un admin del grupo que te comparta un enlace.</p>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }

  const list = invites.data ?? [];
  const current = list.find(isPending);
  const link = current ? `${window.location.origin}/i/${current.token}` : null;
  const names = new Map(members.data?.map((m) => [m.userId, m.displayName]) ?? []);
  const joined = list
    .filter((i) => i.acceptedAt && i.acceptedBy)
    .sort((a, b) => +new Date(b.acceptedAt!) - +new Date(a.acceptedAt!));

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(`Te invito a ${group.name} en art-flux: ${link}`)}`
    : null;

  return (
    <Page>
      <header className="flex items-center gap-3">
        <BackLink to={`/${group.handle}`} label="Volver al grupo" />
        <Avatar name={group.name} seed={group.id} size={44} />
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{group.name}</p>
          <Mono>{group.city ? `${group.city.toLowerCase()} · ` : ""}invitar</Mono>
        </div>
      </header>

      <h1 className="mt-8 text-5xl">Invita a tu gente</h1>
      <div className="mt-3">
        <Lead>
          Quien abra el enlace y entre con Google queda como miembro. Cada enlace sirve una sola vez y dura 7 días.
        </Lead>
      </div>

      <section className="mt-6 rounded-3xl border border-linea bg-hoja p-5">
        <Mono>enlace de invitación</Mono>

        {invites.isError && (
          <div className="mt-3">
            <ErrorNote error={invites.error} />
          </div>
        )}

        {link && current ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <input
                readOnly
                aria-label="Enlace de invitación"
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-[52px] min-w-0 flex-1 rounded-2xl bg-fondo px-4 font-mono text-sm"
              />
              <button
                type="button"
                onClick={copy}
                aria-label="Copiar enlace"
                className="inline-flex size-[52px] shrink-0 items-center justify-center rounded-2xl border border-linea text-xl"
              >
                {copied ? "✓" : "⧉"}
              </button>
            </div>
            <Mono className="mt-2 block">
              {current.label ? `${current.label} · ` : ""}caduca el {day.format(new Date(current.expiresAt))}
            </Mono>
            <a
              href={whatsapp!}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-grafito px-5 text-lg font-semibold text-white"
            >
              Compartir por WhatsApp
            </a>
            <div className="mt-2 text-center">
              <TextButton onClick={() => replace.mutate(current.id)} disabled={replace.isPending}>
                Anular este enlace y generar otro
              </TextButton>
            </div>
          </>
        ) : (
          !invites.isPending && (
            <div className="mt-3 space-y-4">
              <Field
                label="¿Para quién es?"
                optional
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="Para recordarlo tú; no se muestra a la otra persona"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Generando…" : "Generar enlace"}
              </Button>
            </div>
          )
        )}
        {(create.isError || replace.isError) && (
          <div className="mt-3">
            <ErrorNote error={create.error ?? replace.error} />
          </div>
        )}
      </section>

      {joined.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between border-b border-linea pb-2">
            <h2 className="text-xl font-bold">Ya entraron</h2>
            <Mono>{joined.length} por enlace</Mono>
          </div>
          <ul>
            {joined.map((i) => (
              <li key={i.id} className="flex items-center gap-4 border-b border-linea py-4">
                <Avatar name={names.get(i.acceptedBy!)} seed={i.acceptedBy!} size={44} />
                <span className="flex-1 text-lg">{names.get(i.acceptedBy!) ?? "Sin nombre"}</span>
                <Mono>{i.label ?? "miembro"}</Mono>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-auto pt-8">
        <LinkButton to={`/${group.handle}`} variant="outline">
          Ir al grupo
        </LinkButton>
      </div>
    </Page>
  );
}
