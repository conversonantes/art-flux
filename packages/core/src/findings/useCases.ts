import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import type { Approach, ApproachesRepo } from "../approaches";
import type { Clock, GroupsRepo } from "../groups";
import type { Session, SessionsRepo } from "../sessions";
import { fragmentKindSchema, fragmentTextSchema, type FindingFragment } from "./finding";
import type { FindingsRepo } from "./repo";

export interface FindingDeps {
  groups: GroupsRepo;
  sessions: SessionsRepo;
  approaches: ApproachesRepo;
  findings: FindingsRepo;
  clock: Clock;
}

/** The approach and its session, for someone who belongs to the group (404 otherwise, on purpose). */
async function approachContext(
  deps: FindingDeps,
  approachId: string,
  userId: string,
): Promise<{ approach: Approach; session: Session }> {
  const approach = await deps.approaches.getById(approachId);
  if (!approach) throw new NotFoundError("No encontramos ese planteamiento");
  const session = await deps.sessions.getById(approach.sessionId);
  if (!session) throw new NotFoundError("No encontramos esa sesión");
  if ((await deps.groups.getMemberRole(session.groupId, userId)) === null) throw new NotFoundError();
  return { approach, session };
}

/** The finding is the "after": it opens when the session is marked as held. */
function requireHeld(session: Session): void {
  if (session.status !== "completed") throw new ConflictError("La sesión todavía no se ha realizado");
}

export async function listFragments(
  deps: FindingDeps,
  input: { approachId: string; userId: string },
): Promise<FindingFragment[]> {
  const { approach } = await approachContext(deps, input.approachId, input.userId);
  return deps.findings.listByApproach(approach.id);
}

/**
 * HU-12: any member adds a fragment to the finding of an approach of a held session. Saving
 * the same `id` again edits that fragment's text (autosave, retries), and only its author may.
 */
export async function saveFragment(
  deps: FindingDeps,
  input: { id: string; approachId: string; userId: string; kind: string; text: string },
): Promise<FindingFragment> {
  const { approach, session } = await approachContext(deps, input.approachId, input.userId);
  requireHeld(session);
  const kind = fragmentKindSchema.parse(input.kind);
  const text = fragmentTextSchema.parse(input.text);

  const existing = await deps.findings.getById(input.id);
  if (existing) {
    if (existing.approachId !== approach.id) throw new NotFoundError("No encontramos ese fragmento");
    if (existing.authorId !== input.userId) throw new ForbiddenError("Solo quien lo escribió puede cambiarlo");
    if (existing.kind !== kind) throw new ConflictError("Un fragmento no cambia de «encontramos» a «faltó»");
    return deps.findings.updateText(existing.id, text, deps.clock.now());
  }

  const now = deps.clock.now();
  const fragment: FindingFragment = {
    id: input.id,
    approachId: approach.id,
    authorId: input.userId,
    kind,
    text,
    createdAt: now,
    updatedAt: now,
  };
  await deps.findings.create(fragment);
  return fragment;
}

export async function removeFragment(
  deps: FindingDeps,
  input: { fragmentId: string; userId: string },
): Promise<void> {
  const fragment = await deps.findings.getById(input.fragmentId);
  if (!fragment) throw new NotFoundError("No encontramos ese fragmento");
  await approachContext(deps, fragment.approachId, input.userId);
  if (fragment.authorId !== input.userId) throw new ForbiddenError("Solo quien lo escribió puede quitarlo");
  await deps.findings.remove(fragment.id);
}
