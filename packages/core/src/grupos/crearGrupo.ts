import { baseDeUsuario, candidatoDeUsuario } from "./usuario";
import { crearGrupoSchema, type CrearGrupoEntrada, type Grupo } from "./grupo";
import { UsuarioEnUsoError, type GruposRepo, type Reloj } from "./repo";

const MAX_INTENTOS = 50;

export interface CrearGrupoDeps {
  grupos: GruposRepo;
  reloj: Reloj;
}

export async function crearGrupo(
  deps: CrearGrupoDeps,
  entrada: { id: string; usuarioId: string } & CrearGrupoEntrada,
): Promise<Grupo> {
  const { id, usuarioId, ...datos } = entrada;
  const { nombre, ciudad } = crearGrupoSchema.parse(datos);
  const base = baseDeUsuario(nombre);

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const usuario = candidatoDeUsuario(base, intento);
    if (await deps.grupos.existeUsuario(usuario)) continue;

    const grupo: Grupo = {
      id,
      usuario,
      nombre,
      ...(ciudad ? { ciudad } : {}),
      creadoEn: deps.reloj.ahora(),
    };
    try {
      await deps.grupos.crear(grupo, { grupoId: id, usuarioId, rol: "admin" });
      return grupo;
    } catch (e) {
      if (e instanceof UsuarioEnUsoError) continue; // carrera: probar el siguiente
      throw e;
    }
  }
  throw new Error("No se pudo generar un usuario único para el grupo");
}
