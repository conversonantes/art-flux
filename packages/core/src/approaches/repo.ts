import type { Approach, ApproachPatch } from "./approach";

export interface ApproachesRepo {
  /** max + 1 within the session (1 if empty). */
  nextPosition(sessionId: string): Promise<number>;
  create(approach: Approach): Promise<void>;
  getById(approachId: string): Promise<Approach | null>;
  /** Not removed, by position (ties by creation time). */
  listBySession(sessionId: string): Promise<Approach[]>;
  /** Not removed, of all the given sessions at once (no particular order). */
  listBySessions(sessionIds: string[]): Promise<Approach[]>;
  update(approachId: string, patch: ApproachPatch): Promise<Approach>;
  /** Soft delete: the row stays, it just stops appearing. Idempotent. */
  remove(approachId: string): Promise<void>;
  /** Sets the owner's note, or clears it with null. Adapters backed by a database re-check who may. */
  setNote(approachId: string, note: string | null): Promise<Approach>;
  /**
   * Sets the order in one step. `orderedIds` must be exactly the session's current approaches;
   * adapters backed by a database check that there, atomically.
   */
  reorder(sessionId: string, orderedIds: string[]): Promise<void>;
}
