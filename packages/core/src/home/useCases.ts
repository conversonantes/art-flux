import { NotFoundError } from "../errors";
import type { Approach, ApproachDeps } from "../approaches";
import type { FindingsRepo } from "../findings";
import type { Session } from "../sessions";

export interface UpcomingSession {
  session: Session;
  approachCount: number;
}

export interface MyApproach {
  approach: Approach;
  session: Session;
  /** 1, 2, 3… by the order of the session's list: the "P3" of its address. */
  order: number;
}

/** A held session whose approaches are not all written up yet. */
export interface SessionToRecord {
  session: Session;
  /** Approaches of the session. */
  total: number;
  /** Approaches with at least one finding fragment. */
  done: number;
  /** Who brings the approaches still without a finding (each person once). */
  pendingOwnerIds: string[];
}

export interface MyHome {
  /** Held sessions with approaches that still lack their finding, most recent first. */
  toRecord: SessionToRecord[];
  /** Approaches I bring: those of planned sessions, and those of held sessions without a finding yet. */
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
  deps: ApproachDeps & { findings: FindingsRepo },
  input: { groupId: string; userId: string },
): Promise<MyHome> {
  if ((await deps.groups.getMemberRole(input.groupId, input.userId)) === null) throw new NotFoundError();

  const sessions = await deps.sessions.list(input.groupId);
  const planned = sessions.filter((s) => s.status === "planned").sort(bySoonest);
  const completed = sessions.filter((s) => s.status === "completed");

  const approaches = await deps.approaches.listBySessions(sessions.map((s) => s.id));
  const withFinding = new Set(
    (await deps.findings.listByApproaches(approaches.map((a) => a.id))).map((f) => f.approachId),
  );
  const countBySession = new Map<string, number>();
  for (const a of approaches) countBySession.set(a.sessionId, (countBySession.get(a.sessionId) ?? 0) + 1);

  const inOrder = (a: Approach, b: Approach) => a.position - b.position;
  const toRecord: SessionToRecord[] = [];
  for (const session of completed) {
    const own = approaches.filter((a) => a.sessionId === session.id);
    const pending = own.filter((a) => !withFinding.has(a.id));
    if (pending.length === 0) continue;
    toRecord.push({
      session,
      total: own.length,
      done: own.length - pending.length,
      pendingOwnerIds: [...new Set(pending.sort(inOrder).map((a) => a.ownerId))],
    });
  }
  toRecord.sort((a, b) => b.session.createdAt.getTime() - a.session.createdAt.getTime());

  const mine: MyApproach[] = [];
  for (const session of [...completed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), ...planned]) {
    const all = approaches.filter((a) => a.sessionId === session.id).sort(inOrder);
    all.forEach((approach, index) => {
      if (approach.ownerId !== input.userId) return;
      if (session.status === "completed" && withFinding.has(approach.id)) return;
      mine.push({ approach, session, order: index + 1 });
    });
  }

  return {
    toRecord,
    mine,
    upcoming: planned.map((session) => ({ session, approachCount: countBySession.get(session.id) ?? 0 })),
  };
}
