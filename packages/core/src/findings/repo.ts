import type { FindingFragment } from "./finding";

export interface FindingsRepo {
  getById(fragmentId: string): Promise<FindingFragment | null>;
  /** Not removed, oldest first. */
  listByApproach(approachId: string): Promise<FindingFragment[]>;
  /** Not removed, of all the given approaches at once (no particular order). */
  listByApproaches(approachIds: string[]): Promise<FindingFragment[]>;
  /** Saving an id that already exists is a no-op (a retried request); use `updateText` to change it. */
  create(fragment: FindingFragment): Promise<void>;
  updateText(fragmentId: string, text: string, now: Date): Promise<FindingFragment>;
  /** Soft delete. Adapters backed by a database re-check that only the author may. */
  remove(fragmentId: string): Promise<void>;
}
