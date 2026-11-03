import { z } from "zod";

const text = z.string().trim().min(1, "El planteamiento necesita un texto").max(500, "El planteamiento es muy largo");

export const addApproachSchema = z.object({ text });
export const updateApproachSchema = z.object({ text: text.optional() });

/**
 * A planteamiento: one thing the session will work on, and the group member who brings it.
 * Exercises from the catalog will attach to it in a later cut; for now they are named in the text.
 */
export interface Approach {
  id: string;
  sessionId: string;
  /** 1, 2, 3… within the session. Screens show P1, P2… by list order, so gaps never show. */
  position: number;
  text: string;
  /** "¿Quién lo trae?": a member of the group. */
  ownerId: string;
  createdBy: string;
  createdAt: Date;
}

export interface ApproachPatch {
  text?: string;
  ownerId?: string;
}
