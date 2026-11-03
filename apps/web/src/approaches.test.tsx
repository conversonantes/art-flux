import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError, type ApproachDto } from "./api/api";
import { ApiProvider } from "./api/ApiProvider";
import { reorderIds, sortByIds } from "./approachOrder";
import { useApproaches } from "./screens/useApproaches";
import { approachesOfS2, fakeAuth, groupSessions, me, seededProject } from "./test/fakes";

type Seeded = ReturnType<typeof seededProject>;

/** The group session S02 ("Explorar el texto") with its three approaches. */
const withApproaches = (approaches: ApproachDto[] = approachesOfS2, role: "admin" | "member" = "admin") =>
  seededProject(role, { sessions: groupSessions, approaches });

function open(seeded: Seeded, path = "/conversonantes/s02") {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App auth={fakeAuth(me)} api={seeded.api} history={history} />);
  return seeded;
}

/** The approach rows once they have loaded (the list itself appears before its data). */
const items = async () => {
  const list = await screen.findByRole("list", { name: "Planteamientos" });
  return waitFor(() => {
    const rows = within(list).queryAllByRole("listitem");
    if (rows.length === 0) throw new Error("approaches have not loaded yet");
    return rows;
  });
};

describe("HU-08 · planteamientos de una sesión", () => {
  it("lists them as P1, P2… with who brings each one and a drag handle", async () => {
    open(withApproaches());
    const rows = await items();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Calentamiento corporal")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("P1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Manu")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Kokoro")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Santi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arrastrar P2" })).toBeInTheDocument();
    expect(screen.getByText("arrastra para ordenar")).toBeInTheDocument();
  });

  it("adds an approach: text and who brings it (the author by default)", async () => {
    const seeded = open(withApproaches());
    await userEvent.click(await screen.findByRole("button", { name: "+ Agregar planteamiento" }));

    expect(screen.getByText("nuevo")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /santi/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Texto del planteamiento"), "Trabajo de voz");
    await userEvent.click(screen.getByRole("radio", { name: /kokoro/i }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(async () => expect(await items()).toHaveLength(4));
    expect(seeded.api.addApproach).toHaveBeenCalledWith("s-2", { text: "Trabajo de voz", ownerId: "kokoro" });
    expect(within((await items())[3]!).getByText("Trabajo de voz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Texto del planteamiento")).not.toBeInTheDocument();
  });

  it("opens the editor by itself on an empty session, and can be cancelled when there are items", async () => {
    open(withApproaches([]));
    expect(await screen.findByLabelText("Texto del planteamiento")).toBeInTheDocument();
    expect(screen.getByText("nuevo")).toBeInTheDocument();
  });

  it("closes the add card with Cancelar", async () => {
    open(withApproaches());
    await userEvent.click(await screen.findByRole("button", { name: "+ Agregar planteamiento" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Texto del planteamiento")).not.toBeInTheDocument();
  });

  it("edits the text and the owner", async () => {
    const seeded = open(withApproaches());
    await userEvent.click(await screen.findByRole("button", { name: "Editar P2" }));

    const box = screen.getByLabelText("Texto del planteamiento") as HTMLTextAreaElement;
    expect(box.value).toBe("Improvisación");
    expect(screen.getByRole("radio", { name: /kokoro/i })).toHaveAttribute("aria-checked", "true");

    await userEvent.clear(box);
    await userEvent.type(box, "Improvisación con objetos");
    await userEvent.click(screen.getByRole("radio", { name: /manu/i }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(seeded.api.updateApproach).toHaveBeenCalledWith("ap-2", { text: "Improvisación con objetos", ownerId: "manu" }));
    expect(await screen.findByText("Improvisación con objetos")).toBeInTheDocument();
  });

  it("removes one and renumbers the rest on screen", async () => {
    const seeded = open(withApproaches());
    await userEvent.click(await screen.findByRole("button", { name: "Quitar P1" }));
    await waitFor(async () => expect(await items()).toHaveLength(2));
    expect(seeded.api.removeApproach).toHaveBeenCalledWith("ap-1");
    const rows = await items();
    expect(within(rows[0]!).getByText("P1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Improvisación")).toBeInTheDocument();
  });

  it("is read-only once the session was held", async () => {
    const held = groupSessions.map((s) => (s.id === "s-2" ? { ...s, status: "completed" as const } : s));
    open(seededProject("admin", { sessions: held, approaches: approachesOfS2 }));
    expect(await screen.findByText("Calentamiento corporal")).toBeInTheDocument();
    expect(screen.getByText("realizada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Agregar planteamiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /arrastrar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^quitar/i })).not.toBeInTheDocument();
  });

  it("lets plain members plan too", async () => {
    open(withApproaches(approachesOfS2, "member"));
    expect(await screen.findByRole("button", { name: "Arrastrar P1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Agregar planteamiento" })).toBeInTheDocument();
  });
});

describe("reordering (HU-08)", () => {
  function setup(seeded: Seeded) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={seeded.api}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiProvider>
    );
    return renderHook(() => useApproaches("s-2"), { wrapper });
  }
  const texts = (result: { current: ReturnType<typeof useApproaches> }) => result.current.list.data?.map((a) => a.text);

  it("sends the full new order and keeps what the server answers", async () => {
    const seeded = withApproaches();
    const { result } = setup(seeded);
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.reorder.mutateAsync(["ap-3", "ap-1", "ap-2"]);
    });
    expect(seeded.api.reorderApproaches).toHaveBeenCalledWith("s-2", ["ap-3", "ap-1", "ap-2"]);
    await waitFor(() =>
      expect(texts(result)).toEqual(["Análisis de acciones por personaje", "Calentamiento corporal", "Improvisación"]),
    );
  });

  it("shows the new order immediately, before the server answers", async () => {
    const seeded = withApproaches();
    let finish!: (list: ApproachDto[]) => void;
    seeded.api.reorderApproaches = vi.fn(() => new Promise<ApproachDto[]>((resolve) => (finish = resolve)));
    const { result } = setup(seeded);
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => result.current.reorder.mutate(["ap-2", "ap-3", "ap-1"]));
    await waitFor(() => expect(texts(result)?.[0]).toBe("Improvisación")); // optimistic, server still pending
    expect(result.current.reorder.isPending).toBe(true);

    await act(async () => finish(sortByIds(approachesOfS2, ["ap-2", "ap-3", "ap-1"])));
    await waitFor(() => expect(result.current.reorder.isSuccess).toBe(true));
  });

  it("puts the old order back and reports the error when the server refuses", async () => {
    const seeded = withApproaches();
    seeded.state.reorderError = new ApiError(409, "conflict", "La lista cambió mientras la ordenabas. Recárgala e intenta de nuevo.");
    const { result } = setup(seeded);
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.reorder.mutateAsync(["ap-3", "ap-2", "ap-1"]).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.reorder.isError).toBe(true));
    expect(result.current.reorder.error?.message).toMatch(/la lista cambió/i);
    await waitFor(() =>
      expect(texts(result)).toEqual(["Calentamiento corporal", "Improvisación", "Análisis de acciones por personaje"]),
    );
  });
});

describe("order helpers", () => {
  it("reorderIds moves the dragged item to where the target is", () => {
    expect(reorderIds(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(reorderIds(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(reorderIds(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
    expect(reorderIds(["a", "b"], "x", "b")).toEqual(["a", "b"]);
  });

  it("sortByIds follows the given order and leaves unknown ones at the end", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(sortByIds(list, ["c", "a"]).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});
