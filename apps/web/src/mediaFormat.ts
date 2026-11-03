import type { MediaDto, MediaKind } from "./api/api";

export const KIND_LABEL: Record<MediaKind, string> = {
  photo: "foto",
  audio: "audio",
  document: "archivo",
  link: "enlace",
  note: "nota",
};

export const KIND_ICON: Record<MediaKind, string> = {
  photo: "▣",
  audio: "♫",
  document: "▤",
  link: "⛓",
  note: "✎",
};

/** 134 -> "2:14" */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "hace un momento", "hace 3 min", "hace 2 h", "hace 4 días" */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** What to call a piece of material when nobody gave it a title. */
export function mediaTitle(media: MediaDto): string {
  if (media.title) return media.title;
  if (media.kind === "note") return (media.body ?? "Nota").split("\n")[0]!.slice(0, 60);
  if (media.kind === "link") return media.url ?? "Enlace";
  return { photo: "Foto", audio: "Nota de voz", document: "Archivo", link: "Enlace", note: "Nota" }[media.kind];
}
