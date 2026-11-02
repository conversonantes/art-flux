import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { fakeAuth, me, seededProject } from "./test/fakes";

type Seeded = ReturnType<typeof seededProject>;

function open(path: string, seeded: Seeded = seededProject()) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={fakeAuth(me)} api={seeded.api} history={history} />);
  return { history, ...seeded };
}

describe("HU-05 · obras", () => {
  it("lists the group projects and lets an admin start a new one", async () => {
    open("/conversonantes");
    expect(await screen.findByRole("link", { name: /cristina/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+ nueva obra/i })).toBeInTheDocument();
  });

  it("hides the creation option from plain members", async () => {
    open("/conversonantes", seededProject("member"));
    await screen.findByRole("link", { name: /cristina/i });
    expect(screen.queryByRole("link", { name: /\+ nueva obra/i })).not.toBeInTheDocument();
  });

  it("creates a project with status, themes and visibility agreement, then opens it", async () => {
    const seeded = seededProject();
    seeded.state.projects.length = 0;
    open("/conversonantes/obras/nueva", seeded);

    await userEvent.type(await screen.findByLabelText("Título"), "Mar adentro");
    await userEvent.click(screen.getByRole("button", { name: "En montaje" }));
    await userEvent.type(screen.getByLabelText("Agregar tema"), "#Memoria{Enter}duelo familiar{Enter}");
    await userEvent.type(screen.getByLabelText(/acuerdo de visibilidad/i), "Solo fotos");
    await userEvent.click(screen.getByRole("button", { name: "Crear obra" }));

    expect(await screen.findByRole("heading", { name: "Mar adentro" })).toBeInTheDocument();
    expect(seeded.api.createProject).toHaveBeenCalledWith("g-conv", {
      title: "Mar adentro",
      status: "staging",
      themes: ["memoria", "duelo familiar"],
      visibilityAgreement: "Solo fotos",
    });
    expect(screen.getByText("en montaje")).toBeInTheDocument();
    expect(screen.getByText("#memoria")).toBeInTheDocument();
    expect(screen.getByText("Solo fotos")).toBeInTheDocument();
  });

  it("does not submit without a title and lets you remove a theme", async () => {
    open("/conversonantes/obras/nueva");
    expect(await screen.findByRole("button", { name: "Crear obra" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Agregar tema"), "tema{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /quitar tema tema/i }));
    expect(screen.queryByText("#tema")).not.toBeInTheDocument();
  });

  it("only admins reach the creation form", async () => {
    open("/conversonantes/obras/nueva", seededProject("member"));
    expect(await screen.findByRole("heading", { name: "Solo los admins crean obras" })).toBeInTheDocument();
  });

  it("shows the project page with status, themes, team and agreement", async () => {
    const { history } = open("/conversonantes/cristina");
    expect(await screen.findByRole("heading", { name: "Cristina" })).toBeInTheDocument();
    expect(screen.getByText("en montaje")).toBeInTheDocument();
    expect(screen.getByText("⚿ solo el grupo")).toBeInTheDocument();
    expect(screen.getByText("#duelo")).toBeInTheDocument();
    expect(await screen.findByText("owner · director")).toBeInTheDocument();
    expect(screen.getByText("Manu")).toBeInTheDocument();
    expect(screen.getByText("Podemos mostrar fotos, no audios.")).toBeInTheDocument();
    expect(history.location.pathname).toBe("/conversonantes/cristina");
  });

  it("edits the project, keeping its address", async () => {
    const seeded = seededProject();
    const { history } = open("/conversonantes/cristina/editar", seeded);
    const title = (await screen.findByLabelText("Título")) as HTMLInputElement;
    expect(title.value).toBe("Cristina");
    expect(screen.getByRole("button", { name: "En montaje" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.clear(title);
    await userEvent.type(title, "Cristina (v2)");
    await userEvent.click(screen.getByRole("button", { name: "En temporada" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("heading", { name: "Cristina (v2)" })).toBeInTheDocument();
    expect(seeded.api.updateProject).toHaveBeenCalledWith(
      "p-cristina",
      expect.objectContaining({ title: "Cristina (v2)", status: "running" }),
    );
    expect(history.location.pathname).toBe("/conversonantes/cristina");
  });

  it("says so when the project does not exist", async () => {
    open("/conversonantes/no-existe");
    expect(await screen.findByRole("heading", { name: "No encontramos esa obra" })).toBeInTheDocument();
  });

  it("does not offer editing to plain members", async () => {
    open("/conversonantes/cristina", seededProject("member"));
    await screen.findByRole("heading", { name: "Cristina" });
    expect(screen.queryByRole("link", { name: "Editar obra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  });
});

describe("HU-06 · equipo", () => {
  it("toggles several roles per person", async () => {
    const seeded = seededProject();
    open("/conversonantes/cristina/equipo", seeded);
    const manu = (await screen.findByText("Manu")).closest("li")!;
    const chip = (name: string) => within(manu).getByRole("button", { name });

    expect(chip("Actor")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip("Director"));
    await waitFor(() => expect(seeded.api.setRoles).toHaveBeenCalledWith("p-cristina", "manu", ["actor", "director"]));
    await waitFor(() => expect(chip("Director")).toHaveAttribute("aria-pressed", "true"));

    await userEvent.click(chip("Actor"));
    await waitFor(() => expect(seeded.api.setRoles).toHaveBeenLastCalledWith("p-cristina", "manu", ["director"]));
  });

  it("adds someone from the group and removes someone from the team", async () => {
    const seeded = seededProject();
    open("/conversonantes/cristina/equipo", seeded);

    await userEvent.click(await screen.findByRole("button", { name: "Agregar a Kokoro" }));
    await waitFor(() => expect(seeded.api.setRoles).toHaveBeenCalledWith("p-cristina", "kokoro", []));
    expect(await screen.findByText("Ya están todas las personas del grupo.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Quitar a Manu del equipo" }));
    await waitFor(() => expect(seeded.api.removeFromTeam).toHaveBeenCalledWith("p-cristina", "manu"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Agregar a Manu" })).toBeInTheDocument());
  });

  it("explains that roles are artistic", async () => {
    open("/conversonantes/cristina/equipo");
    expect(await screen.findByText(/no cambian lo que cada uno puede hacer/i)).toBeInTheDocument();
  });

  it("blocks plain members from editing the team", async () => {
    open("/conversonantes/cristina/equipo", seededProject("member"));
    expect(await screen.findByRole("heading", { name: "Solo los admins editan el equipo" })).toBeInTheDocument();
  });
});
