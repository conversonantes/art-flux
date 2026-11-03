// Empaqueta la API como UN archivo para Netlify: netlify/functions/api.mjs.
//
// Por qué no dejamos que Netlify la empaquete sola: en un monorepo de pnpm, `hono` y las demás
// dependencias viven en apps/api/node_modules (no en la raíz), Netlify no las encuentra, las deja
// como "externas" y la función se cae en producción con "Cannot find module 'hono'".
// Aquí esbuild resuelve todo desde el código fuente y mete las dependencias dentro del archivo.
//
// Uso:  node scripts/build-function.mjs [--outfile ruta]      (lo corre netlify.toml tras el build de la web)
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flag = process.argv.indexOf("--outfile");
const outfile = flag > -1 ? resolve(process.argv[flag + 1]) : resolve(root, "netlify/functions/api.mjs");

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, "apps/api/src/function.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
  // Algunas dependencias (el SDK de AWS) todavía llaman a require(): el archivo es ESM, así que se les da uno.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

console.log(`Función empaquetada: ${outfile}`);
