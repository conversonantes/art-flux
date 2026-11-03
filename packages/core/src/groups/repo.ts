import type { Group, GroupMember, Member, MemberRole } from "./group";

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
  /** How many groups the user administers (the ones they created: creating makes you its admin). */
  countAdminOf(userId: string): Promise<number>;
  getById(groupId: string): Promise<Group | null>;
  /** Role of the user in the group, or null if not a member. */
  getMemberRole(groupId: string, userId: string): Promise<MemberRole | null>;
  /** Members of the group, oldest first. */
  listMembers(groupId: string): Promise<GroupMember[]>;
}

export interface Clock {
  now(): Date;
}
