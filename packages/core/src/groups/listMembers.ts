import { ForbiddenError } from "../errors";
import type { GroupMember } from "./group";
import type { GroupsRepo } from "./repo";

/** Members of a group. Only people inside the group can see who else is in it. */
export async function listMembers(
  deps: { groups: GroupsRepo },
  input: { groupId: string; userId: string },
): Promise<GroupMember[]> {
  if ((await deps.groups.getMemberRole(input.groupId, input.userId)) === null) {
    throw new ForbiddenError();
  }
  return deps.groups.listMembers(input.groupId);
}
