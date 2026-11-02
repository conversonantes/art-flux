import { z } from "zod";
import { usuarioSchema } from "./usuario";

export const crearGrupoSchema = z.object({
  nombre: z.string().trim().min(1, "El grupo necesita un nombre").max(80),
  ciudad: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((c) => (c ? c : undefined)),
});
export type CrearGrupoEntrada = z.input<typeof crearGrupoSchema>;

export const grupoSchema = z.object({
  id: z.string().min(1),
  usuario: usuarioSchema,
  nombre: z.string(),
  ciudad: z.string().optional(),
  creadoEn: z.date(),
});
export type Grupo = z.infer<typeof grupoSchema>;

export type RolMiembro = "admin" | "miembro";

export interface Miembro {
  grupoId: string;
  usuarioId: string;
  rol: RolMiembro;
}
