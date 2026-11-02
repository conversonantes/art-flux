import { describe, expect, it } from "vitest";
import {
  GruposRepoMemoria,
  UsuarioEnUsoError,
  baseDeUsuario,
  candidatoDeUsuario,
  crearGrupo,
  resolverGrupoInicial,
  usuarioSchema,
  type Grupo,
  type Miembro,
} from "./index";

const reloj = { ahora: () => new Date("2026-11-02T10:00:00Z") };
const montar = () => {
  const grupos = new GruposRepoMemoria();
  return { grupos, deps: { grupos, reloj } };
};

describe("crearGrupo", () => {
  it("deja a quien lo crea como admin", async () => {
    const { grupos, deps } = montar();
    const g = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Conversonantes" });
    expect(grupos.miembros).toEqual([{ grupoId: "g1", usuarioId: "u1", rol: "admin" }]);
    expect(g.creadoEn).toEqual(reloj.ahora());
  });

  it("exige nombre; la ciudad es opcional", async () => {
    const { deps } = montar();
    await expect(crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "   " })).rejects.toThrow();
    const g = await crearGrupo(deps, { id: "g2", usuarioId: "u1", nombre: "Sin ciudad", ciudad: " " });
    expect(g.ciudad).toBeUndefined();
    const h = await crearGrupo(deps, { id: "g3", usuarioId: "u1", nombre: "Con ciudad", ciudad: " Medellín " });
    expect(h.ciudad).toBe("Medellín");
  });

  it("genera el @usuario desde el nombre", async () => {
    const { deps } = montar();
    const g = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "  Conversonantes Teatro " });
    expect(g.usuario).toBe("conversonantes-teatro");
  });

  it("permite nombres repetidos con @usuario distinto", async () => {
    const { deps } = montar();
    const a = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Conversonantes" });
    const b = await crearGrupo(deps, { id: "g2", usuarioId: "u2", nombre: "Conversonantes" });
    const c = await crearGrupo(deps, { id: "g3", usuarioId: "u3", nombre: "conversonantes" });
    expect([a.usuario, b.usuario, c.usuario]).toEqual([
      "conversonantes",
      "conversonantes-2",
      "conversonantes-3",
    ]);
    expect(b.nombre).toBe(a.nombre);
  });

  it("reintenta si otro toma el usuario entre la consulta y el guardado", async () => {
    const { grupos, deps } = montar();
    const crearOriginal = grupos.crear.bind(grupos);
    let primera = true;
    grupos.crear = async (g: Grupo, m: Miembro) => {
      if (primera) {
        primera = false;
        throw new UsuarioEnUsoError(g.usuario);
      }
      return crearOriginal(g, m);
    };
    const g = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Carrera" });
    expect(g.usuario).toBe("carrera-2");
  });

  it("no usa usuarios reservados", async () => {
    const { deps } = montar();
    const g = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Admin" });
    expect(g.usuario).toBe("admin-2");
  });
});

describe("@usuario", () => {
  it("normaliza tildes, símbolos y espacios", () => {
    expect(baseDeUsuario("Compañía Ñandú & Co.")).toBe("compania-nandu-co");
  });
  it("cae a grupo si no queda nada útil", () => {
    expect(baseDeUsuario("¡¡!!")).toBe("grupo");
    expect(baseDeUsuario("ab")).toBe("grupo");
  });
  it("respeta el largo máximo al añadir sufijo", () => {
    const base = baseDeUsuario("a".repeat(60));
    expect(candidatoDeUsuario(base, 12).length).toBeLessThanOrEqual(30);
  });
  it("valida el formato para personalizarlo luego", () => {
    expect(usuarioSchema.safeParse("mi-grupo").success).toBe(true);
    expect(usuarioSchema.safeParse("Mi Grupo").success).toBe(false);
    expect(usuarioSchema.safeParse("-mi").success).toBe(false);
    expect(usuarioSchema.safeParse("api").success).toBe(false);
  });
});

describe("resolverGrupoInicial", () => {
  it("sin grupo: ofrece crear o explorar", async () => {
    const { deps } = montar();
    expect(await resolverGrupoInicial(deps, "u1")).toEqual({ destino: "sin-grupo" });
  });

  it("un grupo: lleva directo", async () => {
    const { deps } = montar();
    const g = await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Uno" });
    expect(await resolverGrupoInicial(deps, "u1")).toEqual({ destino: "grupo", grupo: g });
  });

  it("varios: ofrece elegir, o va al último recordado", async () => {
    const { deps } = montar();
    await crearGrupo(deps, { id: "g1", usuarioId: "u1", nombre: "Uno" });
    const g2 = await crearGrupo(deps, { id: "g2", usuarioId: "u1", nombre: "Dos" });
    const r = await resolverGrupoInicial(deps, "u1");
    expect(r.destino).toBe("elegir");
    expect(await resolverGrupoInicial(deps, "u1", "g2")).toEqual({ destino: "grupo", grupo: g2 });
    expect((await resolverGrupoInicial(deps, "u1", "inexistente")).destino).toBe("elegir");
  });
});
