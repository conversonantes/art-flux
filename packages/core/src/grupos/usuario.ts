import { z } from "zod";

export const USUARIO_MIN = 3;
export const USUARIO_MAX = 30;

/** Palabras que chocan con rutas de la app. */
export const USUARIOS_RESERVADOS: ReadonlySet<string> = new Set([
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
]);

const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Formato del @usuario de un grupo; sirve también al personalizarlo. */
export const usuarioSchema = z
  .string()
  .min(USUARIO_MIN)
  .max(USUARIO_MAX)
  .regex(FORMATO, "Solo minúsculas, números y guiones")
  .refine((u) => !USUARIOS_RESERVADOS.has(u), "Usuario reservado");

/** Convierte un nombre en una base de usuario válida (sin garantizar unicidad). */
export function baseDeUsuario(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USUARIO_MAX)
    .replace(/-+$/g, "");
  return limpio.length >= USUARIO_MIN ? limpio : "grupo";
}

/** Candidato n-ésimo: base, base-2, base-3… respetando el largo máximo. */
export function candidatoDeUsuario(base: string, intento: number): string {
  const candidato =
    intento <= 1
      ? base
      : `${base.slice(0, USUARIO_MAX - String(intento).length - 1).replace(/-+$/g, "")}-${intento}`;
  return USUARIOS_RESERVADOS.has(candidato) ? candidatoDeUsuario(base, intento + 1) : candidato;
}
