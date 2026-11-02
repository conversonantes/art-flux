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

export interface Member {
  groupId: string;
  userId: string;
  role: MemberRole;
}
