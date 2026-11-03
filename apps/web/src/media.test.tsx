import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ApproachDto, MediaDto } from "./api/api";
import { cristinaSessions, fakeAuth, groupSessions, me, seededProject } from "./test/fakes";

type Seeded = ReturnType<typeof seededProject>;

function open(path: string, seeded: Seeded) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={fakeAuth(me)} api={seeded.api} history={history} />);
  return { history, ...seeded };
}

/** Session S02 of Cristina (planned) with three approaches. */
const approaches: ApproachDto[] = [
  { id: "k-1", sessionId: "c-2", position: 1, text: "Calentamiento", ownerId: "manu", createdBy: "me", createdAt: "2026-11-01T10:00:00Z" },
  { id: "k-2", sessionId: "c-2", position: 2, text: "Improvisación", ownerId: "kokoro", createdBy: "me", createdAt: "2026-11-01T10:01:00Z" },
];

const photoByManu: MediaDto = {
  id: "m-1",
  groupId: "g-conv",
  projectId: "p-cristina",
  sessionId: "c-2",
  approachId: "k-1",
  kind: "photo",
  title: "Parada de cabeza",
  mime: "image/jpeg",
  sizeBytes: 4000,
  status: "uploaded",
  createdBy: "manu",
  createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
};

const REGISTER = "/conversonantes/registrar?obra=p-cristina&sesion=c-2";
const project = (media: MediaDto[] = [], role: "admin" | "member" = "member") =>
  seededProject(role, { sessions: cristinaSessions, approaches, media });

const upload = async (label: string, file: File) =>
  fireEvent.change(await screen.findByLabelText(label), { target: { files: [file] } });

afterEach(() => vi.unstubAllGlobals());

