import { z } from "zod";

export const SESSION_STATUSES = ["planned", "completed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** A calendar date as "YYYY-MM-DD" (no time zone: sessions happen on a day, not at an instant). */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  }, "Fecha no válida");

const place = z.string().trim().max(120, "El lugar es muy largo");
const objective = z.string().trim().max(1000, "El objetivo es muy largo");

/** "Hoy", "Otra fecha" and "Pendiente" all arrive as a date or nothing; past dates are valid. */
export const createSessionSchema = z.object({
  date: dateSchema.nullish().transform((d) => d ?? undefined),
  place: place.nullish().transform((p) => p || undefined),
  objective: objective.nullish().transform((o) => o || undefined),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

/** Fields left out stay as they are; null or an empty text clears the field. */
export const updateSessionSchema = z.object({
  date: dateSchema.nullable().optional(),
  place: place.nullable().optional().transform((p) => (p === undefined ? undefined : p || null)),
  objective: objective.nullable().optional().transform((o) => (o === undefined ? undefined : o || null)),
});
export type UpdateSessionInput = z.input<typeof updateSessionSchema>;

export interface Session {
  id: string;
  groupId: string;
  /** Set when the session belongs to a project (obra); absent for group sessions. */
  projectId?: string;
  /** 1, 2, 3… inside the project, or inside the group when there is no project. */
  number: number;
  date?: string;
  place?: string;
  objective?: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: Date;
}

export interface SessionPatch {
  /** null clears it. */
  date?: string | null;
  place?: string | null;
  objective?: string | null;
}

/** Where a session list or number lives: a project, or the group itself. */
export type SessionScope = { projectId: string } | { projectId: null };
