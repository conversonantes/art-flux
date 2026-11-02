import type { Group } from "./group";
import type { GroupsRepo } from "./repo";

export type InitialDestination =
  | { destination: "group"; group: Group }
  | { destination: "choose"; groups: Group[] }
  | { destination: "none" };

/**
 * Where the app sends the user on entry. `lastGroupId` is remembered by the web;
 * if it is still valid it wins over the selector.
 */
export async function resolveInitialGroup(
  deps: { groups: GroupsRepo },
  userId: string,
  lastGroupId?: string,
): Promise<InitialDestination> {
  const groups = await deps.groups.listByUser(userId);
  if (groups.length === 0) return { destination: "none" };
  if (groups.length === 1) return { destination: "group", group: groups[0]! };
  const last = groups.find((g) => g.id === lastGroupId);
  return last ? { destination: "group", group: last } : { destination: "choose", groups };
}
