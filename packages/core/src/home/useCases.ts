import { NotFoundError } from "../errors";
import type { ApproachDeps } from "../approaches";
import type { Approach } from "../approaches";
import type { Session } from "../sessions";

export interface UpcomingSession {
  session: Session;
  approachCount: number;
}

export interface MyApproach {
  approach: Approach;
  session: Session;
}

export interface MyHome {
  /** Held sessions that still need their record. For now every held session; HU-12 narrows it to those without findings. */
  toRecord: Session[];
  /** Approaches I bring, in planned sessions. */
  mine: MyApproach[];
  /** Planned sessions of the group, soonest first. */
  upcoming: UpcomingSession[];
}

/** Planned sessions go by date (undated ones last), then by number. */
function bySoonest(a: Session, b: Session): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.number - b.number;
}

/** HU-09: what is on my plate in a group — to record, to bring, and what is coming. */
export async function getMyHome(
  deps: ApproachDeps,
  input: { groupId: string; userId: string },
): Promise<MyHome> {
  if ((await deps.groups.getMemberRole(input.groupId, input.userId)) === null) throw new NotFoundError();

  const sessions = await deps.sessions.list(input.groupId);
  const planned = sessions.filter((s) => s.status === "planned").sort(bySoonest);
  const completed = sessions.filter((s) => s.status === "completed");

  const approaches = await deps.approaches.listBySessions(planned.map((s) => s.id));
  const countBySession = new Map<string, number>();
  for (const a of approaches) countBySession.set(a.sessionId, (countBySession.get(a.sessionId) ?? 0) + 1);

  const mine: MyApproach[] = [];
  for (const session of planned) {
    const own = approaches
      .filter((a) => a.sessionId === session.id && a.ownerId === input.userId)
      .sort((a, b) => a.position - b.position);
    for (const approach of own) mine.push({ approach, session });
  }

  return {
    toRecord: completed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    mine,
    upcoming: planned.map((session) => ({ session, approachCount: countBySession.get(session.id) ?? 0 })),
  };
}
