# @art-flux/api

API en Hono: una capa delgada entre la web y el `core`. Rutas y permisos en [`docs/api.md`](../../docs/api.md).

## Estructura

- `src/app.ts` — `createApp({ authenticator, depsFor })`: valida la credencial, arma los repositorios de esa persona, y expone las rutas. **No conoce ningún proveedor**; recibe todo por parámetro.
- `src/wiring.ts` — elige Supabase y R2 según las variables de entorno (`wiringFromEnv`); lo usan el servidor local y la función de Netlify.
- `src/server.ts` — raíz de composición para desarrollo: carga el `.env`, usa `wiringFromEnv` y arranca el servidor.
- `src/netlify.ts` — lo que necesita la función de Netlify: quitar el prefijo `/api` de la ruta. La función misma está en `src/function.ts`; `pnpm build:api` la empaqueta en un solo archivo (`netlify/functions/api.mjs`, generado, no versionado); pasos de despliegue en [`docs/despliegue.md`](../../docs/despliegue.md).
- `src/app.test.ts` — pruebas de las rutas, sin red, con repositorios en memoria del `core`.
- `src/app.int.test.ts` — la API con sesiones reales de Supabase.

## Reglas

- Una ruta solo lee la petición, llama a **un** caso de uso del `core` y devuelve el resultado. La lógica va en el `core`.
- Los errores del dominio se traducen en `app.onError` (403, 404, 409, 410…); no se atrapan en cada ruta.
- Nada de SDK de proveedores aquí (lo vigila `packages/core/src/architecture.test.ts`).

## Correr y probar

```
pnpm dev:api                          # http://localhost:8787
pnpm --filter @art-flux/api test      # sin red
pnpm --filter @art-flux/api test:int  # contra Supabase real (necesita .env)
```
