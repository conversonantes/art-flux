import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { useGroup } from "./useGroup";

/** A project addressed as /<handle>/<slug>, together with its group and the person's role. */
export function useProject(handle: string, slug: string) {
  const api = useApi();
  const { groups, group, members, role } = useGroup(handle);

  const project = useQuery({
    queryKey: ["project", group?.id, slug],
    queryFn: () => api.project(group!.id, slug),
    enabled: !!group,
  });

  const team = useQuery({
    queryKey: ["team", project.data?.id],
    queryFn: () => api.team(project.data!.id),
    enabled: !!project.data,
  });

  return { groups, group, members, role, project, team };
}
