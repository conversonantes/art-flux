import type { Grupo } from "./grupo";
import type { GruposRepo } from "./repo";

export type DestinoInicial =
  | { destino: "grupo"; grupo: Grupo }
  | { destino: "elegir"; grupos: Grupo[] }
  | { destino: "sin-grupo" };

/**
 * A dónde lleva la app al entrar. `ultimoGrupoId` lo recuerda la web;
 * si sigue siendo válido se prefiere sobre el selector.
 */
export async function resolverGrupoInicial(
  deps: { grupos: GruposRepo },
  usuarioId: string,
  ultimoGrupoId?: string,
): Promise<DestinoInicial> {
  const grupos = await deps.grupos.delUsuario(usuarioId);
  if (grupos.length === 0) return { destino: "sin-grupo" };
  if (grupos.length === 1) return { destino: "grupo", grupo: grupos[0]! };
  const ultimo = grupos.find((g) => g.id === ultimoGrupoId);
  return ultimo ? { destino: "grupo", grupo: ultimo } : { destino: "elegir", grupos };
}
