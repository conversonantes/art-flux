import { ConflictError } from "../errors";
import type { InMemoryProjectsRepo } from "../projects";
import type { Session, SessionPatch, SessionScope } from "./session";
import { SessionNumberTakenError, type SessionsRepo } from "./repo";

const sameScope = (s: Session, groupId: string, scope: SessionScope) =>
  s.groupId === groupId && (scope.projectId === null ? s.projectId === undefined : s.projectId === scope.projectId);

export class InMemorySessionsRepo implements SessionsRepo {
  readonly sessions: Session[] = [];

  /** `projects` is where an origin session is recorded when it joins a project. */
  constructor(private readonly projects: InMemoryProjectsRepo) {}

  async nextNumber(groupId: string, scope: SessionScope): Promise<number> {
    const numbers = this.sessions.filter((s) => sameScope(s, groupId, scope)).map((s) => s.number);
    return numbers.length ? Math.max(...numbers) + 1 : 1;
  }

  async create(session: Session): Promise<void> {
    const scope: SessionScope = { projectId: session.projectId ?? null };
    if (this.sessions.some((s) => sameScope(s, session.groupId, scope) && s.number === session.number)) {
      throw new SessionNumberTakenError(session.number);
    }
    this.sessions.push(session);
  }

  async getById(sessionId: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === sessionId) ?? null;
  }

  async getByNumber(groupId: string, scope: SessionScope, number: number): Promise<Session | null> {
    return this.sessions.find((s) => sameScope(s, groupId, scope) && s.number === number) ?? null;
  }

  async list(groupId: string, scope?: SessionScope): Promise<Session[]> {
    return this.sessions
      .filter((s) => (scope ? sameScope(s, groupId, scope) : s.groupId === groupId))
      .sort((a, b) => a.number - b.number);
  }

  async update(sessionId: string, patch: SessionPatch): Promise<Session> {
    const session = await this.getById(sessionId);
    if (!session) throw new Error("session not found");
    for (const key of ["date", "place", "objective"] as const) {
      const value = patch[key];
      if (value === null) delete session[key];
      else if (value !== undefined) session[key] = value;
    }
    return session;
  }

  async attachAsOrigin(sessionId: string, projectId: string, number: number): Promise<Session> {
    const session = await this.getById(sessionId);
    const project = await this.projects.getById(projectId);
    if (!session || !project) throw new Error("session or project not found");
    const scope: SessionScope = { projectId };
    if (this.sessions.some((s) => sameScope(s, project.groupId, scope) && s.number === number)) {
      throw new SessionNumberTakenError(number);
    }
    session.projectId = projectId;
    session.number = number;
    project.originSessionId = sessionId;
    return session;
  }

  private readonly attendees = new Map<string, string[]>();

  async complete(sessionId: string, attendeeIds: string[]): Promise<Session> {
    const session = await this.getById(sessionId);
    if (!session) throw new Error("session not found");
    if (session.status !== "planned") throw new ConflictError("La sesión ya se realizó");
    session.status = "completed";
    this.attendees.set(sessionId, [...new Set(attendeeIds)]);
    return session;
  }

  async setAttendees(sessionId: string, attendeeIds: string[]): Promise<void> {
    this.attendees.set(sessionId, [...new Set(attendeeIds)]);
  }

  async listAttendees(sessionId: string): Promise<string[]> {
    return [...(this.attendees.get(sessionId) ?? [])];
  }
}
