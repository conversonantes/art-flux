import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Clock, GroupsRepo } from "../groups";
import { createProject, type Project, type ProjectDeps, type ProjectsRepo } from "../projects";
import {
  createSessionSchema,
  updateSessionSchema,
  type CreateSessionInput,
  type Session,
  type SessionScope,
  type UpdateSessionInput,
} from "./session";
import { SessionNumberTakenError, type SessionsRepo } from "./repo";

export interface SessionDeps {
  groups: GroupsRepo;
  projects: ProjectsRepo;
  sessions: SessionsRepo;
  clock: Clock;
}

const MAX_ATTEMPTS = 20;

async function requireMember(deps: SessionDeps, groupId: string, userId: string) {
  const role = await deps.groups.getMemberRole(groupId, userId);
  if (role === null) throw new NotFoundError();
  return role;
}

/** Assigns max + 1 in the scope, retrying if someone else took the number meanwhile. */
async function withNextNumber<T>(
  deps: SessionDeps,
  groupId: string,
  scope: SessionScope,
  save: (number: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const number = await deps.sessions.nextNumber(groupId, scope);
    try {
      return await save(number);
    } catch (e) {
      if (e instanceof SessionNumberTakenError) continue; // race: take the next one
      throw e;
    }
  }
  throw new Error("No se pudo asignar un número a la sesión");
}

/** HU-07: any member plans a session of the group or of a project. It is born "planned". */
export async function createSession(
  deps: SessionDeps,
  input: { id: string; groupId: string; userId: string; projectId?: string | undefined } & CreateSessionInput,
): Promise<Session> {
  const { id, groupId, userId, projectId, ...data } = input;
  await requireMember(deps, groupId, userId);
  const { date, place, objective } = createSessionSchema.parse(data);

  if (projectId) {
    const project = await deps.projects.getById(projectId);
    if (!project || project.groupId !== groupId) throw new NotFoundError("No encontramos esa obra");
  }

  return withNextNumber(deps, groupId, { projectId: projectId ?? null }, async (number) => {
    const session: Session = {
      id,
      groupId,
      ...(projectId ? { projectId } : {}),
      number,
      ...(date ? { date } : {}),
      ...(place ? { place } : {}),
      ...(objective ? { objective } : {}),
      status: "planned",
      createdBy: userId,
      createdAt: deps.clock.now(),
    };
    await deps.sessions.create(session);
    return session;
  });
}

/** `projectId`: a project's sessions; `null`: only group-level ones; omitted: all of the group. */
export async function listSessions(
  deps: SessionDeps,
  input: { groupId: string; userId: string; projectId?: string | null },
): Promise<Session[]> {
  await requireMember(deps, input.groupId, input.userId);
  const scope = input.projectId === undefined ? undefined : { projectId: input.projectId };
  return deps.sessions.list(input.groupId, scope as SessionScope | undefined);
}

/** A session by its address: S02 of a project (by slug) or S02 of the group. */
export async function getSession(
  deps: SessionDeps,
  input: { groupId: string; userId: string; number: number; projectSlug?: string | undefined },
): Promise<Session> {
  await requireMember(deps, input.groupId, input.userId);
  let projectId: string | null = null;
  if (input.projectSlug) {
    const project = await deps.projects.getBySlug(input.groupId, input.projectSlug);
    if (!project) throw new NotFoundError("No encontramos esa obra");
    projectId = project.id;
  }
  const session = await deps.sessions.getByNumber(input.groupId, { projectId }, input.number);
  if (!session) throw new NotFoundError("No encontramos esa sesión");
  return session;
}

/** The admin, or whoever created the session, edits date, place and objective. */
export async function updateSession(
  deps: SessionDeps,
  input: { sessionId: string; userId: string; changes: UpdateSessionInput },
): Promise<Session> {
  const session = await deps.sessions.getById(input.sessionId);
  if (!session) throw new NotFoundError("No encontramos esa sesión");
  const role = await requireMember(deps, session.groupId, input.userId);
  if (role !== "admin" && session.createdBy !== input.userId) throw new ForbiddenError();

  const patch = updateSessionSchema.parse(input.changes);
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return deps.sessions.update(session.id, clean);
}

