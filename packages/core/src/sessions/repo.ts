import type { Session, SessionPatch, SessionScope } from "./session";

/** Thrown by the repo when the number is already used in that scope (also on races). */
export class SessionNumberTakenError extends Error {
  constructor(public readonly number: number) {
    super(`La sesión ${number} ya existe`);
    this.name = "SessionNumberTakenError";
  }
}

export interface SessionsRepo {
  /** max + 1 inside the scope (1 if empty). */
  nextNumber(groupId: string, scope: SessionScope): Promise<number>;
  /** Throws SessionNumberTakenError. */
  create(session: Session): Promise<void>;
  getById(sessionId: string): Promise<Session | null>;
  getByNumber(groupId: string, scope: SessionScope, number: number): Promise<Session | null>;
  /**
   * Sessions of a group, oldest number first. `scope` narrows to one project or to the
   * group-level sessions; leave it out for all of them.
   */
  list(groupId: string, scope?: SessionScope): Promise<Session[]>;
  update(sessionId: string, patch: SessionPatch): Promise<Session>;
  /**
   * Makes the session the origin of the project, atomically: it joins the project with
   * `number` and the project remembers it. Throws SessionNumberTakenError.
   */
  attachAsOrigin(sessionId: string, projectId: string, number: number): Promise<Session>;
}
