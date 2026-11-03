import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { FindingFragmentDto } from "./api/api";
import { approachesOfS2, cristinaSessions, fakeAuth, groupSessions, me, seededProject } from "./test/fakes";

type Seeded = ReturnType<typeof seededProject>;

function open(path: string, seeded: Seeded) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={fakeAuth(me)} api={seeded.api} history={history} />);
  return { history, ...seeded };
}

/** The group session S02 ("Explorar el texto"), already held, with its three approaches. */
const heldSessions = groupSessions.map((s) => (s.id === "s-2" ? { ...s, status: "completed" as const } : s));

const manuFragment: FindingFragmentDto = {
  id: "f-manu",
  approachId: "ap-3",
  authorId: "manu",
  kind: "found",
  text: "Armamos un **timeline** de acciones",
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
};

const held = (findings: FindingFragmentDto[] = []) =>
  seededProject("member", { sessions: heldSessions, approaches: approachesOfS2, findings });

describe("HU-12 · hallazgo de un planteamiento", () => {
  it("each approach of a held session links to its finding, at /grupo/s02/p3", async () => {
    const { history } = open("/conversonantes/s02", held());
    const list = await screen.findByRole("list", { name: "Planteamientos" });
    const links = await within(list).findAllByRole("link", { name: /hallazgo/i });
    expect(links).toHaveLength(3);

    await userEvent.click(links[2]!);
    expect(history.location.pathname).toBe("/conversonantes/s02/p3");
    expect(await screen.findByRole("heading", { name: "Análisis de acciones por personaje" })).toBeInTheDocument();
    expect(screen.getByText("conversonantes/S02/P3")).toBeInTheDocument();
  });

  it("shows what others wrote, with their name and marks, and my own box", async () => {
    open("/conversonantes/s02/p3", held([manuFragment]));
    const found = (await screen.findByRole("region", { name: "Qué encontramos" })) as HTMLElement;
    expect(within(found).getByText("timeline").tagName).toBe("STRONG");
    expect(within(found).getByText("Manu")).toBeInTheDocument();
    expect(within(found).getByLabelText("Lo que encontramos")).toHaveValue("");
    expect(screen.getByRole("region", { name: "Qué faltó" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Autores" })).toHaveTextContent("manu");
  });

  it("saves my fragment when I leave the box, as «encontramos» with a new id", async () => {
    const seeded = open("/conversonantes/s02/p3", held());
    const box = await screen.findByLabelText("Lo que encontramos");
    await userEvent.type(box, "Acciones muy claras");
    await userEvent.tab();

    await waitFor(() => expect(seeded.api.saveFinding).toHaveBeenCalledTimes(1));
    const [id, input] = (seeded.api.saveFinding as unknown as { mock: { calls: [string, object][] } }).mock.calls[0]!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(input).toEqual({ approachId: "ap-3", kind: "found", text: "Acciones muy claras" });
    expect(await screen.findByText("✓ guardado")).toBeInTheDocument();
  });

  it("saves by itself while I write, and keeps editing the same fragment", async () => {
    const seeded = open("/conversonantes/s02/p3", held());
    const box = await screen.findByLabelText("Lo que encontramos");
    await userEvent.type(box, "Primero");
    await waitFor(() => expect(seeded.api.saveFinding).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await userEvent.type(box, " y después");
    await userEvent.tab();

    await waitFor(() => expect(seeded.api.saveFinding).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const calls = (seeded.api.saveFinding as unknown as { mock: { calls: [string, { text: string }][] } }).mock.calls;
    expect(calls[1]![0]).toBe(calls[0]![0]); // same id: an edit, not a new fragment
    expect(calls[1]![1].text).toBe("Primero y después");
    expect(seeded.state.findings).toHaveLength(1);
  });

  it("does not save an empty box", async () => {
    const seeded = open("/conversonantes/s02/p3", held());
    const box = await screen.findByLabelText("Lo que faltó");
    await userEvent.type(box, "   ");
    await userEvent.tab();
    expect(seeded.api.saveFinding).not.toHaveBeenCalled();
  });

  it("the toolbar puts bold, list and highlight marks around the selection", async () => {
    open("/conversonantes/s02/p3", held());
    const box = (await screen.findByLabelText("Lo que encontramos")) as HTMLTextAreaElement;
    await userEvent.type(box, "hola mundo");
    box.setSelectionRange(5, 10);
    await userEvent.click(screen.getByRole("button", { name: "Negrita" }));
    expect(box).toHaveValue("hola **mundo**");
    expect(screen.getByLabelText("Así se verá")).toHaveTextContent("hola mundo");

    box.setSelectionRange(0, 4);
    await userEvent.click(screen.getByRole("button", { name: "Resaltar" }));
    expect(box.value.startsWith("==hola== ")).toBe(true);

    fireEvent.change(box, { target: { value: "uno\ndos" } });
    box.setSelectionRange(0, 7);
    await userEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(box).toHaveValue("- uno\n- dos");
  });

  it("I can remove my fragment, and add another one", async () => {
    const mine: FindingFragmentDto = { ...manuFragment, id: "f-mine", authorId: "me", text: "Lo mío" };
    const seeded = open("/conversonantes/s02/p3", held([mine]));
    const box = await screen.findByLabelText("Lo que encontramos");
    expect(box).toHaveValue("Lo mío");

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar otro" }));
    expect(screen.getAllByLabelText("Lo que encontramos")).toHaveLength(2);

    // only the saved box offers Quitar: the new one is still empty
    await userEvent.click(screen.getByRole("button", { name: /quitar lo que encontramos/i }));
    await waitFor(() => expect(seeded.api.removeFinding).toHaveBeenCalledWith("f-mine"));
    await waitFor(() => expect(seeded.state.findings).toHaveLength(0));
  });

  it("waits for the session to be held before opening", async () => {
    open("/conversonantes/s02/p3", seededProject("member", { sessions: groupSessions, approaches: approachesOfS2 }));
    expect(await screen.findByText(/el hallazgo se escribe después de la sesión/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Lo que encontramos")).not.toBeInTheDocument();
  });

  it("works under a project: /grupo/obra/s02/p1, and says so when the approach does not exist", async () => {
    const approaches = [{ id: "k-1", sessionId: "c-1", position: 1, text: "Calentamiento", ownerId: "manu", createdBy: "me", createdAt: "2026-10-20T10:00:00Z" }];
    const seeded = seededProject("member", { sessions: cristinaSessions, approaches });
    const { history } = open("/conversonantes/cristina/s01/p1", seeded);
    expect(await screen.findByRole("heading", { name: "Calentamiento" })).toBeInTheDocument();
    expect(screen.getByText("conversonantes/cristina/S01/P1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(history.location.pathname).toBe("/conversonantes/cristina/s01");
  });

  it("says when the approach is not there", async () => {
    open("/conversonantes/s02/p9", held());
    expect(await screen.findByRole("heading", { name: "No encontramos ese planteamiento" })).toBeInTheDocument();
  });

  it("«A tu cargo» sends me to the finding of my pending approach of a held session", async () => {
    const { history } = open("/conversonantes", held());
    const mine = (await screen.findByRole("heading", { name: "A tu cargo" })).closest("section")!;
    const link = await within(mine).findByRole("link", { name: /análisis de acciones por personaje/i });
    expect(link).toHaveTextContent("P3 · falta el hallazgo");
    await userEvent.click(link);
    expect(history.location.pathname).toBe("/conversonantes/s02/p3");
  });
});
