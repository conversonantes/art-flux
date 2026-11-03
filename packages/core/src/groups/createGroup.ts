import { handleBase, handleCandidate } from "./handle";
import { ConflictError } from "../errors";
import { createGroupSchema, type CreateGroupInput, type Group } from "./group";
import { HandleTakenError, type Clock, type GroupsRepo } from "./repo";

const MAX_ATTEMPTS = 50;

/** Groups one person can create. The API is public: without a ceiling anyone could fill it with groups. */
export const MAX_GROUPS_PER_USER = 3;

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
  if ((await deps.groups.countAdminOf(userId)) >= MAX_GROUPS_PER_USER) {
    throw new ConflictError(
      `Puedes crear hasta ${MAX_GROUPS_PER_USER} grupos. Si necesitas otro, escríbenos o pídele a un admin que te invite al suyo.`,
    );
  }
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
