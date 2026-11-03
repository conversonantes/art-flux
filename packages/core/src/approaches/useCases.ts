import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Clock, GroupsRepo } from "../groups";
import type { Session, SessionsRepo } from "../sessions";
import { addApproachSchema, updateApproachSchema, type Approach } from "./approach";
import type { ApproachesRepo } from "./repo";

export interface ApproachDeps {
  groups: GroupsRepo;
  sessions: SessionsRepo;
  approaches: ApproachesRepo;
  clock: Clock;
}

async function sessionOrNotFound(deps: ApproachDeps, sessionId: string): Promise<Session> {
  const session = await deps.sessions.getById(sessionId);
  if (!session) throw new NotFoundError("No encontramos esa sesión");
  return session;
}

async function requireMember(deps: ApproachDeps, session: Session, userId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(session.groupId, userId)) === null) throw new NotFoundError();
}

/** Approaches are planning: once the session was held they stay as they were. */
function requirePlanned(session: Session): void {
  if (session.status !== "planned") throw new ConflictError("La sesión ya se realizó: sus planteamientos no cambian");
}

async function requireGroupMemberOwner(deps: ApproachDeps, session: Session, ownerId: string): Promise<void> {
  if ((await deps.groups.getMemberRole(session.groupId, ownerId)) === null) {
    throw new ForbiddenError("Solo puede traerlo alguien del grupo");
  }
}

/** HU-08: any member adds an approach to a planned session; the owner defaults to the author. */
export async function addApproach(
  deps: ApproachDeps,
  input: { id: string; sessionId: string; userId: string; text: string; ownerId?: string | undefined },
): Promise<Approach> {
  const session = await sessionOrNotFound(deps, input.sessionId);
  await requireMember(deps, session, input.userId);
  requirePlanned(session);
  const { text } = addApproachSchema.parse({ text: input.text });
  const ownerId = input.ownerId ?? input.userId;
  await requireGroupMemberOwner(deps, session, ownerId);

  const approach: Approach = {
    id: input.id,
    sessionId: session.id,
    position: await deps.approaches.nextPosition(session.id),
    text,
    ownerId,
    createdBy: input.userId,
    createdAt: deps.clock.now(),
  };
  await deps.approaches.create(approach);
  return approach;
}

export async function listApproaches(
  deps: ApproachDeps,
  input: { sessionId: string; userId: string },
): Promise<Approach[]> {
  const session = await sessionOrNotFound(deps, input.sessionId);
  await requireMember(deps, session, input.userId);
  return deps.approaches.listBySession(session.id);
}

async function approachContext(deps: ApproachDeps, approachId: string, userId: string) {
  const approach = await deps.approaches.getById(approachId);
  if (!approach) throw new NotFoundError("No encontramos ese planteamiento");
  const session = await sessionOrNotFound(deps, approach.sessionId);
  await requireMember(deps, session, userId);
  requirePlanned(session);
  return { approach, session };
}

/** Change the text or who brings it. */
export async function updateApproach(
  deps: ApproachDeps,
  input: { approachId: string; userId: string; changes: { text?: string; ownerId?: string } },
): Promise<Approach> {
  const { approach, session } = await approachContext(deps, input.approachId, input.userId);
  const { text } = updateApproachSchema.parse({ text: input.changes.text });
  if (input.changes.ownerId !== undefined) await requireGroupMemberOwner(deps, session, input.changes.ownerId);

  return deps.approaches.update(approach.id, {
    ...(text !== undefined ? { text } : {}),
    ...(input.changes.ownerId !== undefined ? { ownerId: input.changes.ownerId } : {}),
  });
}

export async function removeApproach(
  deps: ApproachDeps,
  input: { approachId: string; userId: string },
): Promise<void> {
  const { approach } = await approachContext(deps, input.approachId, input.userId);
  await deps.approaches.remove(approach.id);
}

/**
 * HU-08: reorder by dragging. The client sends the full new order; if it does not match what the
 * session has now (someone added or removed one meanwhile) it is refused so the client reloads.
 */
export async function reorderApproaches(
  deps: ApproachDeps,
  input: { sessionId: string; userId: string; orderedIds: string[] },
): Promise<Approach[]> {
  const session = await sessionOrNotFound(deps, input.sessionId);
  await requireMember(deps, session, input.userId);
  requirePlanned(session);

  const current = await deps.approaches.listBySession(session.id);
  const sent = new Set(input.orderedIds);
  const same =
    sent.size === input.orderedIds.length &&
    sent.size === current.length &&
    current.every((a) => sent.has(a.id));
  if (!same) throw new ConflictError("La lista cambió mientras la ordenabas. Recárgala e intenta de nuevo.");

  await deps.approaches.reorder(session.id, input.orderedIds);
  return deps.approaches.listBySession(session.id);
}
