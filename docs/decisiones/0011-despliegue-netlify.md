# 0011 · Despliegue: la web estática y la API como una sola función en Netlify

**Estado:** Vigente · Pasos concretos en [despliegue.md](../despliegue.md)

## Contexto
La app necesita una dirección pública con HTTPS (inicio de sesión con Google, micrófono, subida a R2) y la arquitectura ya preveía Netlify: la web como estático y Hono como función. Hasta ahora todo corría solo en el computador de quien desarrolla.

## Decisión
- **Un solo sitio de Netlify** sirve la web y la API bajo el mismo origen: la web en `/` y la API en `/api/*`. Es lo mismo que hace el proxy de Vite en desarrollo, así que el navegador no necesita CORS contra la API.
- **Una sola función** (`apps/api/src/function.ts`, ruta `/api/*`) con toda la app de Hono, **empaquetada por nosotros** (`scripts/build-function.mjs`, esbuild) en `netlify/functions/api.mjs` durante el build. Dejar que Netlify la empaquetara falló en producción (`Cannot find module 'hono'`): en un monorepo de pnpm las dependencias viven en `apps/api/node_modules` y Netlify no las encuentra. Un solo archivo con todo adentro no depende de eso, y una prueba lo corre sin `node_modules`. Las rutas de `apps/api` siguen en la raíz (`/groups`, `/health`…); un helper probado (`apps/api/src/netlify.ts`) quita el prefijo `/api` antes de entregarle la petición a Hono. Así `createApp` no sabe dónde corre.
- **Una sola composición** (`apps/api/src/wiring.ts`) elige Supabase y R2 según las variables de entorno, y la usan el servidor local (`server.ts`) y la función. Sin las `R2_*` todo funciona menos los archivos, y el mensaje lo dice.
- **Qué variable va dónde.** El sitio recibe `SUPABASE_URL`, `SUPABASE_ANON_KEY` y las `R2_*`. `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` **nunca** salen del computador (solo `scripts/`), de acuerdo con la regla 3 de `CLAUDE.md`. `SECRETS_SCAN_OMIT_KEYS` deja pasar las dos públicas, que viajan al navegador a propósito.
- **Despliegue desde GitHub** (repositorio privado): cada push a `main` publica. Las **vistas previas están apagadas**: hay un solo proyecto de Supabase y un solo bucket (decisión 0004), y una vista previa tocaría los datos reales.
- **Las migraciones no se aplican en el despliegue**: `pnpm migrar` a mano, antes de publicar código que las necesite.
- **Antes de exponer la API en público** se puso un tope de **3 grupos por persona** (`MAX_GROUPS_PER_USER`, en el `core`, cuenta los grupos que administra la persona; unirse por invitación no cuenta).

## Consecuencias
- Pendientes que esto no resuelve: límite de peticiones por usuario (hoy el tope es solo de grupos), entornos `prueba` y `real` separados con vistas previas, respaldo semanal con GitHub Actions, PWA instalable y dominio propio.
- Netlify cuenta créditos por uso (funciones y transferencia); los archivos salen de R2, no de Netlify.
- Si algún día la API crece, la función única se puede partir sin tocar `apps/api`: solo cambia `function.ts` y el script de empaquetado.