describe("HU-13 · material en la sesión", () => {
  it("the session lists its material (who, when) and leads to Registrar with the destination", async () => {
    const { history } = open("/conversonantes/cristina/s02", project([photoByManu]));
    const list = await screen.findByRole("list", { name: "Material de la sesión" });
    expect(within(list).getByText("Parada de cabeza")).toBeInTheDocument();
    expect(within(list).getByText(/foto · Manu · hace 3 min/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("link", { name: "+ Registrar" })[0]!);
    expect(history.location.pathname).toBe("/conversonantes/registrar");
    expect(history.location.search).toContain("p-cristina");
    expect(history.location.search).toContain("c-2");
  });

  it("a group session that is not part of an obra explains why there is no Registrar", async () => {
    open("/conversonantes/s02", seededProject("member", { sessions: groupSessions }));
    expect(await screen.findByText(/se registran dentro de una obra/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ Registrar" })).not.toBeInTheDocument();
  });

  it("opens a photo, a note and a link; the author or an admin can remove", async () => {
    const note: MediaDto = { ...photoByManu, id: "m-2", kind: "note", title: undefined, body: "El saludo al sol funcionó", mime: undefined, sizeBytes: undefined, createdBy: "me" };
    const seeded = project([photoByManu, note], "member");
    open("/conversonantes/cristina/s02", seeded);
    const list = await screen.findByRole("list", { name: "Material de la sesión" });

    await userEvent.click(within(list).getByRole("button", { name: "Abrir Parada de cabeza" }));
    expect(await within(list).findByRole("img", { name: "Parada de cabeza" })).toHaveAttribute("src", "https://files.test/m-1");
    await userEvent.click(within(list).getByRole("button", { name: /abrir el saludo al sol/i }));
    expect(within(list).getAllByText("El saludo al sol funcionó").length).toBeGreaterThan(1); // title and body

    expect(within(list).queryByRole("button", { name: "Quitar Parada de cabeza" })).not.toBeInTheDocument(); // Manu's
    await userEvent.click(within(list).getByRole("button", { name: /quitar el saludo al sol/i }));
    await waitFor(() => expect(seeded.api.removeMedia).toHaveBeenCalledWith("m-2"));
  });

  it("an admin can remove what others registered", async () => {
    const seeded = project([photoByManu], "admin");
    open("/conversonantes/cristina/s02", seeded);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar Parada de cabeza" }));
    await waitFor(() => expect(seeded.api.removeMedia).toHaveBeenCalledWith("m-1"));
  });

  it("the obra page lists only what has no session yet", async () => {
    const loose: MediaDto = { ...photoByManu, id: "m-3", sessionId: undefined, approachId: undefined, title: "Foto suelta" };
    open("/conversonantes/cristina", project([photoByManu, loose]));
    const list = await screen.findByRole("list", { name: "Material de la obra" });
    expect(within(list).getByText("Foto suelta")).toBeInTheDocument();
    expect(within(list).queryByText("Parada de cabeza")).not.toBeInTheDocument();
  });
});

describe("HU-13 · Registrar", () => {
  it("uploads a photo straight to the store: registers, sends the bytes, confirms, and shows it", async () => {
    const seeded = open(REGISTER, project());
    const file = new File(["foto"], "parada.jpg", { type: "image/jpeg" });
    await upload("Elegir foto", file);

    await waitFor(() => expect(seeded.api.confirmMedia).toHaveBeenCalledTimes(1));
    expect(seeded.api.registerMedia).toHaveBeenCalledWith("p-cristina", {
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: "photo",
      title: "parada",
      mime: "image/jpeg",
      sizeBytes: 4,
      sessionId: "c-2",
    });
    expect(seeded.api.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT" }), file, expect.any(Function));
    const sending = await screen.findByRole("list", { name: "Enviando" });
    expect(await within(sending).findByText("listo")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Material" })).toHaveTextContent("parada");
    expect(screen.getByText("En esta sesión")).toBeInTheDocument();
  });

  it("chooses where it goes: a planteamiento sends approachId; Obra sends no session", async () => {
    const seeded = open(REGISTER, project());
    await userEvent.click(await screen.findByRole("button", { name: /P1 · Calentamiento/ }));
    expect(screen.getByText("En este planteamiento")).toBeInTheDocument();
    await upload("Elegir foto", new File(["a"], "a.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(seeded.api.registerMedia).toHaveBeenCalledTimes(1));
    expect(seeded.api.registerMedia).toHaveBeenLastCalledWith("p-cristina", expect.objectContaining({ approachId: "k-1", sessionId: "c-2" }));

    await userEvent.click(screen.getByRole("button", { name: "Obra" }));
    expect(screen.getByText("En la obra, sin sesión")).toBeInTheDocument();
    await upload("Elegir archivo", new File(["pdf"], "guion.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(seeded.api.registerMedia).toHaveBeenCalledTimes(2));
    const sent = (seeded.api.registerMedia as unknown as { mock: { calls: [string, Record<string, unknown>][] } }).mock.calls[1]![1];
    expect(sent).toMatchObject({ kind: "document", mime: "application/pdf" });
    expect(sent).not.toHaveProperty("sessionId");
  });

  it("a failed upload says so and Reintentar sends it again with the same id", async () => {
    const seeded = open(REGISTER, project());
    seeded.state.uploadError = new Error("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.");
    await upload("Elegir foto", new File(["foto"], "parada.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText("falló")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/revisa tu conexión/i);
    expect(seeded.api.confirmMedia).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("listo")).toBeInTheDocument();
    const calls = (seeded.api.registerMedia as unknown as { mock: { calls: [string, { id: string }][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![1].id).toBe(calls[0]![1].id); // same material, not a duplicate
    expect(seeded.state.media).toHaveLength(1);
  });

  it("registers a link and a written note, with nothing to upload", async () => {
    const seeded = open(REGISTER, project());
    await userEvent.click(await screen.findByRole("button", { name: "Pegar enlace" }));
    await userEvent.type(screen.getByLabelText("Enlace"), "https://youtu.be/abc");
    await userEvent.type(screen.getByLabelText(/título/i), "Ensayo completo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar enlace" }));
    await waitFor(() => expect(seeded.api.registerMedia).toHaveBeenCalledTimes(1));
    expect(seeded.api.registerMedia).toHaveBeenLastCalledWith("p-cristina", expect.objectContaining({ kind: "link", url: "https://youtu.be/abc", title: "Ensayo completo" }));

    await userEvent.click(screen.getByRole("button", { name: "Nota escrita" }));
    expect(screen.getByRole("button", { name: "Guardar nota" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nota"), "Salió bien el saludo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    await waitFor(() => expect(seeded.api.registerMedia).toHaveBeenCalledTimes(2));
    expect(seeded.api.registerMedia).toHaveBeenLastCalledWith("p-cristina", expect.objectContaining({ kind: "note", body: "Salió bien el saludo" }));
    expect(seeded.api.uploadFile).not.toHaveBeenCalled();
    expect(await screen.findByRole("list", { name: "Material" })).toHaveTextContent("Ensayo completo");
  });

  it("records a voice note: counts the time, stops, and sends the audio with its duration", async () => {
    class FakeRecorder {
      static instances: FakeRecorder[] = [];
      state: "inactive" | "recording" = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(public stream: MediaStream) {
        FakeRecorder.instances.push(this);
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voz"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const track = { stop: vi.fn() };
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
    });

    const seeded = open(REGISTER, project());
    await userEvent.click(await screen.findByRole("button", { name: "Grabar audio" }));
    const stop = await screen.findByRole("button", { name: /detener/i });
    await new Promise((r) => setTimeout(r, 1100)); // one second of recording
    await userEvent.click(stop);

    await waitFor(() => expect(seeded.api.confirmMedia).toHaveBeenCalledTimes(1));
    expect(seeded.api.registerMedia).toHaveBeenCalledWith(
      "p-cristina",
      expect.objectContaining({ kind: "audio", title: "Nota de voz", mime: "audio/webm", sizeBytes: 3, durationSeconds: expect.any(Number) }),
    );
    expect(track.stop).toHaveBeenCalled(); // the microphone is let go
  });

  it("says when the microphone is not allowed", async () => {
    vi.stubGlobal("MediaRecorder", class {});
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    open(REGISTER, project());
    await userEvent.click(await screen.findByRole("button", { name: "Grabar audio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/micrófono/i);
  });

  it("without an obra there is nothing to register in", async () => {
    open("/conversonantes/registrar", project());
    expect(await screen.findByRole("heading", { name: "No encontramos esa obra" })).toBeInTheDocument();
  });

  it("mentions privacy and the size limits", async () => {
    open(REGISTER, project());
    expect(await screen.findByText(/solo el grupo lo ve/i)).toBeInTheDocument();
    expect(screen.getByText(/hasta 20 mb por archivo/i)).toBeInTheDocument();
  });
});

describe("HU-13 · material de un planteamiento", () => {
  it("the finding page lists what was registered for it and leads to Registrar with the planteamiento chosen", async () => {
    const held = cristinaSessions.map((s) => (s.id === "c-2" ? { ...s, status: "completed" as const } : s));
    const seeded = seededProject("member", { sessions: held, approaches, media: [photoByManu] });
    const { history } = open("/conversonantes/cristina/s02/p1", seeded);
    const list = await screen.findByRole("list", { name: "Material del planteamiento" });
    expect(within(list).getByText("Parada de cabeza")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "+ Registrar" }));
    expect(history.location.pathname).toBe("/conversonantes/registrar");
    expect(history.location.search).toContain("k-1");
  });
});
