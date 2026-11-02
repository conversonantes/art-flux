import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { BackLink, ErrorNote, Loading, Mono, Page } from "../ui";
import { ProjectForm } from "./ProjectForm";
import { useProject } from "./useProject";

/** HU-05: edit everything later. The address (slug) does not change. */
export function EditProjectScreen() {
  const { handle = "", slug = "" } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { groups, group, members, role, project } = useProject(handle, slug);

  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.updateProject>[1]) => api.updateProject(project.data!.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", group?.id] });
      await queryClient.invalidateQueries({ queryKey: ["projects", group?.id] });
      await navigate({ to: "/$handle/$slug", params: { handle, slug } });
    },
  });

  if (groups.isPending || (group && (members.isPending || project.isPending))) return <Loading />;
  if (project.isError) {
    return (
      <Page>
        <ErrorNote error={project.error} />
      </Page>
    );
  }
  if (!group || !project.data || role !== "admin") {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">Solo los admins editan obras</h1>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }

  const p = project.data;
  return (
    <Page>
      <div className="flex items-center gap-4">
        <BackLink to={`/${handle}/${slug}`} label="Cancelar" />
        <Mono>
          {handle}/{slug}/editar
        </Mono>
      </div>
      <h1 className="mt-6 text-5xl">Editar obra</h1>
      <ProjectForm
        initial={{
          title: p.title,
          status: p.status,
          themes: p.themes,
          visibilityAgreement: p.visibilityAgreement ?? "",
        }}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
        pending={update.isPending}
        error={update.error}
        onSubmit={(input) => update.mutate(input)}
      />
    </Page>
  );
}
