import { useParams } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { parseSessionSlug } from "../sessionFormat";
import { Page } from "../ui";
import { ProjectScreen } from "./ProjectScreen";
import { SessionScreen } from "./SessionScreen";

/**
 * /<group>/<x> is a project (x = its slug) unless x looks like a session address (s02):
 * projects can never take those slugs, so the two never collide.
 */
export function ProjectOrGroupSessionRoute() {
  const { handle = "", slug = "" } = useParams({ strict: false }) as { handle?: string; slug?: string };
  const number = parseSessionSlug(slug);
  return number === null ? <ProjectScreen /> : <SessionScreen handle={handle} number={number} />;
}

/** /<group>/<project>/s02 */
export function ProjectSessionRoute() {
  const { handle = "", slug = "", session = "" } = useParams({ strict: false }) as {
    handle?: string;
    slug?: string;
    session?: string;
  };
  const number = parseSessionSlug(session);
  if (number === null) {
    return (
      <Page className="justify-center">
        <h1 className="text-4xl">No encontramos esa página</h1>
        <Link to="/$handle/$slug" params={{ handle, slug }} className="mt-4 min-h-tactil text-lg font-semibold text-verde">
          Volver a la obra
        </Link>
      </Page>
    );
  }
  return <SessionScreen handle={handle} projectSlug={slug} number={number} />;
}
