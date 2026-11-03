import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { ApproachesRepo } from "../approaches";
import type { Clock, GroupsRepo } from "../groups";
import type { ProjectsRepo } from "../projects";
import type { SessionsRepo } from "../sessions";
import type { FileStore, SignedUpload } from "./files";
import {
  FILE_TYPES,
  isFileKind,
  mediaPath,
  registerMediaSchema,
  type Media,
  type RegisterMediaInput,
} from "./media";
import type { MediaRepo } from "./repo";

export interface MediaDeps {
  groups: GroupsRepo;
  projects: ProjectsRepo;
  sessions: SessionsRepo;
  approaches: ApproachesRepo;
  media: MediaRepo;
  files: FileStore;
  clock: Clock;
}

/** How long a link to read a file lives: enough to open it, not to share it. */
const READ_SECONDS = 300;

async function requireMember(deps: MediaDeps, groupId: string, userId: string) {
  const role = await deps.groups.getMemberRole(groupId, userId);
  if (role === null) throw new NotFoundError();
  return role;
}

async function projectOfMember(deps: MediaDeps, projectId: string, userId: string) {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new NotFoundError("No encontramos esa obra");
  await requireMember(deps, project.groupId, userId);
  return project;
}

/**
 * Where the material sits inside the obra: a session of it, and an approach of that session.
 * An approach implies its session, so the session of an approach is never left out.
 */
async function resolvePlacement(
  deps: MediaDeps,
  projectId: string,
  place: { sessionId?: string | undefined; approachId?: string | undefined },
): Promise<{ sessionId?: string; approachId?: string }> {
  let sessionId = place.sessionId;
  if (place.approachId) {
    const approach = await deps.approaches.getById(place.approachId);
    if (!approach) throw new NotFoundError("No encontramos ese planteamiento");
    if (sessionId && sessionId !== approach.sessionId) {
      throw new ConflictError("Ese planteamiento no es de esa sesión");
    }
    sessionId = approach.sessionId;
  }
  if (sessionId) {
    const session = await deps.sessions.getById(sessionId);
    if (!session || session.projectId !== projectId) throw new NotFoundError("Esa sesión no es de esta obra");
  }
  return { ...(sessionId ? { sessionId } : {}), ...(place.approachId ? { approachId: place.approachId } : {}) };
}

export interface RegisteredMedia {
  media: Media;
  /** For files still pending: where the phone uploads them. Links and notes need nothing more. */
  upload?: SignedUpload;
}

/**
 * HU-13: any member registers material in an obra of their group, with the id generated on the
 * phone. Registering the same id again (a retry) gives back the same material and a fresh
 * upload address instead of a duplicate.
 */
export async function registerMedia(
  deps: MediaDeps,
  input: {
    id: string;
    projectId: string;
    userId: string;
    sessionId?: string | undefined;
    approachId?: string | undefined;
    material: RegisterMediaInput;
  },
): Promise<RegisteredMedia> {
  const project = await projectOfMember(deps, input.projectId, input.userId);

  const existing = await deps.media.getById(input.id, input.userId);
  if (existing) {
    if (existing.createdBy !== input.userId) throw new NotFoundError();
    return { media: existing, ...(await uploadFor(deps, existing)) };
  }

  const material = registerMediaSchema.parse(input.material);
  const place = await resolvePlacement(deps, project.id, input);
  const base = {
    id: input.id,
    groupId: project.groupId,
    projectId: project.id,
    ...place,
    ...(material.title ? { title: material.title } : {}),
    createdBy: input.userId,
    createdAt: deps.clock.now(),
  };

  let media: Media;
  if (material.kind === "link") {
    media = { ...base, kind: "link", url: material.url, status: "uploaded" };
  } else if (material.kind === "note") {
    media = { ...base, kind: "note", body: material.body, status: "uploaded" };
  } else {
    const extension = FILE_TYPES[material.kind][material.mime]!;
    media = {
      ...base,
      kind: material.kind,
      path: mediaPath(project.groupId, project.id, input.id, extension),
      mime: material.mime,
      sizeBytes: material.sizeBytes,
      ...(material.kind === "audio" && material.durationSeconds ? { durationSeconds: material.durationSeconds } : {}),
      status: "pending",
    };
  }

  await deps.media.create(media);
  // The id may already belong to someone else's pending upload (the store keeps the first one): not ours then.
  if (!(await deps.media.getById(media.id, input.userId))) throw new ConflictError("Ese identificador ya está en uso");
  return { media, ...(await uploadFor(deps, media)) };
}

async function uploadFor(deps: MediaDeps, media: Media): Promise<{ upload?: SignedUpload }> {
  if (media.status !== "pending" || !media.path || !media.mime || !media.sizeBytes) return {};
  return { upload: await deps.files.signUpload({ path: media.path, mime: media.mime, sizeBytes: media.sizeBytes }) };
}

/** The phone says the file reached the store; the core checks that it is really there, at the size promised. */
export async function confirmUpload(
  deps: MediaDeps,
  input: { mediaId: string; userId: string },
): Promise<Media> {
  const media = await deps.media.getById(input.mediaId, input.userId);
  if (!media) throw new NotFoundError("No encontramos ese material");
  await requireMember(deps, media.groupId, input.userId);
  if (media.createdBy !== input.userId) throw new ForbiddenError("Solo quien lo subió puede confirmarlo");
  if (media.status === "uploaded") return media;

  const stored = media.path ? await deps.files.head(media.path) : null;
  if (!stored) throw new ConflictError("El archivo todavía no llegó. Intenta subirlo de nuevo.");
  if (stored.sizeBytes !== media.sizeBytes) {
    await deps.files.delete(media.path!);
    throw new ConflictError("El archivo llegó incompleto. Intenta subirlo de nuevo.");
  }
  return deps.media.confirm(media.id);
}

/** Material of an obra, or only of one of its sessions or approaches. Newest first. */
export async function listMedia(
  deps: MediaDeps,
  input: { projectId: string; userId: string; sessionId?: string | undefined; approachId?: string | undefined },
): Promise<Media[]> {
  await projectOfMember(deps, input.projectId, input.userId);
  return deps.media.list(
    {
      projectId: input.projectId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.approachId ? { approachId: input.approachId } : {}),
    },
    input.userId,
  );
}

/** A short-lived address to open the material: a signed link for files, the link itself for links. */
export async function getMediaUrl(
  deps: MediaDeps,
  input: { mediaId: string; userId: string },
): Promise<{ url: string; expiresAt?: Date }> {
  const media = await deps.media.getById(input.mediaId, input.userId);
  if (!media) throw new NotFoundError("No encontramos ese material");
  await requireMember(deps, media.groupId, input.userId);
  if (media.kind === "link" && media.url) return { url: media.url };
  if (!isFileKind(media.kind) || !media.path) throw new ConflictError("Esto no tiene un archivo para abrir");
  if (media.status !== "uploaded") throw new ConflictError("El archivo todavía se está subiendo");
  return deps.files.signDownload(media.path, READ_SECONDS);
}

/** The author or an admin removes it. The file stays in the store until the monthly cleanup. */
export async function removeMedia(deps: MediaDeps, input: { mediaId: string; userId: string }): Promise<void> {
  const media = await deps.media.getById(input.mediaId, input.userId);
  if (!media) throw new NotFoundError("No encontramos ese material");
  const role = await requireMember(deps, media.groupId, input.userId);
  if (role !== "admin" && media.createdBy !== input.userId) throw new ForbiddenError();
  await deps.media.remove(media.id);
}
