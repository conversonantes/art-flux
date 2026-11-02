import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/ApiProvider";
import { useSession } from "../auth/AuthProvider";

/** The group for a /<handle> route, with the signed-in person's role in it. */
export function useGroup(handle: string) {
  const api = useApi();
  const { user } = useSession();

  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.myGroups() });
  const group = groups.data?.find((g) => g.handle === handle);

  const members = useQuery({
    queryKey: ["members", group?.id],
    queryFn: () => api.members(group!.id),
    enabled: !!group,
  });
  const role = members.data?.find((m) => m.userId === user.id)?.role;

  return { groups, group, members, role };
}