async function sessionForMember(deps: SessionDeps, sessionId: string, userId: string): Promise<Session> {
  const session = await deps.sessions.getById(sessionId);
  if (!session) throw new NotFoundError("No encontramos esa sesión");
  await requireMember(deps, session.groupId, userId);
  return session;
}

/** Whoever attended must belong to the group; repeated people count once. */
async function checkAttendees(deps: SessionDeps, groupId: string, attendeeIds: string[]): Promise<string[]> {
  const unique = [...new Set(attendeeIds)];
  for (const id of unique) {
    if ((await deps.groups.getMemberRole(groupId, id)) === null) {
      throw new ForbiddenError("Solo pueden asistir personas del grupo");
    }
  }
  return unique;
}

/** HU-11: any member closes the "before" of a planned session and notes who was there. */
export async function markCompleted(
  deps: SessionDeps,
  input: { sessionId: string; userId: string; attendeeIds: string[] },
): Promise<Session> {
  const session = await sessionForMember(deps, input.sessionId, input.userId);
  if (session.status !== "planned") throw new ConflictError("La sesión ya se marcó como realizada");
  const attendeeIds = await checkAttendees(deps, session.groupId, input.attendeeIds);
  return deps.sessions.complete(session.id, attendeeIds);
}

/** HU-11: correct who attended once the session was held. */
export async function updateAttendees(
  deps: SessionDeps,
  input: { sessionId: string; userId: string; attendeeIds: string[] },
): Promise<string[]> {
  const session = await sessionForMember(deps, input.sessionId, input.userId);
  if (session.status !== "completed") throw new ConflictError("La sesión todavía no se ha realizado");
  const attendeeIds = await checkAttendees(deps, session.groupId, input.attendeeIds);
  await deps.sessions.setAttendees(session.id, attendeeIds);
  return attendeeIds;
}

export async function listAttendees(
  deps: SessionDeps,
  input: { sessionId: string; userId: string },
): Promise<string[]> {
  const session = await sessionForMember(deps, input.sessionId, input.userId);
  return deps.sessions.listAttendees(session.id);
}

/**
 * HU-05: an admin makes a group session the origin of a project. The session joins the
 * project and takes its next number (S01 if it is the first), and the project remembers it.
 */
export async function attachOriginSession(
  deps: SessionDeps,
  input: { projectId: string; sessionId: string; userId: string },
): Promise<Session> {
  const project = await deps.projects.getById(input.projectId);
  if (!project) throw new NotFoundError("No encontramos esa obra");
  const role = await requireMember(deps, project.groupId, input.userId);
  if (role !== "admin") throw new ForbiddenError();

  const session = await deps.sessions.getById(input.sessionId);
  if (!session || session.groupId !== project.groupId) throw new NotFoundError("No encontramos esa sesión");
  if (session.projectId) throw new ConflictError("Esa sesión ya pertenece a una obra");
  if (project.originSessionId) throw new ConflictError("La obra ya tiene una sesión de origen");

  return withNextNumber(deps, project.groupId, { projectId: project.id }, (number) =>
    deps.sessions.attachAsOrigin(session.id, project.id, number),
  );
}

/**
 * HU-05: creates a project, optionally born from a group session. Everything about the
 * session is checked before the project exists, so a bad origin never leaves a half-made project.
 */
export async function createProjectWithOrigin(
  deps: SessionDeps & ProjectDeps,
  input: Parameters<typeof createProject>[1] & { originSessionId?: string | undefined },
): Promise<{ project: Project; origin?: Session }> {
  const { originSessionId, ...projectInput } = input;

  if (originSessionId) {
    const role = await deps.groups.getMemberRole(input.groupId, input.userId);
    if (role === null) throw new NotFoundError();
    if (role !== "admin") throw new ForbiddenError();
    const session = await deps.sessions.getById(originSessionId);
    if (!session || session.groupId !== input.groupId) throw new NotFoundError("No encontramos esa sesión");
    if (session.projectId) throw new ConflictError("Esa sesión ya pertenece a una obra");
  }

  const project = await createProject(deps, projectInput);
  if (!originSessionId) return { project };

  const origin = await attachOriginSession(deps, {
    projectId: project.id,
    sessionId: originSessionId,
    userId: input.userId,
  });
  return { project: { ...project, originSessionId }, origin };
}
