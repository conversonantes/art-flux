import { z } from "zod";
import { handleSchema } from "./handle";

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "El grupo necesita un nombre").max(80),
  city: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((c) => (c ? c : undefined)),
});
export type CreateGroupInput = z.input<typeof createGroupSchema>;

export const groupSchema = z.object({
  id: z.string().min(1),
  handle: handleSchema,
  name: z.string(),
  city: z.string().optional(),
  createdAt: z.date(),
});
export type Group = z.infer<typeof groupSchema>;

export type MemberRole = "admin" | "member";

/** A member as shown in lists: who they are and what they can do in the group. */
export interface GroupMember {
  userId: string;
  role: MemberRole;
  /** From their profile; may be missing if they never set or shared a name. */
  displayName?: string;
}

export interface Member {
  groupId: string;
  userId: string;
  role: MemberRole;
}
