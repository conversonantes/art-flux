import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Api } from "./api/api";
import { ApiProvider } from "./api/ApiProvider";
import type { AuthClient } from "./auth/AuthClient";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { createAppRouter } from "./router";

/** Drops cached data when the person signs out, so the next person never sees it. */
function ClearCacheOnSignOut() {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (state.status === "out") queryClient.clear();
  }, [state.status, queryClient]);
  return null;
}

/** Composition: the identity provider and the API are passed in, never imported here. */
export function App({ auth, api, history }: { auth: AuthClient; api: Api; history?: RouterHistory }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5_000 } } }));
  const [router] = useState(() => createAppRouter(history));

  return (
    <AuthProvider client={auth}>
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <ClearCacheOnSignOut />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>
  );
}
