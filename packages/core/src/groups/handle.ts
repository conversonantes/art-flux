import { z } from "zod";

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
  "productions",
  "sessions",
  "exercises",
  "settings",
]);

const FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Format of a group's @handle; also used when customizing it later. */
export const handleSchema = z
  .string()
  .min(HANDLE_MIN)
  .max(HANDLE_MAX)
  .regex(FORMAT, "Solo minúsculas, números y guiones")
  .refine((h) => !RESERVED_HANDLES.has(h), "Ese usuario está reservado");

/** Turns a name into a valid handle base (uniqueness not guaranteed). */
export function handleBase(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, "");
  return clean.length >= HANDLE_MIN ? clean : "group";
}

/** n-th candidate: base, base-2, base-3… within the max length. */
export function handleCandidate(base: string, attempt: number): string {
  const candidate =
    attempt <= 1
      ? base
      : `${base.slice(0, HANDLE_MAX - String(attempt).length - 1).replace(/-+$/g, "")}-${attempt}`;
  return RESERVED_HANDLES.has(candidate) ? handleCandidate(base, attempt + 1) : candidate;
}
