import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { BackLink, Loading, Mono, Page } from "../ui";
import { ProjectForm } from "./ProjectForm";
import { useGroup } from "./useGroup";

/** HU-05: an admin creates a project. */
export function NewProjectScreen() {
  const { handle = "" } = useParams({ strict: false }) as { handle?: string };
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { groups, group, members, role } = useGroup(handle);

  const origins = useQuery({
    queryKey: ["sessions", group?.id, "none"],
    queryFn: () => api.sessions(group!.id, "none"),
    enabled: !!group,
  });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createProject>[1]) => api.createProject(group!.id, input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", group?.id] });
      await queryClient.invalidateQueries({ queryKey: ["sessions", group?.id] });
      await navigate({ to: "/$handle/$slug", params: { handle, slug: project.slug } });
    },
  });

  if (groups.isPending || (group && members.isPending)) return <Loading />;
  if (!group || role !== "admin") {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">Solo los admins crean obras</h1>
        <Link to="/$handle" params={{ handle }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver al grupo
        </Link>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex items-center gap-4">
        <BackLink to={`/${handle}`} label="Cancelar" />
        <Mono>{handle}/obras/nueva</Mono>
      </div>
      <h1 className="mt-6 text-5xl">Nueva obra</h1>
      <ProjectForm
        initial={{ title: "", status: "searching", themes: [], visibilityAgreement: "" }}
        submitLabel="Crear obra"
        pendingLabel="Creando…"
        pending={create.isPending}
        error={create.error}
        origins={origins.data}
        onSubmit={(input) => create.mutate(input)}
      />
    </Page>
  );
}
