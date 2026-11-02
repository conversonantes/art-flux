import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { AcceptInviteScreen } from "./screens/AcceptInviteScreen";
import { GroupScreen } from "./screens/GroupScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { EditProjectScreen } from "./screens/EditProjectScreen";
import { InviteScreen } from "./screens/InviteScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { NewGroupScreen } from "./screens/NewGroupScreen";
import { NewProjectScreen } from "./screens/NewProjectScreen";
import { ProjectScreen } from "./screens/ProjectScreen";
import { RequireAuth } from "./screens/RequireAuth";
import { TeamScreen } from "./screens/TeamScreen";

const root = createRootRoute({ component: Outlet });

const protectedRoute = (path: string, Screen: () => JSX.Element) =>
  createRoute({
    getParentRoute: () => root,
    path,
    component: () => (
      <RequireAuth>
        <Screen />
      </RequireAuth>
    ),
  });

// Static paths win over /$handle. Group handles can never collide with them: the core reserves
// entrar, grupos, invitar, i… (see RESERVED_HANDLES) and requires at least 3 characters.
const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: "/entrar", component: LoginScreen }),
  protectedRoute("/", HomeScreen),
  protectedRoute("/grupos/nuevo", NewGroupScreen),
  // The invite screen handles its own sign-in redirect so it can remember the link.
  createRoute({ getParentRoute: () => root, path: "/i/$token", component: AcceptInviteScreen }),
  protectedRoute("/$handle", GroupScreen),
  protectedRoute("/$handle/invitar", InviteScreen),
  protectedRoute("/$handle/obras/nueva", NewProjectScreen),
  // Project slugs can never be "invitar", "obras", "nueva", "editar" or "equipo" (RESERVED_PROJECT_SLUGS).
  protectedRoute("/$handle/$slug", ProjectScreen),
  protectedRoute("/$handle/$slug/editar", EditProjectScreen),
  protectedRoute("/$handle/$slug/equipo", TeamScreen),
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}
