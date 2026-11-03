import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useApi } from "../api/ApiProvider";
import type { MediaDto, MemberDto } from "../api/api";
import { KIND_ICON, KIND_LABEL, formatDuration, mediaTitle, timeAgo } from "../mediaFormat";
import { ErrorNote, Mono, TextButton } from "../ui";

/** The opened piece of material: the photo, the player, the link or the note itself. */
function Opened({ media }: { media: MediaDto }) {
  const api = useApi();
  const needsUrl = media.kind === "photo" || media.kind === "audio" || media.kind === "document";
  // Signed addresses live minutes, so they are asked for when someone opens it and not kept around.
  const address = useQuery({
    queryKey: ["media-url", media.id],
    queryFn: () => api.mediaUrl(media.id),
    enabled: needsUrl,
    staleTime: 0,
    gcTime: 0,
  });

  if (media.kind === "note") return <p className="mt-3 whitespace-pre-line font-lectura text-lg">{media.body}</p>;
  if (media.kind === "link") {
    return (
      <a href={media.url} target="_blank" rel="noopener noreferrer" className="mt-3 block break-all text-lg font-semibold text-verde">
        {media.url}
      </a>
    );
  }
  if (address.isError) return <ErrorNote error={address.error} />;
  if (!address.data) return <Mono className="mt-3 block">Abriendo…</Mono>;
  if (media.kind === "photo") {
    return <img src={address.data.url} alt={mediaTitle(media)} className="mt-3 max-h-[70dvh] w-full rounded-2xl object-contain" />;
  }
  if (media.kind === "audio") return <audio controls src={address.data.url} className="mt-3 w-full" />;
  return (
    <a href={address.data.url} target="_blank" rel="noopener noreferrer" className="mt-3 block text-lg font-semibold text-verde">
      Abrir archivo
    </a>
  );
}

function MediaRow({
  media,
  author,
  canRemove,
}: {
  media: MediaDto;
  author: string;
  canRemove: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.removeMedia(media.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
  const title = mediaTitle(media);
  const pending = media.status === "pending";

  return (
    <li className="rounded-3xl border border-linea bg-hoja p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`inline-flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl ${
            media.kind === "audio" ? "bg-resaltador" : "bg-fondo"
          }`}
        >
          {KIND_ICON[media.kind]}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Abrir ${title}`}
          disabled={pending}
          onClick={() => setOpen((v) => !v)}
          className="min-h-tactil min-w-0 flex-1 text-left disabled:opacity-60"
        >
          <span className="block truncate text-lg font-semibold">{title}</span>
          <Mono>
            {KIND_LABEL[media.kind]}
            {media.durationSeconds ? ` · [${formatDuration(media.durationSeconds)}]` : ""} · {author} ·{" "}
            {pending ? "subiendo…" : timeAgo(media.createdAt)}
          </Mono>
        </button>
        {canRemove && (
          <TextButton className="!text-base" disabled={remove.isPending} onClick={() => remove.mutate()} aria-label={`Quitar ${title}`}>
            Quitar
          </TextButton>
        )}
      </div>
      {open && <Opened media={media} />}
      {remove.isError && <ErrorNote error={remove.error} />}
    </li>
  );
}

/** Material of an obra, of one of its sessions or of one approach: what was captured, by whom, and when. */
export function MediaList({
  projectId,
  sessionId,
  approachId,
  members,
  currentUserId,
  isAdmin,
  unassignedOnly = false,
  label,
}: {
  projectId: string;
  sessionId?: string | undefined;
  approachId?: string | undefined;
  members: MemberDto[];
  currentUserId: string;
  isAdmin: boolean;
  /** For the obra's own page: only what was not tied to a session yet. */
  unassignedOnly?: boolean;
  /** Accessible name of the list. */
  label: string;
}) {
  const api = useApi();
  const list = useQuery({
    queryKey: ["media", projectId, sessionId ?? null, approachId ?? null],
    queryFn: () => api.projectMedia(projectId, { ...(sessionId ? { sessionId } : {}), ...(approachId ? { approachId } : {}) }),
  });
  const items = (list.data ?? []).filter((m) => !unassignedOnly || !m.sessionId);

  if (list.isError) return <ErrorNote error={list.error} />;
  if (list.isPending) return <Mono className="block">Cargando…</Mono>;
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="space-y-3">
      {items.map((m) => (
        <MediaRow
          key={m.id}
          media={m}
          author={members.find((p) => p.userId === m.createdBy)?.displayName ?? "alguien"}
          canRemove={isAdmin || m.createdBy === currentUserId}
        />
      ))}
    </ul>
  );
}
