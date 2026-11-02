import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useApi } from "../api/ApiProvider";
import { lastGroup } from "../storage";
import { BackLink, Button, ErrorNote, Field, Lead, Mono, Page } from "../ui";

/** HU-02: create the group; whoever creates it is admin. */
export function NewGroupScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  const create = useMutation({
    mutationFn: () => api.createGroup({ name, ...(city.trim() ? { city } : {}) }),
    onSuccess: async (group) => {
      lastGroup.set(group.id);
      await queryClient.invalidateQueries();
      // The design continues straight to "Invita a tu gente".
      await navigate({ to: "/$handle/invitar", params: { handle: group.handle } });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <Page>
      <div className="flex items-center gap-4">
        <BackLink to="/" label="Volver al inicio" />
        <Mono>grupos/nuevo</Mono>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col">
        <h1 className="text-5xl">Abre tu grupo</h1>
        <div className="mt-3">
          <Lead>Aquí va a vivir el proceso: obras, sesiones y ejercicios.</Lead>
        </div>

        <div className="mt-8 space-y-5">
          <Field
            label="Nombre del grupo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
            required
          />
          <Field
            label="Ciudad"
            optional
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
          />
          <div className="flex items-start gap-3 rounded-3xl border border-linea bg-hoja p-4">
            <span className="rounded-af-chico bg-verde px-2 py-0.5 font-mono text-sm text-white">admin</span>
            <p className="text-base">
              Quedas como admin: invitas, creas obras y decides qué se publica. Todo nace privado.
            </p>
          </div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {create.isError && <ErrorNote error={create.error} />}
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creando…" : "Crear grupo"}
          </Button>
        </div>
      </form>
    </Page>
  );
}
