import { handleBase, handleCandidate } from "./handle";
import { createGroupSchema, type CreateGroupInput, type Group } from "./group";
import { HandleTakenError, type Clock, type GroupsRepo } from "./repo";

const MAX_ATTEMPTS = 50;

export interface CreateGroupDeps {
  groups: GroupsRepo;
  clock: Clock;
}

export async function createGroup(
  deps: CreateGroupDeps,
  input: { id: string; userId: string } & CreateGroupInput,
): Promise<Group> {
  const { id, userId, ...data } = input;
  const { name, city } = createGroupSchema.parse(data);
  const base = handleBase(name);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const handle = handleCandidate(base, attempt);
    if (await deps.groups.handleExists(handle)) continue;

    const group: Group = {
      id,
      handle,
      name,
      ...(city ? { city } : {}),
      createdAt: deps.clock.now(),
    };
    try {
      await deps.groups.create(group, { groupId: id, userId, role: "admin" });
      return group;
    } catch (e) {
      if (e instanceof HandleTakenError) continue; // race: try the next one
      throw e;
    }
  }
  throw new Error("No se pudo generar un usuario único para el grupo");
}
