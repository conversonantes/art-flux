import type { Grupo, Miembro } from "./grupo";
import { UsuarioEnUsoError, type GruposRepo } from "./repo";

export class GruposRepoMemoria implements GruposRepo {
  readonly grupos: Grupo[] = [];
  readonly miembros: Miembro[] = [];

  async existeUsuario(usuario: string): Promise<boolean> {
    return this.grupos.some((g) => g.usuario === usuario);
  }

  async crear(grupo: Grupo, admin: Miembro): Promise<void> {
    if (this.grupos.some((g) => g.usuario === grupo.usuario)) {
      throw new UsuarioEnUsoError(grupo.usuario);
    }
    this.grupos.push(grupo);
    this.miembros.push(admin);
  }

  async delUsuario(usuarioId: string): Promise<Grupo[]> {
    const ids = new Set(
      this.miembros.filter((m) => m.usuarioId === usuarioId).map((m) => m.grupoId),
    );
    return this.grupos.filter((g) => ids.has(g.id));
  }
}
