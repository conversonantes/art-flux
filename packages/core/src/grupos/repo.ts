import type { Grupo, Miembro } from "./grupo";

/** Lo lanza el repositorio si el @usuario ya está tomado (también ante carreras). */
export class UsuarioEnUsoError extends Error {
  constructor(public readonly usuario: string) {
    super(`El usuario @${usuario} ya está en uso`);
    this.name = "UsuarioEnUsoError";
  }
}

export interface GruposRepo {
  existeUsuario(usuario: string): Promise<boolean>;
  /** Guarda grupo y su primer miembro de forma atómica. Lanza UsuarioEnUsoError. */
  crear(grupo: Grupo, admin: Miembro): Promise<void>;
  delUsuario(usuarioId: string): Promise<Grupo[]>;
}

export interface Reloj {
  ahora(): Date;
}
