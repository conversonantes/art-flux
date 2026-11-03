// What the Netlify Function needs besides the app itself. The routes live at the root of the app
// (`/health`, `/groups`…), while the site serves the API under `/api`, so the prefix is taken off.

/** `/api/groups` and `/.netlify/functions/api/groups` both become `/groups`. */
export function stripApiPrefix(pathname: string): string {
  return pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/, "") || "/";
}

interface Fetchable {
  fetch(request: Request): Response | Promise<Response>;
}

/** A `(Request) => Response` handler for Netlify, around any Hono-like app. */
export function netlifyHandler(app: Fetchable) {
  return (request: Request): Response | Promise<Response> => {
    const url = new URL(request.url);
    url.pathname = stripApiPrefix(url.pathname);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return app.fetch(
      new Request(url, {
        method: request.method,
        headers: request.headers,
        ...(hasBody ? { body: request.body, duplex: "half" } : {}),
      } as RequestInit),
    );
  };
}
