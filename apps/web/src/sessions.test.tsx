import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { sessionLabel, todayIso } from "./sessionFormat";
import { approachesOfS2, cristinaSessions, fakeAuth, groupSessions, me, seededProject } from "./test/fakes";

type Seeded = ReturnType<typeof seededProject>;

function open(path: string, seeded: Seeded) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={fakeAuth(me)} api={seeded.api} history={history} />);
  return { history, ...seeded };
}

const withSessions = (role: "admin" | "member" = "admin") =>
  seededProject(role, { sessions: [...groupSessions, ...cristinaSessions] });

describe("HU-07 · nueva sesión", () => {
  it("previews the next group number and creates a session with a past date", async () => {
    const seeded = withSessions();
    const { history } = open("/conversonantes/sesiones/nueva", seeded);

    expect(await screen.findByLabelText("Número 3")).toHaveTextContent("S03");
    await userEvent.click(screen.getByRole("radio", { name: "Otra fecha" }));
    fireEvent.change(screen.getByLabelText("Elegir fecha"), { target: { value: "2020-01-05" } });
    expect(screen.getByText("pasada")).toBeInTheDocument();
    expect(screen.getByText(/sirve para registrar una sesión que ya ocurrió/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Lugar"), "Teatro");
    await userEvent.type(screen.getByLabelText("Objetivo"), "Ensayo general");
    await userEvent.click(screen.getByRole("button", { name: "Crear y agregar planteamientos" }));

    expect(await screen.findByRole("heading", { name: "Ensayo general" })).toBeInTheDocument();
    expect(seeded.api.createSession).toHaveBeenCalledWith("g-conv", {
      date: "2020-01-05",
      place: "Teatro",
      objective: "Ensayo general",
    });
    expect(history.location.pathname).toBe("/conversonantes/s03");
    expect(screen.getByText("planeada")).toBeInTheDocument();
  });

  it("uses today by default and sends no date when pending", async () => {
    const seeded = withSessions();
    open("/conversonantes/sesiones/nueva", seeded);
    expect(await screen.findByRole("radio", { name: "Hoy" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Crear y agregar planteamientos" }));
    await screen.findByText(/sesión #03/i);
    expect(seeded.api.createSession).toHaveBeenLastCalledWith("g-conv", { date: todayIso() });
  });

  it("allows a pending date", async () => {
    const seeded = withSessions();
    open("/conversonantes/sesiones/nueva", seeded);
    await userEvent.click(await screen.findByRole("radio", { name: "Pendiente" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear y agregar planteamientos" }));
    await screen.findByText("fecha pendiente");
    expect(seeded.api.createSession).toHaveBeenLastCalledWith("g-conv", { date: null });
  });

  it("will not submit 'otra fecha' until a date is chosen", async () => {
    open("/conversonantes/sesiones/nueva", withSessions());
    await userEvent.click(await screen.findByRole("radio", { name: "Otra fecha" }));
    expect(screen.getByRole("button", { name: "Crear y agregar planteamientos" })).toBeDisabled();
  });

  it("starts from a project, numbers inside it and lets you move it back to the group", async () => {
    const seeded = withSessions();
    const { history } = open("/conversonantes/cristina/sesiones/nueva", seeded);

    expect(await screen.findByLabelText("Pertenece a")).toHaveValue("cristina");
    expect(await screen.findByLabelText("Número 3")).toBeInTheDocument(); // Cristina has S01 and S02

    await userEvent.selectOptions(screen.getByLabelText("Pertenece a"), "");
    expect(await screen.findByLabelText("Número 3")).toBeInTheDocument(); // the group also has two

    await userEvent.selectOptions(screen.getByLabelText("Pertenece a"), "cristina");
    await userEvent.click(screen.getByRole("button", { name: "Crear y agregar planteamientos" }));
    await screen.findByText(/sesión #03/i);
    expect(seeded.api.createSession).toHaveBeenCalledWith("g-conv", expect.objectContaining({ projectId: "p-cristina" }));
    expect(history.location.pathname).toBe("/conversonantes/cristina/s03");
  });

  it("is open to plain members", async () => {
    open("/conversonantes/sesiones/nueva", withSessions("member"));
    expect(await screen.findByRole("heading", { name: "Nueva sesión" })).toBeInTheDocument();
  });
});

describe("sessions on screen", () => {
  it("shows a timeline of the project's sessions with its origin", async () => {
    const seeded = withSessions();
    seeded.state.projects[0]!.originSessionId = "c-1";
    open("/conversonantes/cristina", seeded);

    expect(await screen.findByText(/S02 · planeada · 10 nov/i)).toBeInTheDocument();
    expect(screen.getByText(/S01 · realizada/i)).toBeInTheDocument();
    expect(screen.getByText("origen de la obra")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+ nueva/i })).toBeInTheDocument();
  });

  it("opens a project session by its address", async () => {
    const seeded = withSessions();
    const { history } = open("/conversonantes/cristina", seeded);
    await userEvent.click(await screen.findByRole("link", { name: /analizar el texto y seguir ahondando/i }));
    expect(await screen.findByRole("heading", { name: "Analizar el texto y seguir ahondando" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/conversonantes/cristina/s02");
    expect(screen.getByText(/U\. Nacional/)).toBeInTheDocument();
  });

  it("serves group sessions at /<group>/sNN without confusing them with projects", async () => {
    open("/conversonantes/s02", withSessions());
    expect(await screen.findByRole("heading", { name: "Explorar el texto" })).toBeInTheDocument();
    expect(screen.getByText("fecha pendiente")).toBeInTheDocument();
  });

  it("says when a session does not exist", async () => {
    open("/conversonantes/s99", withSessions());
    expect(await screen.findByRole("heading", { name: "No encontramos esa sesión" })).toBeInTheDocument();
  });

  it("lists the group's own sessions on the group page", async () => {
    open("/conversonantes", withSessions());
    expect(await screen.findByRole("heading", { name: "Sesiones del grupo" })).toBeInTheDocument();
    expect(await screen.findAllByRole("link", { name: /reencuentro/i })).toHaveLength(2); // upcoming + the group list
    expect(screen.getByRole("link", { name: /\+ nueva sesión/i })).toBeInTheDocument();
  });
});

describe("HU-05 · obra que nace de una sesión", () => {
  it("offers group sessions as origin; the chosen one joins the project as S01", async () => {
    const seeded = seededProject("admin", { sessions: groupSessions });
    seeded.state.projects.length = 0;
    open("/conversonantes/obras/nueva", seeded);

    await userEvent.type(await screen.findByLabelText("Título"), "Cristina");
    const origin = await screen.findByRole("radio", { name: new RegExp(`${sessionLabel(1)} · Reencuentro`) });
    await userEvent.click(origin);
    expect(origin).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/se vuelve el origen/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Crear obra" }));
    expect(await screen.findByRole("heading", { name: "Cristina" })).toBeInTheDocument();
    expect(seeded.api.createProject).toHaveBeenCalledWith(
      "g-conv",
      expect.objectContaining({ title: "Cristina", originSessionId: "s-1" }),
    );
    expect(await screen.findByText("origen de la obra")).toBeInTheDocument();
    expect(screen.getByText(/S01 · planeada/i)).toBeInTheDocument();
  });

  it("creates a plain project when no origin is chosen, and hides the option without group sessions", async () => {
    const seeded = seededProject();
    seeded.state.projects.length = 0;
    open("/conversonantes/obras/nueva", seeded);
    await userEvent.type(await screen.findByLabelText("Título"), "Sola");
    expect(screen.queryByRole("radiogroup", { name: "Sesión de origen" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Crear obra" }));
    await screen.findByRole("heading", { name: "Sola" });
    expect(seeded.api.createProject).toHaveBeenCalledWith(
      "g-conv",
      expect.not.objectContaining({ originSessionId: expect.anything() }),
    );
  });
});

describe("HU-09 · inicio «lo mío»", () => {
  it("greets by name and lists my approaches and the upcoming sessions, each leading to its screen", async () => {
    const seeded = seededProject("member", {
      sessions: [...groupSessions, ...cristinaSessions],
      approaches: approachesOfS2,
    });
    const { history } = open("/conversonantes", seeded);

    expect(await screen.findByRole("heading", { name: "Hola, Santi." })).toBeInTheDocument();
    const mine = await screen.findByRole("heading", { name: "A tu cargo" });
    const link = await within(mine.closest("section")!).findByRole("link", { name: /análisis de acciones por personaje/i });
    expect(link).toHaveTextContent("S02");

    const upcoming = screen.getByRole("heading", { name: "Próximas sesiones" }).closest("section")!;
    expect(within(upcoming).getByText(/3 planteamientos/)).toBeInTheDocument();
    await userEvent.click(within(upcoming).getByRole("link", { name: /analizar el texto/i }));
    expect(history.location.pathname).toBe("/conversonantes/cristina/s02"); // a project session
  });

  it("lists held sessions under «Falta registrar»", async () => {
    open("/conversonantes", seededProject("member", { sessions: cristinaSessions }));
    const record = (await screen.findByRole("heading", { name: "Falta registrar" })).closest("section")!;
    expect(within(record).getByText("realizada")).toBeInTheDocument();
    expect(within(record).getByRole("link", { name: /reencuentro/i })).toBeInTheDocument();
  });

  it("says so when there is nothing pending", async () => {
    open("/conversonantes", seededProject("member"));
    expect(await screen.findByText(/nada pendiente por ahora/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Falta registrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A tu cargo" })).not.toBeInTheDocument();
  });
});
