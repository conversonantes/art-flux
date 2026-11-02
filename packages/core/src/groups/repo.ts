import type { Group, Member } from "./group";

/** Thrown by the repo when the @handle is already taken (also on races). */
export class HandleTakenError extends Error {
  constructor(public readonly handle: string) {
    super(`El usuario @${handle} ya está en uso`);
    this.name = "HandleTakenError";
  }
}

export interface GroupsRepo {
  handleExists(handle: string): Promise<boolean>;
  /** Saves the group and its first member atomically. Throws HandleTakenError. */
  create(group: Group, admin: Member): Promise<void>;
  listByUser(userId: string): Promise<Group[]>;
}

export interface Clock {
  now(): Date;
}
