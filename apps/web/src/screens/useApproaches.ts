import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApproachDto } from "../api/api";
import { useApi } from "../api/ApiProvider";
import { sortByIds } from "../approachOrder";

/** A session's approaches, with the edits HU-08 allows. Reordering is optimistic with rollback. */
export function useApproaches(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = ["approaches", sessionId];
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const list = useQuery({ queryKey: key, queryFn: () => api.approaches(sessionId) });

  const add = useMutation({
    mutationFn: (input: { text: string; ownerId: string }) => api.addApproach(sessionId, input),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: (input: { id: string; text?: string; ownerId?: string }) => {
      const { id, ...changes } = input;
      return api.updateApproach(id, changes);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeApproach(id),
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => api.reorderApproaches(sessionId, orderedIds),
    // Show the new order at once; if the server refuses, put it back and reload the real one.
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApproachDto[]>(key);
      if (previous) queryClient.setQueryData(key, sortByIds(previous, orderedIds));
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      void refresh();
    },
    onSuccess: (fresh) => queryClient.setQueryData(key, fresh),
  });

  return { list, add, update, remove, reorder };
}
