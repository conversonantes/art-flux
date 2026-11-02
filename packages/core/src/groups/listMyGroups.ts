import type { Group } from "./group";
import type { GroupsRepo } from "./repo";

/** Every group the user belongs to, for the header's group selector. */
export function listMyGroups(deps: { groups: GroupsRepo }, userId: string): Promise<Group[]> {
  return deps.groups.listByUser(userId);
}
