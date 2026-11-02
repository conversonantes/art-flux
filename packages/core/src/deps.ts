import type { InviteDeps } from "./invites";
import type { ProjectDeps } from "./projects";

/** Everything a request needs; each use case asks only for the slice it uses. */
export interface AppDeps extends InviteDeps, ProjectDeps {}
