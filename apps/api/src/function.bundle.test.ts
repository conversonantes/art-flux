// Regression: in production the function crashed with "Cannot find module 'hono'" because Netlify
// could not find the dependencies of a pnpm monorepo. The build now bundles everything into one file;
// this builds it the same way and runs it from a folder with no node_modules around.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const script = resolve(__dirname, "../../../scripts/build-function.mjs");
const folders: string[] = [];

afterAll(() => folders.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("the bundled Netlify function", () => {
  it("runs on its own, without any node_modules, and answers under /api", async () => {
    const built = mkdtempSync(join(tmpdir(), "art-flux-build-"));
    const alone = mkdtempSync(join(tmpdir(), "art-flux-solo-"));
    folders.push(built, alone);

    execFileSync(process.execPath, [script, "--outfile", join(built, "api.mjs")], { stdio: "pipe" });
    copyFileSync(join(built, "api.mjs"), join(alone, "api.mjs"));

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-de-prueba";
    const mod = (await import(/* @vite-ignore */ pathToFileURL(join(alone, "api.mjs")).href)) as {
      default: (request: Request) => Promise<Response>;
      config: { path: string };
    };

    expect(mod.config).toEqual({ path: "/api/*" });
    const health = await mod.default(new Request("https://sitio.netlify.app/api/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    const closed = await mod.default(new Request("https://sitio.netlify.app/api/me/groups"));
    expect(closed.status).toBe(401);
  }, 60_000);
});
