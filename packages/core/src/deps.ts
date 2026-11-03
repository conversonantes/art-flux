import type { ApproachDeps } from "./approaches";
import type { FindingDeps } from "./findings";
import type { InviteDeps } from "./invites";
import type { ProjectDeps } from "./projects";
import type { SessionDeps } from "./sessions";

/** Everything a request needs; each use case asks only for the slice it uses. */
export interface AppDeps extends InviteDeps, ProjectDeps, SessionDeps, ApproachDeps, FindingDeps {}
