import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { netlifyHandler, stripApiPrefix } from "./netlify";

describe("stripApiPrefix", () => {
  it("takes /api (and the function's own path) off, and only at the start", () => {
    expect(stripApiPrefix("/api/groups/abc")).toBe("/groups/abc");
    expect(stripApiPrefix("/.netlify/functions/api/health")).toBe("/health");
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api/")).toBe("/");
    expect(stripApiPrefix("/health")).toBe("/health");
    expect(stripApiPrefix("/apiary")).toBe("/apiary"); // not a prefix of the segment
    expect(stripApiPrefix("/groups/api/x")).toBe("/groups/api/x");
  });
});

describe("netlifyHandler", () => {
  const echo = new Hono();
  echo.get("/things", (c) => c.json({ query: c.req.query("q") ?? null, auth: c.req.header("authorization") ?? null }));
  echo.post("/things", async (c) => c.json({ body: await c.req.json() }, 201));
  const handle = netlifyHandler(echo);

  it("reaches the routes under /api, keeping the query string and the headers", async () => {
    const res = await handle(new Request("https://site.netlify.app/api/things?q=hola", { headers: { Authorization: "Bearer x" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ query: "hola", auth: "Bearer x" });
  });

  it("keeps the method and the body of a POST", async () => {
    const res = await handle(
      new Request("https://site.netlify.app/.netlify/functions/api/things", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Calentamiento" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ body: { text: "Calentamiento" } });
  });

  it("serves the real API: /api/health is open, anything else needs a session", async () => {
    const app = createApp({
      authenticator: { authenticate: async () => null },
      depsFor: () => ({}) as never, // never reached: nobody is signed in
    });
    const real = netlifyHandler(app);
    expect((await real(new Request("https://site.netlify.app/api/health"))).status).toBe(200);
    const closed = await real(new Request("https://site.netlify.app/api/me/groups"));
    expect(closed.status).toBe(401);
    expect(await closed.json()).toMatchObject({ error: "unauthorized" });
  });
});
