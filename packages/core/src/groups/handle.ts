import { z } from "zod";
import { SLUG_FORMAT, slugBase, slugCandidate } from "../slug";

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Words that collide with app routes. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "explorar",
  "entrar",
  "invitar",
  "grupos",
  "grupo",
  "obras",
  "sesiones",
  "ejercicios",
  "catalogo",
  "ajustes",
  "explore",
  "login",
  "groups",
  "group",
  "project",
  "projects",
  "sessions",
  "exercises",
  "settings",
]);

/** Format of a group's @handle; also used when customizing it later. */
export const handleSchema = z
  .string()
  .min(HANDLE_MIN)
  .max(HANDLE_MAX)
  .regex(SLUG_FORMAT, "Solo minúsculas, números y guiones")
  .refine((h) => !RESERVED_HANDLES.has(h), "Ese usuario está reservado");

/** Turns a name into a valid handle base (uniqueness not guaranteed). */
export function handleBase(name: string): string {
  return slugBase(name, { fallback: "group", min: HANDLE_MIN, max: HANDLE_MAX });
}

/** n-th candidate: base, base-2, base-3… within the max length. */
export function handleCandidate(base: string, attempt: number): string {
  return slugCandidate(base, attempt, { max: HANDLE_MAX, reserved: RESERVED_HANDLES });
}
