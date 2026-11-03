import { z } from "zod";

export const FILE_KINDS = ["photo", "audio", "document"] as const;
export const MEDIA_KINDS = [...FILE_KINDS, "link", "note"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];

const MB = 1024 * 1024;

/** Per-file ceilings. Photos get compressed on the phone later (HU-13b); until then they may be larger. */
export const MAX_BYTES: Record<FileKind, number> = { photo: 10 * MB, audio: 15 * MB, document: 20 * MB };
/** Voice notes: up to 3 minutes. Long recordings go in as a link (YouTube, Drive). */
export const MAX_AUDIO_SECONDS = 180;

/** What each kind of file may be, and the extension its object gets in R2. */
export const FILE_TYPES: Record<FileKind, Record<string, string>> = {
  photo: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" },
  audio: {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  },
  document: {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.oasis.opendocument.text": "odt",
  },
};

export const isFileKind = (kind: MediaKind): kind is FileKind => (FILE_KINDS as readonly string[]).includes(kind);

/** "audio/webm;codecs=opus" -> "audio/webm": browsers append parameters to recorded audio. */
export const baseMime = (mime: string) => (mime.split(";")[0] ?? "").trim().toLowerCase();

const title = z
  .string()
  .trim()
  .max(120, "El título es muy largo")
  .nullish()
  .transform((t) => t || undefined);

const file = <K extends FileKind>(kind: K) =>
  z.object({
    kind: z.literal(kind),
    title,
    mime: z
      .string()
      .transform(baseMime)
      .refine((m) => m in FILE_TYPES[kind], "Ese tipo de archivo no se puede subir aquí"),
    sizeBytes: z
      .number({ error: "Falta el tamaño del archivo" })
      .int()
      .min(1, "El archivo está vacío")
      .max(MAX_BYTES[kind], `El archivo pesa demasiado (máximo ${MAX_BYTES[kind] / MB} MB)`),
    /** Only voice notes carry it; the other kinds ignore it. */
    durationSeconds: z
      .number()
      .int()
      .min(1)
      .max(MAX_AUDIO_SECONDS, "Las notas de voz duran hasta 3 minutos; para algo más largo, pega un enlace")
      .nullish()
      .transform((d) => d ?? undefined),
  });

/** What a person sends to register material; one shape per kind. */
export const registerMediaSchema = z.discriminatedUnion("kind", [
  file("photo"),
  file("audio"),
  file("document"),
  z.object({
    kind: z.literal("link"),
    title,
    url: z
      .string()
      .trim()
      .max(2000, "El enlace es muy largo")
      .refine((value) => {
        try {
          const { protocol } = new URL(value);
          return protocol === "https:" || protocol === "http:";
        } catch {
          return false;
        }
      }, "Pega un enlace que empiece por https://"),
  }),
  z.object({
    kind: z.literal("note"),
    title,
    body: z.string().trim().min(1, "Escribe la nota").max(4000, "La nota es muy larga"),
  }),
]);
export type RegisterMediaInput = z.input<typeof registerMediaSchema>;

/**
 * Something captured in an obra: a photo, a voice note, a file, a link or a written note.
 * Files live in R2 (`path`), never in the database; `pending` means the upload was not confirmed.
 */
export interface Media {
  id: string;
  groupId: string;
  projectId: string;
  /** Set when it belongs to a session of the obra; implied by `approachId`. */
  sessionId?: string;
  approachId?: string;
  kind: MediaKind;
  title?: string;
  /** `grupos/{group}/obras/{project}/{id}.{ext}` (files only). */
  path?: string;
  mime?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  url?: string;
  body?: string;
  status: "pending" | "uploaded";
  createdBy: string;
  createdAt: Date;
}

/** Where a file goes in the bucket. The database keeps this path, never a URL. */
export const mediaPath = (groupId: string, projectId: string, mediaId: string, extension: string) =>
  `grupos/${groupId}/obras/${projectId}/${mediaId}.${extension}`;
