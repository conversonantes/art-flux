// Guards the layering from docs/arquitectura.md. If this fails, do not weaken the test:
// move the provider-specific code into packages/adapters (and wire it in a composition root).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(int\.)?test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Module specifiers a file imports or re-exports from. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

function offenders(dir: string, forbidden: RegExp): string[] {
  return sourceFiles(join(root, dir)).flatMap((file) =>
    importsOf(file)
      .filter((spec) => forbidden.test(spec))
      .map((spec) => `${relative(root, file).replaceAll("\\", "/")} imports "${spec}"`),
  );
}

const PROVIDERS = /^(@supabase\/|pg$|@aws-sdk\/)/;

describe("architecture", () => {
  it("the core knows no provider, web framework or other package of the monorepo", () => {
    expect(offenders("packages/core/src", PROVIDERS)).toEqual([]);
    expect(offenders("packages/core/src", /^(hono|@hono\/|@art-flux\/(?!core))/)).toEqual([]);
  });

  it("the API routes and server know no provider SDK (adapters hold them)", () => {
    expect(offenders("apps/api/src", PROVIDERS)).toEqual([]);
  });

  it("the guard actually sees files", () => {
    expect(sourceFiles(join(root, "packages/core/src")).length).toBeGreaterThan(5);
    expect(sourceFiles(join(root, "apps/api/src")).length).toBeGreaterThan(0);
  });
});
