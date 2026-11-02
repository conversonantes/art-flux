import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { conversonantes, fakeApi, fakeAuth, me } from "./test/fakes";

function open(path: string, auth = fakeAuth(me), api = fakeApi()) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={auth} api={api.api} history={history} />);
  return { history, auth, ...api };
}

describe("HU-01 · entrar", () => {
  it("sends a signed-out person to the login screen and starts Google sign-in", async () => {
    const auth = fakeAuth(null);
    open("/", auth);
    const button = await screen.findByRole("button", { name: /entrar con google/i });
    await userEvent.click(button);
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("lands a signed-in person on the no-group screen after sign-in", async () => {
    open("/entrar");
    expect(await screen.findByText("Todavía no estás en ningún grupo.")).toBeInTheDocument();
    expect(screen.getByText("Santi")).toBeInTheDocument();
  });
});

describe("HU-02 · grupo", () => {
  it("offers to create a group when you have none, then continues to invite", async () => {
    const { api, history } = open("/");
    await userEvent.click(await screen.findByRole("link", { name: /crear un grupo/i }));

    await userEvent.type(await screen.findByLabelText(/nombre del grupo/i), "Conversonantes");
    await userEvent.type(screen.getByLabelText(/ciudad/i), "Medellín");
    await userEvent.click(screen.getByRole("button", { name: /crear grupo/i }));

    expect(await screen.findByRole("heading", { name: "Invita a tu gente" })).toBeInTheDocument();
    expect(api.createGroup).toHaveBeenCalledWith({ name: "Conversonantes", city: "Medellín" });
    expect(history.location.pathname).toBe("/conversonantes/invitar");
  });

  it("does not let you submit without a name", async () => {
    open("/grupos/nuevo");
    expect(await screen.findByRole("button", { name: /crear grupo/i })).toBeDisabled();
  });

  it("goes straight to your group when you have exactly one", async () => {
    const { history } = open("/", fakeAuth(me), fakeApi({
      groups: [conversonantes],
      members: { "g-conv": [{ userId: "me", role: "admin", displayName: "Santi" }] },
    }));
    expect(await screen.findByRole("heading", { name: "Conversonantes" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/conversonantes");
  });

  it("lets you choose when you belong to several, and switch from the header", async () => {
    const otro = { ...conversonantes, id: "g-otro", handle: "otro", name: "Otro grupo" };
    const members = {
      "g-conv": [{ userId: "me", role: "member" as const }],
      "g-otro": [{ userId: "me", role: "member" as const }],
    };
    open("/", fakeAuth(me), fakeApi({ groups: [conversonantes, otro], members }));
    await userEvent.click(await screen.findByRole("link", { name: /^otro grupo/i }));
    const selector = await screen.findByLabelText("Cambiar de grupo");
    await userEvent.selectOptions(selector, "conversonantes");
    expect(await screen.findByRole("heading", { name: "Conversonantes" })).toBeInTheDocument();
  });
});

describe("HU-02 · crear otro grupo", () => {
  const seed = () =>
    fakeApi({
      groups: [conversonantes],
      members: { "g-conv": [{ userId: "me", role: "admin" as const, displayName: "Santi" }] },
    });

  it("offers it inside a group you already belong to", async () => {
    const { history } = open("/conversonantes", fakeAuth(me), seed());
    await userEvent.click(await screen.findByRole("link", { name: /crear otro grupo/i }));
    expect(await screen.findByRole("heading", { name: "Abre tu grupo" })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/grupos/nuevo");
  });

  it("offers it in the header selector when you have several, and shows both groups after creating", async () => {
    const seeded = seed();
    open("/conversonantes", fakeAuth(me), seeded);
    await userEvent.click(await screen.findByRole("link", { name: /crear otro grupo/i }));
    await userEvent.type(await screen.findByLabelText(/nombre del grupo/i), "Segundo");
    await userEvent.click(screen.getByRole("button", { name: /crear grupo/i }));
    await screen.findByRole("heading", { name: "Invita a tu gente" });

    await userEvent.click(screen.getByRole("link", { name: /ir al grupo/i }));
    const selector = await screen.findByLabelText("Cambiar de grupo");
    const options = Array.from((selector as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(["Conversonantes", "Segundo", "+ Crear otro grupo"]);

    await userEvent.selectOptions(selector, "__nuevo__");
    expect(await screen.findByRole("heading", { name: "Abre tu grupo" })).toBeInTheDocument();
  });

  it("is also on the group chooser", async () => {
    const otro = { ...conversonantes, id: "g-otro", handle: "otro", name: "Otro grupo" };
    open("/", fakeAuth(me), fakeApi({ groups: [conversonantes, otro] }));
    expect(await screen.findByRole("link", { name: /crear otro grupo/i })).toBeInTheDocument();
  });
});

describe("HU-03 · invitar", () => {
  const adminSeed = () =>
    fakeApi({
      groups: [conversonantes],
      members: {
        "g-conv": [
          { userId: "me", role: "admin", displayName: "Santi" },
          { userId: "manu", role: "member", displayName: "Manu" },
        ],
      },
    });

  it("generates a link, shows it and builds the WhatsApp share URL", async () => {
    const { api } = open("/conversonantes/invitar", fakeAuth(me), adminSeed());
    await userEvent.type(await screen.findByLabelText(/para quién es/i), "Para Ana");
    await userEvent.click(screen.getByRole("button", { name: /generar enlace/i }));

    const field = (await screen.findByLabelText("Enlace de invitación")) as HTMLInputElement;
    expect(api.createInvite).toHaveBeenCalledWith("g-conv", { label: "Para Ana" });
    expect(field.value).toMatch(/\/i\/token-\d+$/);

    const share = screen.getByRole("link", { name: /compartir por whatsapp/i });
    expect(share.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(share.getAttribute("href")!)).toContain(field.value);
  });

  it("revokes the current link and generates a new one", async () => {
    const { api } = open("/conversonantes/invitar", fakeAuth(me), adminSeed());
    await userEvent.click(await screen.findByRole("button", { name: /generar enlace/i }));
    const first = ((await screen.findByLabelText("Enlace de invitación")) as HTMLInputElement).value;

    await userEvent.click(screen.getByRole("button", { name: /anular este enlace y generar otro/i }));
    await waitFor(() => {
      const next = (screen.getByLabelText("Enlace de invitación") as HTMLInputElement).value;
      expect(next).not.toBe(first);
    });
    expect(api.revokeInvite).toHaveBeenCalledOnce();
  });

  it("lists who already joined by link, with their names", async () => {
    const seeded = adminSeed();
    seeded.state.invites.push({
      id: "i-used",
      groupId: "g-conv",
      token: "t-used",
      label: "para Manu",
      createdBy: "me",
      createdAt: "2026-11-02T10:00:00Z",
      expiresAt: new Date(Date.now() + 864e5).toISOString(),
      acceptedBy: "manu",
      acceptedAt: "2026-11-02T11:00:00Z",
    });
    open("/conversonantes/invitar", fakeAuth(me), seeded);
    expect(await screen.findByRole("heading", { name: "Ya entraron" })).toBeInTheDocument();
    expect(screen.getByText("Manu")).toBeInTheDocument();
    expect(screen.getByText("1 por enlace")).toBeInTheDocument();
  });

  it("tells non-admins that only admins invite", async () => {
    const seeded = fakeApi({
      groups: [conversonantes],
      members: { "g-conv": [{ userId: "me", role: "member" }] },
    });
    open("/conversonantes/invitar", fakeAuth(me), seeded);
    expect(await screen.findByRole("heading", { name: "Solo los admins invitan" })).toBeInTheDocument();
    expect(seeded.api.invites).not.toHaveBeenCalled();
  });
});

describe("HU-03 · abrir un enlace de invitación", () => {
  const invited = () => {
    const seeded = fakeApi({
      groups: [conversonantes],
      members: { "g-conv": [{ userId: "me", role: "member", displayName: "Santi" }] },
    });
    seeded.state.invites.push({
      id: "i1",
      groupId: "g-conv",
      token: "abc",
      createdBy: "boss",
      createdAt: "2026-11-02T10:00:00Z",
      expiresAt: new Date(Date.now() + 864e5).toISOString(),
    });
    return seeded;
  };

  it("joins you and opens the group when you are signed in", async () => {
    const seeded = invited();
    const { history } = open("/i/abc", fakeAuth(me), seeded);
    expect(await screen.findByRole("heading", { name: "Conversonantes" })).toBeInTheDocument();
    expect(seeded.api.acceptInvite).toHaveBeenCalledWith("abc");
    expect(history.location.pathname).toBe("/conversonantes");
  });

  it("remembers the link through sign-in and joins afterwards", async () => {
    const seeded = invited();
    const auth = fakeAuth(null);
    open("/i/abc", auth, seeded);

    await userEvent.click(await screen.findByRole("button", { name: /entrar con google/i }));
    expect(await screen.findByRole("heading", { name: "Conversonantes" })).toBeInTheDocument();
    expect(seeded.api.acceptInvite).toHaveBeenCalledWith("abc");
    expect(sessionStorage.getItem("af:pendingInvite")).toBeNull();
  });

  it("explains when the link no longer works", async () => {
    open("/i/gastado", fakeAuth(me), fakeApi());
    expect(await screen.findByRole("alert")).toHaveTextContent("Este enlace ya no sirve");
    expect(screen.getByRole("link", { name: /ir al inicio/i })).toBeInTheDocument();
  });
});
